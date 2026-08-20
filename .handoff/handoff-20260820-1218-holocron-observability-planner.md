# HANDOFF — Holocron observability actionable-plan review

**Written** 2026-08-20T18:18:24Z by Codex/GPT-5
**Repo** holocron · **Branch** main · **HEAD** 6c4d6ad2
**How to use this**: read §1–§2, run the checks in §4, then start at §2.
Claims are labeled VERIFIED / CLAIMED / ASSUMED — re-verify anything not VERIFIED
before you rely on it. Raw evidence is in §10.

**Staleness warning:** §4 records live services, stashes, and many retained worktrees
observed at 2026-08-20T18:18:24Z. Re-run those commands before creating a branch,
editing a shared file, or stopping any process.

**Final freshness recheck:** At 2026-08-20T18:22:54Z the relevant service PIDs,
ports, two stashes, root worktree, and observability-improvement worktree still matched
§4; the only root change was this untracked handoff file — **VERIFIED**.

## 1. Mission

Produce an **actionable** Holocron observability implementation plan by auditing and
refining the existing observability PRD and its eight tasks. Done means a fresh
implementer can execute the plan without inventing file ownership, dependency/API
versions, migration boundaries, rollout order, verification commands, capacity gates,
or real-service evidence requirements.

The user explicitly said: **“do not stop till we have an actionable plan.”** Do not
return “a plan already exists” as the result. Treat the existing documents as draft
inputs and either tighten them in place or produce a concrete actionability report that
names every required edit.

**Out of scope**: production implementation, deployment, process termination, network
changes, secret-value access or rotation, destructive Git/worktree/stash operations,
and claims that the hosted service is healthy without fresh live proof.

## 2. Start Here

First run:

```bash
cd /Users/justinrich/Projects/holocron
git status --short --branch
sed -n '1,365p' .spec/prd/holocron-observability-console/README.md
for f in .spec/tasks/holocron-observability-console/*.md; do
  printf '\n===== %s =====\n' "$f"
  sed -n '1,240p' "$f"
done
```

Then:

1. Read `/Users/justinrich/Projects/brain/docs/ROOT-CONTEXT.md`, this repo's
   `AGENTS.md`, and `/Users/justinrich/Projects/brain/docs/OBSERVABILITY_PLAN.md`.
2. Audit each OBS task against current code. Add exact files in scope, dependency and
   image pins to resolve, migrations/read models, API/auth contracts, concrete real
   verification commands, expected artifacts, rollback/backup boundaries, and overlap
   coordination with the active S33 worktrees.
3. Preserve the existing order: OBS-01 first; telemetry and deployment lanes may then
   proceed in parallel; MCP work follows correlated signals; real hosted QA closes the
   initiative.
4. Commit only planning artifacts. Do not implement, deploy, or touch live processes.

The plan must explicitly answer these implementation questions:

- Which supported Mastra/Langfuse OTLP v4 integration and compatible pinned versions
  replace the custom legacy ingestion exporter?
- Which exact production Compose/release/preflight/backup files change when Langfuse
  becomes part of the immutable hosted release?
- How is a custom Langfuse web image built and pinned for `/observability`, and which
  deterministic edge route preserves all existing API/MCP/health paths?
- What schema/view/indexes normalize mission, chat, inference, deployment, health, and
  exporter events into `service_event_feed_v1`?
- What is the exact `query_service_events` input/output/auth/redaction contract, and
  which manifest/HTTP/stdio compatibility files change from 44 to 45 tools?
- Which commands and real services prove success, degradation, recovery, restart,
  backup, isolated restore, browser deep links, and MCP/database parity?

## 3. State of Play

- The observability PRD and task set landed in commit `77605a8a`, which is an ancestor
  of current `main` — **VERIFIED** at `6c4d6ad2` with
  `git merge-base --is-ancestor 77605a8a HEAD` → exit 0.
- The task directory contains nine Markdown files: one sprint manifest and eight tasks;
  every status is `Planned` — **VERIFIED** with
  `rg -n '^\*\*Status:\*\*' .spec/tasks/holocron-observability-console/*.md`.
- The tasks have objectives and acceptance criteria but no explicit files-in-scope or
  exact verification-command sections — **VERIFIED** with the actionability-field grep
  in §10, which returned no matches. This is the immediate planning gap.
- Mastra local storage and sensitive-data filtering already exist, but the Langfuse
  exporter is custom and posts to `/api/public/ingestion` — **VERIFIED** at
  `services/platform/src/mastra.ts:1-74` and
  `services/platform/src/observability/langfuse-exporter.ts:7,373`.
- `@mastra/langfuse`, `/api/public/otel`, `query_service_events`,
  `service_event_feed_v1`, and `NEXT_PUBLIC_BASE_PATH` have no production source match
  in the inspected paths — **VERIFIED** by the source-gap grep in §10.
- A Langfuse Compose overlay, pinned web/worker image digests, supervisor support, and
  durable Langfuse volumes already exist — **VERIFIED** at
  `services/platform/deploy/compose/langfuse.compose.yaml` and
  `services/platform/src/stack/supervisor.ts:168-340`.
- The Langfuse overlay still contains fallback/default database credentials, salts,
  encryption material, object-store credentials, and Redis secrets — **VERIFIED** by
  the exact line matches in §10. The actionable plan must remove production fallbacks
  and fail closed on missing secret names.
- The production Compose file remains the four-service application topology
  (`postgres`, `mastra`, `scheduler`, `zero-cache`); Langfuse remains a separate overlay
  — **VERIFIED** by the compose grep in §10.
- The canonical platform registry is still documented as the 44-tool compatibility
  surface; the requested event-query tool does not exist — **VERIFIED** at
  `services/platform/src/tools/registry.ts:124,610` and the source-gap grep.
- No process was listening on local port 3100 at 2026-08-20T18:18:24Z — **VERIFIED**
  with `lsof -nP -iTCP:3100 -sTCP:LISTEN`. This is local-machine evidence only; it says
  nothing about the hosted tailnet service.

**Landed**: `77605a8a docs: plan Holocron observability console`.

**In progress**: No observability implementation is in progress in the clean terminal
improvement worktree. Existing S33 worktrees remain present and may overlap MCP executor
and inference-telemetry files; confirm ownership before assigning files.

**Broken**: No fresh hosted observability test was run in this session. Do not claim
the hosted console, ingestion, event query, or recovery path works. The source-level
legacy ingestion path and missing event-query symbols are verified gaps, not live failure
receipts.

## 4. Perishable — Check Before Touching Anything

- At 2026-08-20T18:18:24Z, PIDs 74066 (`holo service:up`), 74282
  (`scheduler-worker.ts`), and 74695 (`zero-cache`) were running from this checkout —
  **VERIFIED** with the process command in §10. Do not stop or restart them for planning.
- At that time, ports 4111, 4545, 4848, and 5432 had listeners; 3100 and 55433 did
  not — **VERIFIED** with the port sweep in §10. Re-check before relying on any result.
- `git stash list` showed two stashes, including a `lefthook auto backup` and an older
  concurrent/pre-existing-tree stash — **VERIFIED** in §10. Ownership is unknown; do
  not pop, drop, rename, or inspect secret-bearing content without authorization.
- Many retained worktrees exist, including S33 MCP and platform tasks — **VERIFIED**
  by `git worktree list` in §10. Do not remove/prune them or start a competing writer
  until file ownership is reconciled.
- `.kb-run-sprint/state.json` identified Sprint 33 and reported two blocked entries in
  the simple summary query — **VERIFIED** at 2026-08-20T18:18:24Z. The state schema did
  not expose useful task IDs in that query; use the project's status tooling rather
  than hand-editing this file.
- The prior observability improvement worktree is clean at branch
  `improvement/imp-holocron-observability-1787249006-holocron-observability` —
  **VERIFIED** with `git -C <path> status --short --branch`. Its durable workflow state
  is terminal `not-an-improvement`; do not treat it as an implementation branch.

**Uncommitted work**: clean tree — **VERIFIED** at 2026-08-20T18:17:53Z with
`git status --porcelain=v1` → no output. Re-check immediately before creating or
committing planning changes.

## 5. Decisions — Do Not Undo Without Reading

- **Langfuse is the selected LLM/agent investigation console, not the operational
  system of record** — Mastra supplies instrumentation; first-party Postgres events and
  health remain authoritative. This prevents vendor retention/schema from becoming the
  only source of service truth.
- **Same release, not same image** — Langfuse is a multi-process stack with separate
  web, worker, ClickHouse, Redis, object storage, and PostgreSQL lifecycles. Ship it as
  separate pinned services in Holocron's immutable release.
- **One private path is `/observability`** — the plan uses a pinned custom Langfuse web
  build with its base path set at build time plus a deterministic edge route. Preserve
  existing tailnet-only access.
- **The service-event query reads a first-party versioned Postgres read model** — do not
  query Docker logs or Langfuse private tables. Return trace deep links while keeping
  the event contract vendor-neutral.
- **The tool addition is an intentional 44→45 compatibility change** — update the
  canonical registry, manifest, executor, HTTP transport, platform stdio transport,
  legacy stdio delegate where applicable, and parity sweeps together.
- **OBS-01 is a real gate, not paperwork** — establish exact source/installed/hosted
  identities, compatible versions, and mini capacity before implementation begins.
- **Real-service proof is mandatory** — no mock database, fake HTTP sink, canned trace,
  in-memory filesystem, or skipped runtime path closes any task.

## 6. Dead Ends & Traps

- **Tried**: the `kb-improvement-plan` workflow was asked to create another
  observability improvement plan. Its investigator returned `not-an-improvement`
  because commit `77605a8a` already contains the requested PRD/tasks. This meant
  “do not duplicate planning artifacts,” **not** “there is no engineering work.” Do not
  repeat that terminal interpretation; the user now requires the existing plan to be
  made actionable.
- **Trap**: partial plumbing looks deceptively complete. A custom exporter, Compose
  overlay, supervisor probe, and durable telemetry tables exist, but the supported OTLP
  v4 exporter, integrated production release, `/observability` path, event read model,
  45th tool, and fresh hosted proof do not exist in the searched production surfaces.
- **Trap**: source-landed, installed, running, ingesting, UI-queryable, and recoverable
  are separate states. Never collapse them into “observability works.”
- **Trap**: the current exporter uses `failOnExportError: true`; the actionable plan must
  explicitly decide and test degradation behavior so Langfuse loss is visible without
  silently converting a telemetry outage into a full product outage.
- **Trap**: the missing `MINIMAL-DIFF-DISCIPLINE.md` and missing historical umbrella-spec
  path were documentation drift encountered by the prior workflow. Preserve minimal
  file ownership and no-stub gates using current project instructions; do not block this
  plan on those stale pointers.

## 7. Blockers

There is no known blocker to producing the actionable plan. Unknown compatible package
versions, target-mini capacity, current hosted identity, and overlap with retained S33
work are facts the plan must assign to OBS-01 or resolve read-only; they are not reasons
to stop planning.

Implementation remains blocked on explicit user authorization after the plan is accepted.
Do not deploy, rotate credentials, or mutate live services during planning.

## 8. Map — Pointers, Not Payloads

| What | Where |
|---|---|
| Existing PRD | `.spec/prd/holocron-observability-console/README.md` |
| Existing task graph | `.spec/tasks/holocron-observability-console/SPRINT.md` |
| Baseline gate | `.spec/tasks/holocron-observability-console/OBS-01-reconcile-baseline-and-pin-contracts.md` |
| Mastra→Langfuse work | `.spec/tasks/holocron-observability-console/OBS-02-adopt-mastra-langfuse-otel-v4.md` |
| Logs/metrics/health | `.spec/tasks/holocron-observability-console/OBS-03-add-correlated-signals-and-health.md` |
| Langfuse production topology | `.spec/tasks/holocron-observability-console/OBS-04-productionize-langfuse-topology.md` |
| Private path | `.spec/tasks/holocron-observability-console/OBS-05-serve-private-observability-path.md` |
| Event feed/tool | `.spec/tasks/holocron-observability-console/OBS-MCP-01-build-service-event-feed.md` |
| Tool compatibility | `.spec/tasks/holocron-observability-console/OBS-MCP-02-version-manifest-and-prove-parity.md` |
| Real hosted proof | `.spec/tasks/holocron-observability-console/OBS-QA-01-prove-live-end-to-end.md` |
| Mastra composition root | `services/platform/src/mastra.ts:1-74` |
| Legacy exporter | `services/platform/src/observability/langfuse-exporter.ts:1-500` |
| Existing Langfuse overlay | `services/platform/deploy/compose/langfuse.compose.yaml` |
| Production Compose | `services/platform/deploy/compose/compose.yaml` |
| Image locks | `services/platform/deploy/compose/image-lock.json` |
| Stack supervisor | `services/platform/src/stack/supervisor.ts:168-340` |
| Canonical tool registry | `services/platform/src/tools/registry.ts:108-449` |
| MCP executor | `services/platform/src/mcp/executor.ts` |
| MCP gateway | `services/platform/src/mcp/gateway.ts` |
| Durable inference schema | `services/platform/src/db/schema/inference.ts:13-50` |
| Durable mission events | `services/platform/src/db/schema/mission.ts:276-295` |
| Terminal improvement state | `/Users/justinrich/.config/brain/improvements/imp-holocron-observability-1787249006.json` |

## 9. Environment & Bootstrap

**Build**: `pnpm build` is required by project instructions, but no root `build`
script is present in the inspected `package.json`; the planner must assign the actual
platform/release build commands per task rather than copy an invalid generic command.

**Typecheck**: `pnpm typecheck` · **Unit tests**: `pnpm test:unit` · **Integration**:
`pnpm test:integration` · **Live tests**: `pnpm test:live` · **Run platform**:
`pnpm server:dev`.

These commands were **VERIFIED as declared scripts** with `jq '.scripts' package.json`.
They were **not run in this handoff session**. The earlier planning commit passed its
then-current pre-commit typecheck and unit-test gates, but that result is historical and
must not be reused as current verification.

Credential names only: `DATABASE_URL`, `FLEET_URL`, `FLEET_KEY`,
`LANGFUSE_BASE_URL`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`,
`LANGFUSE_SALT`, `LANGFUSE_ENCRYPTION_KEY`, `NEXTAUTH_SECRET`, and the Langfuse
initialization/object-store/Redis/PostgreSQL names declared in the Compose and secret
index. Never place values in the plan, logs, argv, evidence, or handoff.

Project constraints: read `AGENTS.md`; preserve dirty/protected worktrees and live
processes; use the Mastra planning/review suite for platform work and the MCP suite for
tool/protocol work; every required behavior must have deterministic gates and real-service
proof; planning alone authorizes no implementation or deployment.

## 10. Evidence Appendix

### Git sweep — 2026-08-20T18:17:53Z

```text
$ git rev-parse --short HEAD
6c4d6ad2
$ git branch --show-current
main
$ git status --porcelain=v1

$ git log --oneline -15
6c4d6ad2 save
4320781b chore: initialize RogueOne loop configuration
77605a8a docs: plan Holocron observability console
bba5bcb9 fix(mcp): follow creator transcript relationships
2bb40df6 fix(mcp): persist shop best-deal listing id
3bd291b2 fix(mcp): translate toolbelt completion status
dc3b5008 fix(mcp): fetch and persist subscription feeds
0aa6d7ec fix(mcp): serialize research relevance as number
5e88d5e2 fix(CUTOVER-RELEASE-001): overlay FLEET_URL for container-reachable deploy
3bddabc9 fix(CUTOVER-RELEASE-001): deploy verify from exact-SHA archive trees
5e22bfcc style(CUTOVER-RELEASE-001): biome wrap renderCompose env
946ea848 fix(CUTOVER-RELEASE-001): supply Compose render placeholders for staging
ac14ad4b style(CUTOVER-RELEASE-001): biome wrap on stageExactRelease helpers
2a9c1727 feat(CUTOVER-RELEASE-001): GREEN exact-SHA stage/package with backup runner
3403cc3f test(CUTOVER-RELEASE-001): RED exact-SHA release staging contracts
$ git diff --stat

$ git diff --cached --stat

$ git stash list
stash@{0}: lefthook auto backup
stash@{1}: On main: NOT goal-plan-writer: concurrent/pre-existing dirty tree stashed so blind precommit-gate can release. Restore: git stash pop. Plan lives outside repo at ~/.grok/sessions/.../goal/plan.md
```

### Worktrees — 2026-08-20T18:17:53Z

```text
$ git worktree list
/Users/justinrich/Projects/holocron  6c4d6ad2 [main]
/private/tmp/holocron-mcp-creator-bba5bcb9/repo  bba5bcb9 (detached HEAD)
/private/tmp/holocron-mcp-feed-dc3b5008/repo  dc3b5008 (detached HEAD)
/private/tmp/holocron-mcp-fix-0aa6d7ec/repo  0aa6d7ec (detached HEAD)
/private/tmp/holocron-mcp-shop-2bb40df6/repo  2bb40df6 (detached HEAD)
/private/tmp/holocron-mcp-tool-status-3bd291b2/repo  3bd291b2 (detached HEAD)
/Users/justinrich/Projects/holocron/.claude/worktrees/imp-holocron-observability-1787249006-holocron-observability  6c4d6ad2 [improvement/imp-holocron-observability-1787249006-holocron-observability]
/Users/justinrich/Projects/holocron/.claude/worktrees/imp-mk6-functional-completeness-1786837297-mk6-functional-completeness  1080dfad [improvement/imp-mk6-functional-completeness-1786837297-mk6-functional-completeness]
/Users/justinrich/Projects/holocron/.claude/worktrees/imp-mk6-functional-completeness-1786837297-mk6-functional-completeness/.kb-run-sprint/worktrees/imp-mk6-functional-completeness-1786837297-mk6-functional-completeness  43fc7301 [kb-run-sprint/imp-mk6-functional-completeness-1786837297/imp-mk6-functional-completeness-1786837297-mk6-functional-completeness]
/Users/justinrich/Projects/holocron/.claude/worktrees/mcp-sqlite-local-embed  85c49b0a [mcp-sqlite-local]
/Users/justinrich/Projects/holocron/.kb-run-sprint/worktrees/CUTOVER-RELEASE-001  5e88d5e2 [kb-run-sprint/holocron-device-mcp-cutover/CUTOVER-RELEASE-001]
/Users/justinrich/Projects/holocron/.kb-run-sprint/worktrees/EXTERNAL-FIX-S33-MCP-01-TDD-LINEAGE  aaa12b9e [kb-run-sprint/sprint-33-fleet-routing-and-deployed-service-restoration/EXTERNAL-FIX-S33-MCP-01-TDD-LINEAGE]
/Users/justinrich/Projects/holocron/.kb-run-sprint/worktrees/MK6-DATA-001  ad7cdf9a [kb-run-sprint/imp-mk6-functional-completeness-1786837297/MK6-DATA-001]
/Users/justinrich/Projects/holocron/.kb-run-sprint/worktrees/MK6-DATA-001-COMPOSITE  1a360b65 [kb-run-sprint/holocron-device-mcp-cutover/MK6-DATA-001-COMPOSITE]
/Users/justinrich/Projects/holocron/.kb-run-sprint/worktrees/MK6-HOST-001  51205097 [kb-run-sprint/imp-mk6-functional-completeness-1786837297/MK6-HOST-001]
/Users/justinrich/Projects/holocron/.kb-run-sprint/worktrees/S33-MCP-01  2d89ebaa [kb-run-sprint/sprint-33-fleet-routing-and-deployed-service-restoration/S33-MCP-01]
/Users/justinrich/Projects/holocron/.kb-run-sprint/worktrees/S33-MCP-02  0d000565 [kb-run-sprint/sprint-33-fleet-routing-and-deployed-service-restoration/S33-MCP-02]
/Users/justinrich/Projects/holocron/.kb-run-sprint/worktrees/S33-MCP-02-r2  3ce047dc [kb-run-sprint/sprint-33-fleet-routing-and-deployed-service-restoration/S33-MCP-02-r2]
/Users/justinrich/Projects/holocron/.kb-run-sprint/worktrees/S33-MCP-02/.tmp/D07-02/pinned-fallback-worktree  25414ad1 (detached HEAD)
/Users/justinrich/Projects/holocron/.kb-run-sprint/worktrees/S33-OPS-01  e2307a4b [kb-run-sprint/sprint-33-fleet-routing-and-deployed-service-restoration/S33-OPS-01]
/Users/justinrich/Projects/holocron/.kb-run-sprint/worktrees/S33-OPS-02  4571ac29 [kb-run-sprint/sprint-33-fleet-routing-and-deployed-service-restoration/S33-OPS-02]
/Users/justinrich/Projects/holocron/.kb-run-sprint/worktrees/S33-OPS-03  0892b96a [kb-run-sprint/sprint-33-fleet-routing-and-deployed-service-restoration/S33-OPS-03]
/Users/justinrich/Projects/holocron/.kb-run-sprint/worktrees/S33-OPS-04  2c176b61 [kb-run-sprint/sprint-33-fleet-routing-and-deployed-service-restoration/S33-OPS-04]
/Users/justinrich/Projects/holocron/.kb-run-sprint/worktrees/S33-OPS-05  8c2ccf6d [kb-run-sprint/sprint-33-fleet-routing-and-deployed-service-restoration/S33-OPS-05]
/Users/justinrich/Projects/holocron/.kb-run-sprint/worktrees/S33-PLAT-01  d25c9679 [kb-run-sprint/sprint-33-fleet-routing-and-deployed-service-restoration/S33-PLAT-01]
/Users/justinrich/Projects/holocron/.kb-run-sprint/worktrees/S33-PLAT-02  638d4796 [kb-run-sprint/sprint-33-fleet-routing-and-deployed-service-restoration/S33-PLAT-02]
/Users/justinrich/Projects/holocron/.kb-run-sprint/worktrees/S33-PLAT-03  8740fb96 [kb-run-sprint/sprint-33-fleet-routing-and-deployed-service-restoration/S33-PLAT-03]
/Users/justinrich/Projects/holocron/.kb-run-sprint/worktrees/S33-PLAT-05  53e721b9 [kb-run-sprint/sprint-33-fleet-routing-and-deployed-service-restoration/S33-PLAT-05]
/Users/justinrich/Projects/holocron/.kb-run-sprint/worktrees/S33-PLAT-05-compose-project-fix  496dd88d [kb-run-sprint/sprint-33-fleet-routing-and-deployed-service-restoration/S33-PLAT-05-compose-project-fix]
/Users/justinrich/Projects/holocron/.kb-run-sprint/worktrees/S33-PLAT-05-multicall-impl  0c0809b4 [kb-run-sprint/sprint-33-fleet-routing-and-deployed-service-restoration/S33-PLAT-05-multicall-impl]
/Users/justinrich/Projects/holocron/.kb-run-sprint/worktrees/S33-PLAT-05-multicall-spec-repair  31182790 [spec-repair/s33-plat-05-multicall-accounting]
/Users/justinrich/Projects/holocron/.kb-run-sprint/worktrees/S33-PLAT-05-r3-main  ca7b6f34 [kb-run-sprint/sprint-33-fleet-routing-and-deployed-service-restoration/S33-PLAT-05-r3-main]
/Users/justinrich/Projects/holocron/.kb-run-sprint/worktrees/S33-PLAT-05-r4-main  56e599be [kb-run-sprint/sprint-33-fleet-routing-and-deployed-service-restoration/S33-PLAT-05-r4-main]
/Users/justinrich/Projects/holocron/.kb-run-sprint/worktrees/S33-PLAT-05-ruby26-fix  f9185bc1 [kb-run-sprint/sprint-33-fleet-routing-and-deployed-service-restoration/S33-PLAT-05-ruby26-fix]
/Users/justinrich/Projects/holocron/.kb-run-sprint/worktrees/S33-PLAT-05-SPEC-REPAIR-C2  10196817 [spec-repair/s33-plat-05-predeploy-c2]
/Users/justinrich/Projects/holocron/.kb-run-sprint/worktrees/SPEC-REPAIR-PLAT  96d5c80a [kb-run-sprint/holocron-device-mcp-cutover/SPEC-REPAIR-PLAT]
/Users/justinrich/Projects/holocron/.kb-run-sprint/worktrees/SPEC-REPAIR-S33-OPS-01-TC2-VERIFY  aba773bd [kb-run-sprint/sprint-33-fleet-routing-and-deployed-service-restoration/SPEC-REPAIR-S33-OPS-01-TC2-VERIFY]
/Users/justinrich/Projects/holocron/.kb-run-sprint/worktrees/SPEC-REPAIR-S33-OPS-01-TEST-REALITY  1dc68303 [kb-run-sprint/sprint-33-fleet-routing-and-deployed-service-restoration/SPEC-REPAIR-S33-OPS-01-TEST-REALITY]
/Users/justinrich/Projects/holocron/.kb-run-sprint/worktrees/SPEC-REPAIR-S33-OPS-01-VERIFY  02104b1b [kb-run-sprint/sprint-33-fleet-routing-and-deployed-service-restoration/SPEC-REPAIR-S33-OPS-01-VERIFY]
/Users/justinrich/Projects/holocron/.kb-run-sprint/worktrees/SPEC-REPAIR-S33-OPS-02-EVIDENCE-RUNS  c1b2d28d [SPEC-REPAIR-S33-OPS-02-EVIDENCE-RUNS]
/Users/justinrich/Projects/holocron/.kb-run-sprint/worktrees/SPEC-REPAIR-S33-OPS-02-REVIEWER-TOPOLOGY  cc01a94c [kb-run-sprint/sprint-33-fleet-routing-and-deployed-service-restoration/SPEC-REPAIR-S33-OPS-02-REVIEWER-TOPOLOGY]
/Users/justinrich/Projects/holocron/.kb-run-sprint/worktrees/SPEC-REPAIR-S33-OPS-02-TC3-LIVE-VERIFY  256c28d6 [kb-run-sprint/sprint-33-fleet-routing-and-deployed-service-restoration/SPEC-REPAIR-S33-OPS-02-TC3-LIVE-VERIFY]
/Users/justinrich/Projects/holocron/.kb-run-sprint/worktrees/SPEC-REPAIR-S33-OPS-03-PID1-ENV  c60b2ffc [kb-run-sprint/sprint-33-fleet-routing-and-deployed-service-restoration/SPEC-REPAIR-S33-OPS-03-PID1-ENV]
/Users/justinrich/Projects/holocron/.kb-run-sprint/worktrees/SPEC-REPAIR-S33-OPS-04-VERIFY  566448f5 [kb-run-sprint/sprint-33-fleet-routing-and-deployed-service-restoration/SPEC-REPAIR-S33-OPS-04-VERIFY]
/Users/justinrich/Projects/holocron/.kb-run-sprint/worktrees/tt-028-spec-repair-lifecycle  a29678a5 [kb-run-sprint/imp-mk6-functional-completeness-1786837297/tt-028-spec-repair-lifecycle]
```

### Actionability and source-gap checks — 2026-08-20T18:18:24Z

```text
$ rg -n "Files in scope|files_in_scope|Verification commands|Exact command|Migration|Worktree overlap|Capacity result" .spec/tasks/holocron-observability-console
(no matches)

$ rg -n "api/public/ingestion|api/public/otel|@mastra/langfuse|query_service_events|service_event_feed_v1|NEXT_PUBLIC_BASE_PATH" services/platform/src services/platform/package.json services/platform/deploy holocron-mcp/src --glob '!**/*.test.*'
services/platform/src/observability/langfuse-exporter.ts:7: * Uses Langfuse public ingestion API (POST /api/public/ingestion) with Basic auth.
services/platform/src/observability/langfuse-exporter.ts:373:    const url = `${this.baseUrl}/api/public/ingestion`;

$ rg -n "postgres:postgres|mysalt|mysecret|miniosecret|myredissecret|0000000000000000000000000000000000000000000000000000000000000000" services/platform/deploy/compose/langfuse.compose.yaml
36:      DATABASE_URL: postgresql://postgres:postgres@postgres:5432/postgres
37:      SALT: ${LANGFUSE_SALT:-mysalt}
38:      ENCRYPTION_KEY: ${LANGFUSE_ENCRYPTION_KEY:-0000000000000000000000000000000000000000000000000000000000000000}
50:      LANGFUSE_S3_EVENT_UPLOAD_SECRET_ACCESS_KEY: miniosecret
57:      LANGFUSE_S3_MEDIA_UPLOAD_SECRET_ACCESS_KEY: miniosecret
64:      REDIS_AUTH: myredissecret
75:      NEXTAUTH_SECRET: ${NEXTAUTH_SECRET:-mysecret}
128:      MINIO_ROOT_PASSWORD: miniosecret
146:      --requirepass myredissecret
153:      test: ["CMD", "redis-cli", "-a", "myredissecret", "ping"]
```

### Live-process and port sweep — 2026-08-20T18:18:24Z

```text
$ ps -axo pid,ppid,etime,command | rg '/Users/justinrich/Projects/holocron/(services/platform|node_modules/.bin/zero-cache)|holocron-langfuse' | rg -v 'rg '
74066     1    01:35:41 /Users/justinrich/.bun/bin/bun /Users/justinrich/Projects/holocron/services/platform/src/cli/holo.ts service:up
74282     1    01:35:41 /Users/justinrich/.bun/bin/bun /Users/justinrich/Projects/holocron/services/platform/src/queue/scheduler-worker.ts
74695     1    01:35:40 node /Users/justinrich/Projects/holocron/node_modules/.bin/zero-cache --app-publications zero_pub --port 4848 --num-sync-workers 4

$ lsof -nP -iTCP:<port> -sTCP:LISTEN  # ports 3100 4111 4545 4848 5432 55433
3100: no listener
4111: bun PID 74066, TCP *:4111
4545: Python PID 6078, TCP *:4545
4848: node PID 74695, TCP *:4848
5432: postgres PID 19498, loopback + tailnet listeners
55433: no listener
```
