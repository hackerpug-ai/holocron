# HANDOFF — Holocron observability remediation plan (goal-ready)

**Written** 2026-08-24T23:30-06:00 by pi / implementer
**Repo** holocron · **Branch** main (local, BEHIND origin/main — work from origin/main) · **HEAD local** 103c4b35 · **HEAD origin/main** 14dfa263
**How to use this**: read §1–§2 (the executable plan), re-run §4 checks, then execute §2 tasks **on a branch off origin/main — never on laptop main**. Claims are labeled VERIFIED / CLAIMED / ASSUMED; raw evidence in §10.

**Staleness warning**: all local tree state was observed 2026-08-24T23:30-06:00. This repo has **concurrent in-flight work** (§4) — re-run the §4 commands before touching anything, and check for live agents first.

## 1. Mission

Remediate the Holocron platform observability layer per the assessment at `.handoff/observability-assessment-20260825-langfuse-planners.md`: wire the dead mastra→collector→Langfuse OTLP leg, make export failures loud (and stop the false `LANGFUSE_UNREACHABLE`), surface export health, add trace retention + backup coverage, and fix the worst instrumentation gaps (chat agent invisible to Langfuse, mission spans flat/orphaned, broken correlation). **Done** = all Phase A–D tasks landed on a branch with green pre-commit gates, deployed to the device, and spans **VERIFIED arriving in Langfuse** via the Observations API v2.

**Out of scope**: OBS-05 implementation (separate planned task, needs operator go-ahead — this plan only *updates its docs*); the brain agent-analytics layer (central-v2 DuckDB on inference1 — stays separate by design); changing `LANGFUSE_*` secret values; Braintrust; EAS client deploy.

## 2. Start Here

**First action**: read the assessment, then make a clean branch — do not touch laptop main (dirty, behind):

```bash
cd /Users/justinrich/Projects/holocron
git fetch origin
git switch -c obs-remediation origin/main
```

Then execute the goal task list below in order. Each task = one commit (green hooks). The done-gate is Phase E (deploy + live verify).

### Goal task list (map to set_goal_tasks / /goal-focus)

**Phase A — Config & deploy fixes (P0, smallest risk)**
- **A1. Wire the dead OTLP leg** — add to `mastra.environment` in `services/platform/deploy/compose/compose.yaml` (after ~line 112) AND `compose.dev.yaml`:
  ```yaml
  OTEL_COLLECTOR_URL: http://otel-collector:4318/v1/traces
  OTEL_COLLECTOR_METRICS_URL: http://otel-collector:8888/metrics
  ```
  AC: both files carry the vars; **`services/platform/src/observability/config.ts:91-95` defaults are NOT changed** (they are load-bearing for the restore harness `backup/langfuse-restore.ts:180-181` and integration tests `tests/integration/observability-otel-v4.test.ts:13-14`).
- **A2. Fix false `LANGFUSE_UNREACHABLE`** — `services/platform/src/observability/langfuse-exporter.ts` `flush()` (~225-243): run the Langfuse v2 confirmation (`GET /api/public/v2/observations?limit=1`, probe already at ~260-269) FIRST; treat metrics-unreachable as a *warning*, never an export failure. AC: unit test — healthy otel flush + unreachable metrics URL ⇒ no failure flag.
- **A3. Make export failures loud** — structured `logger.warn` (fields: `exportFailureCode`, `lastError`, `collectorUrl`, `exportedEvents`) on every `flush()` failure path in `langfuse-exporter.ts`, and replace the bare `catch {}` at `services/platform/src/mission/runtime.ts:3861-3866` (`flushMissionLangfuse`). AC: failure paths emit structured warn with those fields.
- **A4. Harden `renderCompose` placeholders** — `services/platform/src/deploy/production-release.ts` `renderCompose` (~942-1006): hard-force placeholders for ALL credential-shaped vars (mirror the DEEPSEEK/JINA/EXA pattern at ~1002-1006): `DATABASE_URL`, `MASTRA_API_KEY`, `FLEET_KEY`, `ZERO_ADMIN_PASSWORD`, `POSTGRES_PASSWORD`, `LANGFUSE_DATABASE_URL`, `LANGFUSE_NEXTAUTH_SECRET`, `LANGFUSE_SALT`, `LANGFUSE_ENCRYPTION_KEY`, `LANGFUSE_CLICKHOUSE_PASSWORD`, `LANGFUSE_S3_ACCESS_KEY_ID`, `LANGFUSE_S3_SECRET_ACCESS_KEY`, `LANGFUSE_REDIS_AUTH`, `LANGFUSE_POSTGRES_PASSWORD`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_INIT_USER_PASSWORD`, `LANGFUSE_AUTH_HEADER`. AC: `deploy:package` renders with a real `.env` present without the credential-literal scan refusal (`production-release.ts:494-504` regex).
- **A5. Config quick wins** — add `LANGFUSE_DEFAULT_TTL: "30"` to the `x-langfuse-env` anchor (`compose.yaml:15-45`); remove the `debug` exporter from the traces pipeline in `services/platform/deploy/otel/otel-collector-config.yaml` (~:35-36,56) or gate it behind an env flag (keep in canary `deploy/otel/compose.yaml`). AC: TTL set; production pipeline exports `otlphttp/langfuse` only.

**Phase B — Instrumentation (P0/P1)**
- **B1. Fix invalid chat traceId** — `services/platform/src/http/chat-runs.ts:231` stamps `chat:${runId}` (not a valid W3C traceId). Replace with a 32-hex value. AC: unit test asserts 32-hex.
- **B2. sessionId + env context on spans** — set `sessionId` = `runId`/conversationId in `bufferMissionModelCall` metadata (`langfuse-exporter.ts:348-392`); inject `environment`/`releaseSha`/`imageDigest` at startup (allowlist already permits them — `observability/config.ts:29-31`, never populated). AC: spans carry sessionId + env attrs.
- **B3. One mission root span per run** — root span wrapping all stages with real parent-child timing; `bufferMissionModelCall` nests under it (currently root+child share identical start/end times — no timing tree); unify traceId to `context.run.trace_id` (`mission/cycle.ts:462` vs `mission/runtime.ts:679-703`). AC: Langfuse shows one trace per mission run with nested generations and distinct timings.
- **B4. Register the chat agent** — chat runs a standalone `new Agent()` (`compat/cells/agent.ts:99-112`) never registered on the Observability-backed Mastra instance (`index.ts:77-90` has `agents: {}`); register it (and `http/chat-runs.ts:403-445` path) so agent/tool/generation spans flow through `Observability`. AC: chat turns emit spans (verifiable after deploy).
- **B5. Usage attrs on generations** — attach token usage + model cost (currently only in Postgres rows, `inference/telemetry.ts:1003-1010`) to the generation span metadata; extend allowlist with `tokens`/`cost`. AC: generations carry usage in Langfuse.

**Phase C — Health surface (P1)**
- **C1. Expose export health** — `readExportHealth`/`probeQueueSaturation` (`observability/export-health.ts:123-199`) have zero production callers (integration tests only). Register on `/health` (`http/health.ts`) or new `GET /observability/export-health` (`http/hono-app.ts:198-203` — exempt like `/health`). AC: endpoint returns queue depth/capacity/state; integration test passes.
- **C2. Periodic end-to-end probe** — reuse the existing v2 probe (`langfuse-exporter.ts:260-269`) on an interval → `export-health.ts` state. AC: probe runs and updates state.
- **C3. Collector hygiene** — add mastra `depends_on: otel-collector` (`service_started`) in compose; consider probing `:13133` health_check instead of `--version` (current exec-form healthcheck at `compose.yaml:447-451` only proves binary launch). AC: depends_on present.

**Phase D — Backup + docs (P1)**
- **D1. Backup coverage** — add a `[langfuse]` pgbackrest stanza for langfuse-postgres; cover `clickhouse-data`/`minio-data` (restic volume snapshot or ClickHouse export); **verify the existing pgbackrest `44112` stanza** (`deploy/compose/pgbackrest.conf:19-24`) against the internal-only topology (edge publishes only 44111) — may be stale. AC: backup topology covers langfuse volumes; restore drill passes on device.
- **D2. OBS-05 doc updates (docs only — do NOT implement)** — update `.spec/tasks/holocron-observability-console/OBS-05-serve-private-observability-path.md` with: collector `LANGFUSE_OTLP_ENDPOINT` must become `http://langfuse-web:3000/observability/api/public/otel` in the same release as the web rebuild (OTLP 4xx = non-retryable → silent span drop); langfuse-web healthcheck → `/observability/api/public/health` (else unhealthy cascade holds the collector); edge matcher pinned as `path_regexp ^/observability(/|$)` (Caddy `handle /observability` is prefix-based → matches `/observabilityevil`); external `NEXTAUTH_URL` (`https://holocron.tail011a51.ts.net:44111/observability/api/auth`) in device secrets + `production.env.example`; sign-out in the E2E matrix (known base-path bug class, langfuse#12035); dead-leg fix (A1) as a dependency; fix stale SPRINT.md ledger (OBS-01/02/04 landed, not 1/8). AC: task file + ledger updated, no implementation.

**Phase E — Deploy + live verify (the DONE GATE)**
- **E1. Commit & sync** — commit each task (never `--no-verify`); push to the device repo: `git push ssh://holocron/Users/holocron/Projects/holocron <sha>:refs/remotes/deploy/main`, then on device `git merge --ff-only <sha>`.
- **E2. Stage + apply ON DEVICE** (deploy commands must run on the device; laptop Colima is irrelevant): use the sanitized stage wrapper `/tmp/stage-sanitized-14dfa263.sh` (credential-literal trap workaround), then `holo deploy:apply --authorize --release <image-lock.json> --base-url "https://holocron.tail011a51.ts.net:44111" --target holocron --json`, then `holo deploy:verify --portable --json` (expect ok:True, serviceCount 12).
- **E3. LIVE VERIFY spans land in Langfuse** — after re-apply: `docker exec holocron-production-mastra-1 env | grep OTEL` shows the collector URLs; then confirm traces via the Langfuse Observations API v2 (`GET http://langfuse-web:3000/api/public/v2/observations?limit=1` with the Basic auth header from the collector env) returns rows; run one mission/chat to generate fresh spans; confirm no `LANGFUSE_UNREACHABLE` false alarms in logs. AC: fresh spans observable in Langfuse within minutes.

## 3. State of Play

- Assessment produced this session by 4 separate read-only agent sessions (all against `origin/main` 14dfa263); report at `.handoff/observability-assessment-20260825-langfuse-planners.md`. Findings below are `CLAIMED` by that assessment — re-verify the load-bearing ones.
- **Dead OTLP leg** — `CLAIMED` (assessment P2 F1/P3 F1, and prior handoff): mastra service env in `compose.yaml` has no `OTEL_COLLECTOR_URL`; `config.ts:91-95` defaults to `127.0.0.1:14318/18888` (dead in-container; collector listens at `otel-collector:4318` traces / `:8888` prometheus, zero host ports published). `MastraStorageExporter`→Postgres is the only live span sink. Verify live: `docker inspect holocron-production-mastra-1 --format "{{range .Config.Env}}{{println .}}{{end}}" | grep -iE "OTEL|LANG"` on the device (expect: empty).
- **Export failures are silent** — `CLAIMED` (assessment P2 F1): `OtelExporter` built with `logLevel:'error'` in `createObservability()` (`mastra.ts:48-63`) never installs the debug wrapper, so failures vanish into OTel's silent retry/drop; `flush()` resolves regardless.
- **False `LANGFUSE_UNREACHABLE`** — `CLAIMED` (assessment P2 F4): bridge `flush()` fetches the dead metrics URL after a successful otel flush, flipping `#exportFailed` on healthy exports.
- **Chat agent invisible** — `CLAIMED` (assessment P1 F1): `index.ts:77-90` has `agents: {}`; chat runs an unregistered standalone agent.
- **Retention/backup gaps** — `CLAIMED` (assessment P3 F4/F5): no `LANGFUSE_DEFAULT_TTL` anywhere; langfuse-postgres/clickhouse/minio volumes outside the pgbackrest/restic topology.
- **Landed (origin/main)** — `VERIFIED` at `14dfa263` via `git log`: `14dfa263` edge pass-through all routes; `bcb59e84` distroless collector healthcheck; `5d679b82` edge owns loopback 44111; `119bb515` OBS-04A fold Langfuse/collector into ReleaseLock v2; `0ac343fa` OBS-04B secret fail-closed; `d97e0821` HOSTNAME=0.0.0.0.
- **In progress**: nothing this session started beyond the assessment. Repo shows signs of **concurrent work by other sessions** (§4) — check before merging.

## 4. Perishable — Check Before Touching Anything

Observed 2026-08-24T23:30-06:00 (laptop). These expire in minutes.

- **Laptop main is DIRTY with ~54 files, including another party's mid-refactor work — do NOT commit on it, do NOT `git add -A`, do NOT `git stash pop` blindly.** Notable dirty files: `services/platform/src/transcripts/service.ts` (DELETED), `holocron-mcp/src/mastra/stdio.ts` (M), `services/platform/src/mcp/executor.ts` (M), `holocron-mcp/src/tools/creators.ts` (M), `services/platform/src/deploy/verify-production.ts` (M), `tests/unit/platform/transcribe-video-url.test.ts` (DELETED), several `sprint31-*` integration tests (M), `.tmp/GATE-FIX-S28R3-*` (M/untracked), `.spec/prds/fulcrum/*` + `mk6-migration/*` (M), `.pi/taskplane-config.json` (M). Full list in §10. **The working tree will likely FAIL `tsgo --noEmit`** (deleted `transcripts/service.ts` while imports may still reference it) — another reason to work from a clean branch off `origin/main`.
- **Stashes** (laptop main): `stash@{0}` = "wip: park unrelated OBS spec edits before kb-improvement-plan"; `stash@{1}` = "NOT goal-plan-writer: concurrent/pre-existing dirty tree stashed so blind precommit-gate can release. Restore: git stash pop. Plan lives outside repo at ~/.grok/sessions/.../goal/plan.md". Do not pop either without operator say-so.
- **Worktrees of interest** (status unknown): `.kb-run-sprint/worktrees/OBS-03`, `OBS-04`, `OBS-05`, `.rogueone/worktrees/OBS-04-TOPO`, `.claude/worktrees/imp-holocron-observability-1787249006`. **Before editing observability code, check for a live agent**: `ps aux | grep -iE "rogueone|kb-run-sprint|obs-05|goal-plan"` and ask the operator. ~50 total worktrees exist (mostly stale sprint debris).
- **Laptop main behind origin/main**: local `103c4b35` vs `origin/main` `14dfa263` (deploy fixes `14dfa263`/`bcb59e84`/`5d679b82` are NOT in local main).
- **Untracked** (not gitignored): `.handoff/handoff-20260824-2240-holocron-observability.md` and `.handoff/observability-assessment-20260825-langfuse-planners.md` (this plan's source).
- **Device `holocron`** (from prior handoff, ~1h old — re-verify): 12/12 `holocron-production-*` containers Up; mastra env has NO OTEL/LANG vars; collector reachable from mastra at `otel-collector:4318` (HTTP 404 = connection OK); sanitized stage wrapper `/tmp/stage-sanitized-14dfa263.sh`; stage artifacts `/tmp/CUTOVER-RELEASE-001/stage-14dfa263/`. Device repo `/Users/holocron/Projects/holocron` at 14dfa263 clean, deploy-artifact mods stashed as `pre-deploy-99323094...`.

**Uncommitted work risk**: the dirty laptop main means any naive `git add -A` / commit / stash-pop in a new session can destroy or mix another agent's in-flight changes. Work ONLY in `obs-remediation` off `origin/main`.

## 5. Decisions — Do Not Undo Without Reading

- **Do NOT change `config.ts` OTLP defaults** — `127.0.0.1:14318/18888` are load-bearing for the restore harness (`backup/langfuse-restore.ts:180-181` remaps `14318:4318`) and integration tests; fix via compose env override instead (A1).
- **Langfuse over Braintrust for app telemetry** — self-hosted, OTLP-native, fits the private tailnet zero-funnel posture; Braintrust rejected (spans-centric, traces-only OTLP 403s, lossy projection of native stores).
- **Traces-only pipeline** — logs/metrics intentionally not shipped to Langfuse; `failOnExportError=false` (external sink failure never takes down the app) — but failures MUST become visible (A3/C1).
- **Redaction is layered** — `HolocronRedactionProcessor` + `SensitiveDataFilter` + `HOLOCRON_ATTRIBUTE_ALLOWLIST`; the assessment recommends (P2, optional) allowing full prompt/output to Langfuse for this single-user app since it is the only debugging surface — deliberate, keep Postgres redaction.
- **Edge owns 127.0.0.1:44111; mastra publishes no loopback ports** — never re-publish 44111 on mastra; OBS-05 adds `/observability` matching.
- **HOSTNAME=0.0.0.0 for Langfuse web/worker** (Next.js standalone binds `$HOSTNAME`); **distroless collector healthcheck = exec form**; **secrets fail-closed `:?` in compose**.
- **Cross-layer stays separate** — platform telemetry (Langfuse + Postgres) vs brain agent analytics (central-v2 DuckDB); single pane of glass explicitly NOT wanted.

## 6. Dead Ends & Traps

- **Trap (live): credential-literal scan blocks legitimate stages.** `stageExactRelease` renders compose via `docker compose config` with real `.env` values in `process.env`; the scan regex (`production-release.ts:494-504`) refuses any render containing e.g. `postgres://user:pass@` or `sk-...`. Only DEEPSEEK/JINA/EXA are hard-forced to placeholders. Workaround exists: `/tmp/stage-sanitized-14dfa263.sh` on device (moves `.env`, `env -i`, EXIT-trap restore). **Proper fix = A4.** Symptom: `deploy:package refused: rendered Compose contains a credential literal`.
- **Trap: OTLP HTTP 4xx is non-retryable → silent span drop.** If the collector's `LANGFUSE_OTLP_ENDPOINT` becomes wrong (e.g. after OBS-05 moves the API under `/observability`), the collector drops spans without retry. Update endpoint + healthcheck in the same release (D2).
- **Trap: pre-commit gates are heavy.** Every commit runs lefthook: biome `--write` (root + holocron-mcp), `pnpm tsgo --noEmit`, `pnpm test:unit` (~569 tests). Never bypass with `--no-verify`. On the CURRENT dirty laptop main, tsgo likely fails from another party's mid-refactor — work from the clean branch.
- **Trap: `debug` exporter on the production collector** dumps every trace to stdout; when Langfuse is down it becomes a retry-dump firehose. Remove/gate it (A5).
- **Trap: git hook env leak into assimilate tests** — `git commit` exports `GIT_DIR/GIT_INDEX_FILE/...` into the hook env; assimilate fixture helpers' `git commit -qm init` wrote junk commits onto the parent branch (fixed via `isolatedGitEnv()` at `assimilate/acquire.ts`, d1864c9b). Don't reintroduce.
- **Dead end: `holo deploy:*` from the laptop** — deploy must run ON the device (Docker/Tailscale/secrets live there).
- **Trap: `chat:${runId}` is not a valid traceId** (`chat-runs.ts:231`) — any exporter that validates traceIds drops/errors on it. Fix in B1.

## 7. Blockers

- **OBS-05 implementation** — needs operator go-ahead (3–4 day planned task); this plan only updates its docs (D2).
- **Concurrent work in the tree** — verify no live agent owns the observability/transcripts/sprint-31 files before merging (ask operator; `ps aux | grep -iE "rogueone|kb-run-sprint|goal-plan"`).
- **Device secrets** — `LANGFUSE_*` values live in device `services/platform/config/secrets.yaml` (quoted; extract with `awk '{print $2}' | tr -d '"'`); never print them.
- **pgbackrest `44112` stanza verification** (D1) needs device access and may reveal a stale backup path.

## 8. Map — Pointers, Not Payloads

| What | Where |
|---|---|
| Assessment (source of this plan) | `.handoff/observability-assessment-20260825-langfuse-planners.md` |
| Prior deployed-state handoff | `.handoff/handoff-20260824-2240-holocron-observability.md` |
| OBS planning handoff (Aug 20) | `.handoff/handoff-20260820-1218-holocron-observability-planner.md` |
| Mastra observability composition root | `services/platform/src/mastra.ts:28-74` |
| Env config + load-bearing defaults | `services/platform/src/observability/config.ts:91-95` |
| OTLP bridge + flush false-failure | `services/platform/src/observability/langfuse-exporter.ts:225-243,348-392` |
| Export health (orphaned) | `services/platform/src/observability/export-health.ts:123-199` |
| Mission bridge / bare catch | `services/platform/src/mission/runtime.ts:3850-3866`, `mission-research.ts` |
| Redaction / allowlist | `services/platform/src/observability/redaction.ts` |
| Compose: langfuse anchor + collector + edge | `services/platform/deploy/compose/compose.yaml:15-45,360-452,473-493` |
| Collector pipeline | `services/platform/deploy/otel/otel-collector-config.yaml` |
| renderCompose placeholder bug | `services/platform/src/deploy/production-release.ts:494-504,942-1006` |
| Chat traceId bug | `services/platform/src/http/chat-runs.ts:231` |
| Chat agent unregistered | `services/platform/src/index.ts:77-90`, `compat/cells/agent.ts:99-112` |
| OBS-05 task (update only) | `.spec/tasks/holocron-observability-console/OBS-05-serve-private-observability-path.md` |
| Backup topology | `services/platform/deploy/compose/pgbackrest.conf` |
| OBS-05 / OBS-03 / OBS-04 worktrees | `.kb-run-sprint/worktrees/OBS-*` (check liveness before use) |

## 9. Environment & Bootstrap

**Build**: `pnpm install` · **Type-check**: `pnpm tsgo --noEmit` · **Unit tests**: `pnpm test:unit` · **All tests**: `pnpm test` (integration lanes `PLATFORM_IT`-gated) · **CLI**: `bun services/platform/src/cli/holo.ts`.
- **Deploy flow** (ON device `/Users/holocron/Projects/holocron`): stage via `bash scripts/stage-holocron-release.sh --source-revision <SHA> --out <dir> --previous-image <lockImage>` (use the sanitized wrapper `/tmp/stage-sanitized-14dfa263.sh`), then `holo deploy:apply --authorize --release <image-lock.json> --base-url "https://holocron.tail011a51.ts.net:44111" --target holocron --json`, then `holo deploy:verify --portable --json`.
- **Sync to device**: `git push ssh://holocron/Users/holocron/Projects/holocron <SHA>:refs/remotes/deploy/main`; on device `git merge --ff-only <SHA>`.
- **Required env (names only)**: `HOLO_SECRETS_PATH` + `HOLO_SECRET_STORE_ROOT` (deploy), `FLEET_URL=http://host.docker.internal:4545`, `LANGFUSE_*` per compose `:?` contract, `HOLO_PLATFORM_IMAGE=localhost:5000/holocron-platform@sha256:<64-hex>`, `HOLO_POSTGRES_VOLUME=holocron-postgres`.
- **Device SSH**: `ssh holocron`; non-interactive shells need `export PATH=/usr/local/bin:/opt/homebrew/bin:/Users/holocron/.bun/bin:/usr/bin:/bin` (docker lives at /usr/local/bin).
- **Constraints**: never `docker compose down -v` (8 volumes are state); never publish extra host ports for langfuse/collector; never bypass pre-commit hooks; never work on laptop main; never print `LANGFUSE_*` values.
- **Not run this session**: no build/typecheck/test executed this session (read-only assessment). The earlier (22:40) handoff VERIFIED `deploy:verify --portable` → ok:True, serviceCount 12, two rounds.

## 10. Evidence Appendix

Sweep output (laptop, 2026-08-24T23:30-06:00), verbatim:

```
$ git rev-parse --short HEAD        → 103c4b35
$ git branch --show-current         → main
$ git status --porcelain=v1         → (see §4; 54 files: fulcrum/mk6 PRDs M, .tmp/GATE-FIX-* M,
                                       transcripts/service.ts D, transcribe-video-url.test.ts D,
                                       holocron-mcp/src/mastra/stdio.ts M, mcp/executor.ts M,
                                       tools/creators.ts M, verify-production.ts M,
                                       sprint31-* tests M, .pi/taskplane-config.json M)
$ git log --oneline -15 (local)
103c4b35 fix(rogone): point reviewer at registered openrouter deepseek model
12c9716c fix(ci): exclude .firecrawl and .pi runtime state from biome lint
36fc212f fix(assimilate): hermetic git fixtures against inherited GIT_DIR
99323094 feat(transcripts): port YouTube caption fetch to transcribe_video_url MCP tool
d1864c9b fix(assimilate): isolate fixture git ops from pre-commit hook env
062da66e docs: research handoff — holocron deep-research service vs agent-driven skill comparison
c8c82414 fix: synthesis uses the synthesis role with a real budget; raise entailment cap
26621188 fix: disable thinking on fleet chat models — reasoning preamble truncated every extraction
8c14d188 fix: raise claim-extraction output cap to 4096 — 2048 truncated every JSON
67e6d24a fix: deep-research fleet unavailability — router roles, extraction budget, output caps
14a6a1c2 chore: swap implementer and reviewer routing
bd14ec4a chore: centralize rogueone agent routing targets
d97e0821 fix(deploy): bind Langfuse web/worker to 0.0.0.0 so loopback healthchecks pass
5f338156 chore: gitignore rogueone runtime output dirs (runs/, worktrees/)
3266f453 fix: serve rerank, admit real evidence, terminalize research phase
$ git diff --stat → 54 files changed, 323 insertions(+), 1014 deletions(-)  (see §4 for notable files)
$ git diff --cached --stat → (empty)
$ git stash list
stash@{0}: On main: wip: park unrelated OBS spec edits before kb-improvement-plan
stash@{1}: On main: NOT goal-plan-writer: concurrent/pre-existing dirty tree stashed so blind
           precommit-gate can release. Restore: git stash pop. Plan lives outside repo at
           ~/.grok/sessions/.../goal/plan.md
$ git worktree list → main at 103c4b35; OBS-03/04/05 worktrees exist (.kb-run-sprint/worktrees/OBS-*);
                       .rogueone/worktrees/OBS-04-TOPO; imp-holocron-observability-1787249006;
                       ~50 total (mostly stale sprint debris)
$ git ls-files .handoff/ → 4 tracked handoffs (20260818-1608, 20260819-1919, 20260820-1218,
                       20260824-1915); the 20260824-2240 + assessment files are untracked
```

origin/main = `14dfa263` (verified via `git fetch origin` at 23:00; HEAD of origin/main:
`14dfa263 fix(deploy): edge must pass through all platform routes, not just /health`).

Device live state (from the 22:40 handoff, CLAIMED — re-verify): mastra env has NO OTEL/LANG vars;
collector env has `LANGFUSE_OTLP_ENDPOINT=http://langfuse-web:3000/api/public/otel` + `LANGFUSE_AUTH_HEADER=Basic <b64>`;
collector reachable from mastra (HTTP 404); no host ports published for langfuse/collector.
