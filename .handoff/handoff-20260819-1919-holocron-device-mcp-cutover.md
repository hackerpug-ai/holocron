# HANDOFF — Holocron device and four-harness MCP cutover

**Written** 2026-08-19T19:19:23Z by Codex/GPT-5.6
**Repo** holocron · **Branch** main · **Source-work HEAD** a0e11267 before the handoff-only commit
**How to use this**: read §1–§2, run the checks in §4, then start at §2.
Claims are labeled VERIFIED / CLAIMED / ASSUMED — re-verify anything not VERIFIED
before you rely on it. Raw evidence is in §10.

**Staleness warning**: §4 was last checked between 2026-08-19T19:19:23Z and
2026-08-19T19:24:23Z. Two separate agent sessions were explicitly interrupted for this handoff;
their uncommitted worktrees must be inspected before either session is resumed or replaced.

## 1. Mission

Migrate the complete retained `$HOME/.holocron` corpus into production Postgres on the Holocron
device, flip the deployed service from Convex to Postgres with a proven rollback checkpoint, run
all 44 frozen MCP tools against real production with reversible namespaced writes, and atomically
move Codex, Claude, OpenCode, and Grok from the local SQLite MCP to the authenticated remote MCP.
Done requires exact source/target/blob reconciliation, exact-SHA deployment proof, zero MCP test
residue, all four harnesses independently reading and mutating production through the remote MCP,
and production mutations left enabled.

**Out of scope**: changing the frozen 44 tool names or schemas; deleting the retained local SQLite
database or pre-cutover snapshots; mobile/client deployment; production writes before the guarded
checkpoint/reconciliation sequence; broad cleanup/reset/stash of the dirty primary checkout; any
stubbed, mocked, fixture-only, or canned-success verification.

## 2. Start Here

First, confirm the two protected WIP worktrees have not moved:

```bash
git -C /Users/justinrich/Projects/holocron/.kb-run-sprint/worktrees/MK6-DATA-001-COMPOSITE status --porcelain=v1
git -C /Users/justinrich/Projects/holocron/.kb-run-sprint/worktrees/MK6-DATA-001-COMPOSITE log --oneline -3
git -C /Users/justinrich/Projects/holocron/.kb-run-sprint/worktrees/SPEC-REPAIR-PLAT status --porcelain=v1
git -C /Users/justinrich/Projects/holocron/.kb-run-sprint/worktrees/SPEC-REPAIR-PLAT log --oneline -3
```

Then do these in order:

1. Resume a Mastra planning session in `SPEC-REPAIR-PLAT`. Finish the four new task contracts,
   validate every requirement-contract scenario, commit on that branch, independently review the
   planning diff, and merge it onto `main`. Do not implement or mutate production from this branch.
2. Resume a Mastra implementation session in `MK6-DATA-001-COMPOSITE`. Preserve the committed RED
   test `aabe2c3b` and the untracked `composite-corpus.ts`; finish the task against the real corpus
   and a real isolated device Postgres candidate, commit GREEN evidence, and route it through
   independent technical and product review before merging.
3. Only after both land, execute the repaired dependency graph: production checkpoint → production
   composite apply under write freeze → exact-SHA release staging/deploy → Postgres flip with fence
   retained → guarded 44-tool sweep/fixes → composite-bound write enable → four-harness bootstrap
   and atomic switch. Re-check the canonical task graph rather than relying on this abbreviated list.

## 3. State of Play

- Umbrella PRD plus the original three generated cutover tasks and the S33-MCP-03 production-write
  repair are on `main` — `VERIFIED` at `a0e11267`: `git show --stat a0e11267`.
- The source-work baseline is `a0e11267`; committing this handoff advanced local `main` with only
  `.handoff/handoff-20260819-1919-holocron-device-mcp-cutover.md`. `origin/main` remained
  `0c469717` at the final re-check — `VERIFIED` by `git rev-parse --short origin/main`. The planning
  and handoff commits have not been pushed.
- Production is healthy but still serves the Convex data plane at deployed source revision
  `0c469717d5f0acc680ffae0eb254dbcae7023628` — `VERIFIED` at 2026-08-19T19:20Z with the `/health`
  command in §10. The live flip has not happened.
- The new composite branch has a distinct RED commit, `aabe2c3b test(MK6-DATA-001): add red composite
  corpus contract` — `VERIFIED` with the branch log in §10.
- `services/platform/src/etl/composite-corpus.ts` is an **untracked 840-line WIP file** in the
  composite worktree; SHA-256 is
  `e720d747d16d13669f599d84c3a198ce430eb157ad3b475fcaaf727ef012a5f9` — `VERIFIED` by `wc` and
  `shasum` in this session. It is not in any commit and is the highest-risk artifact in this handoff.
- Four run-scoped composite snapshot directories exist under the composite worktree, each about
  1.1 GiB: run IDs `mk6-data-20260819190923705-3190512ed844`,
  `mk6-data-20260819191142926-8f18c8155db5`,
  `mk6-data-20260819191356908-f8354cf496b8`, and
  `mk6-data-20260819191616054-87cb984f7ff9` — `VERIFIED` with `du -sh`. They are ignored evidence,
  not authorization to claim the candidate passed.
- The platform spec-repair branch has modified the umbrella PRD, sprint manifest, and S33-PLAT-04,
  and created four untracked task files: `CUTOVER-PLAT-001`, `CUTOVER-DATA-001`,
  `CUTOVER-RELEASE-001`, and `CUTOVER-PLAT-002` — `VERIFIED` by its §10 status. No spec-repair commit
  or scenario-validation receipt exists yet.
- The platform readiness audit concluded S33-PLAT-04 is not dispatch-ready until that repair lands —
  `CLAIMED` by a separate read-only audit session; verify against the files in §8 and the production
  backup probes described in §6.
- The two separate agent sessions were interrupted and no process remained whose command contained
  either WIP worktree path — `VERIFIED` at 2026-08-19T19:20Z by the sanitized process command in §10.
- No fresh independent query of production Postgres counts was run after interrupting the agents —
  `CLAIMED` unchanged by the scoped agent instructions, not VERIFIED. Before any production action,
  independently query the live database and compare it with the preflight empty-target baseline.

**Landed**:

- `a0e1126797fb46e84cf5b667767c38bcd7de2144` — umbrella cutover plan, generated MCP/harness task
  contracts, and S33-MCP-03 guarded-production-write repair. Its commit hooks passed root typecheck
  and 466 unit tests in this session — `VERIFIED` from the commit hook output.
- `aabe2c3b` is committed only on the composite worktree branch, not landed on `main` — `VERIFIED`.

**In progress**:

- Composite migration implementation in
  `.kb-run-sprint/worktrees/MK6-DATA-001-COMPOSITE`.
- Platform spec repair in `.kb-run-sprint/worktrees/SPEC-REPAIR-PLAT`.

**Broken**:

- The production rollback path is not Compose-aware: the exact-release backup status targets
  `127.0.0.1:5432`, while Compose publishes Postgres on host port `44112`; loaded pgBackRest paths
  still point to inference1-native locations absent on `holocron`, and neither the host nor container
  has the required usable pgBackRest setup — `CLAIMED` by the read-only readiness audit. Re-run the
  checkpoint probes before trusting this, and do not substitute an unverified one-off `pg_dump`.
- The composite implementation is not GREEN or reviewed. The four existing snapshot runs are
  attempts, not completion evidence — `VERIFIED` because the only branch commit is the RED test.

## 4. Perishable — Check Before Touching Anything

- At 2026-08-19T19:21Z, the separate implementation and planning sessions were `interrupted` and a
  sanitized process scan found no process using either worktree path — `VERIFIED`. Re-check with:

  ```bash
  ps -axo pid=,ppid=,etime=,command= | awk '/MK6-DATA-001-COMPOSITE|SPEC-REPAIR-PLAT/ && $0 !~ /awk/ {print $1, $2, $3}'
  ```

- The primary checkout is dirty with 24 unrelated tracked `.tmp/**` evidence files, with 100
  insertions and 487 deletions — `VERIFIED` at 2026-08-19T19:19Z. These edits predate this cutover
  implementation. Do not reset, clean, stash, stage, or overwrite them; the exact list is in §10.
- The composite worktree has one untracked production source file,
  `services/platform/src/etl/composite-corpus.ts`; its RED test is committed and the worktree status
  hides about 4.4 GiB of ignored run snapshots — `VERIFIED`. Do not run worktree GC or `git clean`.
- The spec-repair worktree has three modified tracked planning files and four untracked new task
  files — `VERIFIED`. Do not discard it or regenerate the plan from scratch; finish and validate it.
- The repository has many retained historical worktrees, including one detached nested worktree;
  the complete list is in §10 — `VERIFIED`. Do not prune or remove any as part of this handoff.
- Two pre-existing stashes exist — `VERIFIED`: `stash@{0}: lefthook auto backup` and `stash@{1}`
  describing concurrent/pre-existing dirty work. Do not pop or drop them without owner review.
- At 2026-08-19T19:20Z, many local Bun processes still served the local SQLite MCP; the sanitized
  process scan in §10 returned 47 PID rows — `VERIFIED`. This is expected before the four-harness
  switch. Do not kill them as a shortcut; the final harness task must prove no local child after an
  atomic, reversible config switch.
- At 2026-08-19T19:20Z, production `/health` returned `status=ok`, `data_plane=convex`, source
  revision `0c469717...`, image digest `sha256:e20d...`, rollback target `convex-frozen`, and database
  fingerprint `092a...` — `VERIFIED`. Re-run the exact §10 health query before any device write.

**Uncommitted work**: HIGH RISK. Exact paths and statuses are in §10. The untracked composite source
and four untracked task files are invisible to a new branch and can be destroyed by cleanup.

## 5. Decisions — Do Not Undo Without Reading

- **Keep MK6-DATA-001 isolated-only** — the canonical task proves the immutable composite artifact
  on an isolated real Postgres target. Production checkpoint/load/deploy/write-enable ownership is
  being separated into explicit tasks so the migration artifact cannot silently mutate production.
- **Do not dispatch S33-PLAT-04 yet** — it lacked ownership of a valid Compose-aware checkpoint,
  production load, exact-release staging, and a durable `HOLO_MIGRATION_READ_ONLY=1` assertion.
  The four new spec-repair tasks close those gaps.
- **Freeze first, enable writes last** — the forward Postgres flip must retain the write fence.
  Write enablement is a separate, explicitly authorized task bound to the composite manifest and
  verified checkpoint. Convex rollback is legal only before ordinary Postgres writes/PONR; afterward
  rollback must preserve Postgres and change only to a previously verified Postgres-capable release.
- **Do not reuse the old export-only implementation as completion** — retained commit `ad7cdf9a` in
  `.kb-run-sprint/worktrees/MK6-DATA-001` can be inspected or selectively reused, but it requires a
  missing export provenance sidecar and does not cover the SQLite delta or full blob corpus.
- **The authoritative source is the composite `$HOME/.holocron` corpus** — counts seen in preflight
  are baselines, never hardcoded oracles. Snapshot export, SQLite via backup semantics, and blobs
  symmetrically before/copy/after.
- **Keep the 44 MCP names/schemas frozen** — fixes must be narrow executor/transport/integration
  changes. The live sweep stops at first failure, fixes one tool, retries that tool/family, then
  resumes; never weaken an oracle for green.
- **Do not switch harness configs before the final server receipt** — Codex, Claude, OpenCode, and
  Grok must switch atomically with recoverable backups and each independently prove 44 tools,
  sentinel read, reversible subscription mutation, zero residue, and no local SQLite child.
- **Retain local SQLite and pre-cutover evidence through the remote soak** — deletion is forbidden.

## 6. Dead Ends & Traps

- **Tried**: treating current backup tooling as a production checkpoint → failed because it is wired
  to the wrong host port and inference1-native pgBackRest paths/binaries. Do not retry without the
  Compose-aware checkpoint task and a real independent restore/fire-drill.
- **Trap**: a one-off `pg_dump` can look reassuring but does not prove the required Postgres + ledger
  + blob + point-in-time rollback contract. It is not an acceptable completion receipt.
- **Trap**: production health uses camel-case `sourceRevision` and `imageDigest`; querying snake-case
  fields returns null. Use the exact §10 `jq` expression.
- **Trap**: the mutable host checkout is stale/dirty and is not the deployed source. Deployment must
  stage an immutable exact committed SHA under the release root and prove the image digest/revision.
- **Trap**: current `cutover:verify-tools` treats mutations being blocked by
  `HOLO_MIGRATION_READ_ONLY` as success. The new verifier task must add explicitly guarded enabled
  production writes, ordered resume, independent persistence oracles, identifier ledger, and scoped
  cleanup; catalog-only green is not completion.
- **Trap**: the primary checkout's dirty `.tmp` files are unrelated user/concurrent evidence. Do not
  use broad staging, stash, reset, or clean.
- **Security incident**: earlier in this session, an unrelated local OpenAI API credential was
  accidentally printed in tool output while inspecting a harness config. The value is not repeated
  here. Treat it as exposed and rotate it through the owning provider/configuration; do not copy it
  into tasks, logs, commits, or this cutover's secret store.

## 7. Blockers

- Platform execution is blocked until the spec-repair WIP is completed, scenario-validated,
  committed, independently reviewed, and landed. No user input is required to finish that repair.
- Production flip is blocked until MK6-DATA-001 is GREEN on a real isolated device candidate and
  dual-reviewed/landed, then the repaired checkpoint/load/release prerequisites pass.
- A real Compose-aware production rollback checkpoint is currently unavailable through canonical
  tooling — `CLAIMED` by readiness audit. The new `CUTOVER-PLAT-001` task must implement and prove it;
  missing vendor access/credentials should be reported by variable name only and fail closed.
- The leaked unrelated OpenAI API credential should be rotated by its owner. This is a security
  follow-up, not permission to alter credentials during the cutover.

## 8. Map — Pointers, Not Payloads

| What | Where |
|---|---|
| Project instructions | `/Users/justinrich/Projects/holocron/AGENTS.md` |
| Cross-harness terminology/context | `/Users/justinrich/Projects/brain/docs/ROOT-CONTEXT.md` |
| Umbrella cutover PRD on main | `.spec/prd/holocron-device-mcp-cutover/README.md` |
| Cutover sprint manifest on main | `.spec/tasks/holocron-device-mcp-cutover/SPRINT.md` |
| Canonical composite migration task | `.spec/tasks/imp-mk6-functional-completeness-1786837297/MK6-DATA-001-data-plane-truth.md` |
| Composite implementation worktree | `.kb-run-sprint/worktrees/MK6-DATA-001-COMPOSITE` |
| Composite RED test | `.kb-run-sprint/worktrees/MK6-DATA-001-COMPOSITE/services/platform/tests/integration/mk6-data-plane-truth-live.test.ts` |
| Untracked composite loader WIP | `.kb-run-sprint/worktrees/MK6-DATA-001-COMPOSITE/services/platform/src/etl/composite-corpus.ts` |
| Platform spec-repair worktree | `.kb-run-sprint/worktrees/SPEC-REPAIR-PLAT` |
| New checkpoint task WIP | `.kb-run-sprint/worktrees/SPEC-REPAIR-PLAT/.spec/tasks/holocron-device-mcp-cutover/CUTOVER-PLAT-001-compose-aware-production-checkpoint.md` |
| New production apply task WIP | `.kb-run-sprint/worktrees/SPEC-REPAIR-PLAT/.spec/tasks/holocron-device-mcp-cutover/CUTOVER-DATA-001-production-composite-apply.md` |
| New release/deploy task WIP | `.kb-run-sprint/worktrees/SPEC-REPAIR-PLAT/.spec/tasks/holocron-device-mcp-cutover/CUTOVER-RELEASE-001-exact-sha-release-staging-deploy.md` |
| New write-enable task WIP | `.kb-run-sprint/worktrees/SPEC-REPAIR-PLAT/.spec/tasks/holocron-device-mcp-cutover/CUTOVER-PLAT-002-composite-bound-enable-writes.md` |
| Repaired S33 flip task WIP | `.kb-run-sprint/worktrees/SPEC-REPAIR-PLAT/.spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/S33-PLAT-04-flip-the-data-plane-convex-to-postgres-behind-a-fail-closed.md` |
| Guarded production MCP verifier task | `.spec/tasks/holocron-device-mcp-cutover/CUTOVER-MCP-001-guarded-production-verifier.md` |
| Harness bootstrap task | `.spec/tasks/holocron-device-mcp-cutover/CUTOVER-HARNESS-001-non-secret-shell-bootstrap.md` |
| Atomic four-harness switch task | `.spec/tasks/holocron-device-mcp-cutover/CUTOVER-HARNESS-002-atomic-four-harness-switch.md` |
| Frozen compatibility manifest | `.spec/prds/mk6-migration/10-technical-requirements/14-mcp-compatibility-manifest.yaml` |
| Current verifier implementation | `services/platform/src/cutover/soak-fence.ts` |
| Deployment runbook | `services/platform/deploy/compose/README.md` |
| Production release packaging | `services/platform/src/deploy/production-release.ts` |
| Production deployment | `services/platform/src/deploy/production-deploy.ts` |
| Restore fire drill | `services/platform/src/restore/fire-drill.ts` |
| Governed execution workflow | `/Users/justinrich/.codex/skills/kb-run-sprint/SKILL.md` |

## 9. Environment & Bootstrap

**Build**: no root `build` script is defined · **Test**: `pnpm test` · **Run integration**:
`pnpm test:integration`

Root scripts read directly from `package.json` — `VERIFIED` in §10:

```bash
pnpm typecheck       # tsgo --noEmit
pnpm lint            # biome check .
pnpm test            # vitest run
pnpm test:integration # vitest run --project integration
```

The `a0e11267` planning commit ran root typecheck and unit hooks successfully with 466 passing and
30 skipped tests — `VERIFIED` earlier in this session. No post-WIP GREEN test, integration suite,
build, production checkpoint, or deployment verification has passed; do not infer one.

Required secret/configuration names include `HOLO_KEY_MCP`, `HOLO_SECRETS_PATH` or
`HOLOCRON_SECRETS_PATH`, `DATABASE_URL`, R2/restore credential names from `AGENTS.md`, and the
deployment image/release path variables documented in the Compose runbook. Values live only in the
ignored canonical `services/platform/config/secrets.yaml` or operator-local `.env`; never print,
duplicate, or place them in argv/evidence.

Execution constraints: use real services; commit RED and GREEN separately where required; every
implementation needs technical plus product review; workers commit only their branch and never
merge/push main/remove worktrees; the orchestrator alone merges after checking main did not move;
preserve dirty checkouts and unrelated evidence; no production mutation until the repaired task
graph authorizes it.

## 10. Evidence Appendix

### Primary checkout sweep

```text
$ git rev-parse --short HEAD
a0e11267

$ git branch --show-current
main

$ git status --porcelain=v1
 M .tmp/D04-01/ac-1-output.txt
 M .tmp/D04-01/lint-output.txt
 M .tmp/D04-01/requirement-results.json
 M .tmp/D04-01/tc-2-output.txt
 M .tmp/D04-01/test-output.txt
 M .tmp/D04-01/typecheck-output.txt
 M .tmp/D04-01/verification-summary.json
 M .tmp/GATE-FIX-S28R3-QA24/d05-04-honesty.json
 M .tmp/GATE-FIX-S28R3-QA24/hostile-literal-step2.json
 M .tmp/GATE-FIX-S28R3-QA24/trusted-tool-probe.json
 M .tmp/GATE-FIX-S28R3-QA25/d05-04-bundle/attestation.json
 M .tmp/GATE-FIX-S28R3-QA25/d05-04-bundle/oracle-manifest.json
 M .tmp/GATE-FIX-S28R3-QA25/evil-env-bin.json
 M .tmp/GATE-FIX-S28R3-QA25/exec-env-nul-truncation.json
 M .tmp/GATE-FIX-S28R3-QA25/hostile-literal-step2.json
 M .tmp/GATE-FIX-S28R3-QA26/hostile-bin-refuse.json
 M .tmp/GATE-FIX-S28R3-QA27/hostile-bin-refuse.json
 M .tmp/GATE-FIX-S28R3-QA27/lifecycle-cleanup.json
 M .tmp/GATE-FIX-S28R3-QA27/mutation-rejects.json
 M .tmp/GATE-FIX-S28R3-QA27/whitespace-clean.json
 M .tmp/GATE-FIX-S28R3-QA33/no-key-negative.json
 M .tmp/GATE-FIX-S28R3-QA33/positive-dependency.json
 M .tmp/sprint-25/redhat-fix-04-production-mutation.log
 M .tmp/sprint-25/redhat-fix-10-site-a-mutation.log

$ git log --oneline -15
a0e11267 docs: plan device and remote MCP cutover
0c469717 chore: record PLAT-05 source review gate
04f7ff8e fix: bind PLAT-05 accounting to telemetry rows
d0d5fbfc test: require durable PLAT-05 telemetry identity
479bcfd9 fix: enforce PLAT-05 credential evidence
f3e14558 fix: prove PLAT-05 multi-call routing on Holocron
4888e0d9 docs: hand off PLAT-05 main Holocron deployment
5cd099e9 docs: land PLAT-05 multi-call proof contract
31182790 docs: pin S33 canary control manifest
a360532c docs: separate S33 canary control evidence
584f1573 docs: pin S33 credential safety contract
0b479fd3 docs: make S33 credential grammar fail closed
f5a3403f docs: close S33 credential scanner bypasses
0d6cbf74 docs: harden S33 PLAT-05 proof controls
eb93c995 docs: repair S33 PLAT-05 multicall proof contract

$ git diff --stat
 .tmp/D04-01/ac-1-output.txt                        | 119 +-------------------
 .tmp/D04-01/lint-output.txt                        |  45 +-------
 .tmp/D04-01/requirement-results.json               |   6 +-
 .tmp/D04-01/tc-2-output.txt                        | 119 +-------------------
 .tmp/D04-01/test-output.txt                        | 121 +--------------------
 .tmp/D04-01/typecheck-output.txt                   |   2 +-
 .tmp/D04-01/verification-summary.json              |  32 +++---
 .tmp/GATE-FIX-S28R3-QA24/d05-04-honesty.json       |  16 +--
 .../GATE-FIX-S28R3-QA24/hostile-literal-step2.json |   4 +-
 .tmp/GATE-FIX-S28R3-QA24/trusted-tool-probe.json   |  16 +--
 .../d05-04-bundle/attestation.json                 |   2 +-
 .../d05-04-bundle/oracle-manifest.json             |   2 +-
 .tmp/GATE-FIX-S28R3-QA25/evil-env-bin.json         |   2 +-
 .../exec-env-nul-truncation.json                   |   2 +-
 .../GATE-FIX-S28R3-QA25/hostile-literal-step2.json |   4 +-
 .tmp/GATE-FIX-S28R3-QA26/hostile-bin-refuse.json   |   4 +-
 .tmp/GATE-FIX-S28R3-QA27/hostile-bin-refuse.json   |   2 +-
 .tmp/GATE-FIX-S28R3-QA27/lifecycle-cleanup.json    |  13 +--
 .tmp/GATE-FIX-S28R3-QA27/mutation-rejects.json     |   2 +-
 .tmp/GATE-FIX-S28R3-QA27/whitespace-clean.json     |   2 +-
 .tmp/GATE-FIX-S28R3-QA33/no-key-negative.json      |  24 ++--
 .tmp/GATE-FIX-S28R3-QA33/positive-dependency.json  |  32 ++----
 .../redhat-fix-04-production-mutation.log          |   6 +-
 .tmp/sprint-25/redhat-fix-10-site-a-mutation.log   |  10 +-
 24 files changed, 100 insertions(+), 487 deletions(-)

$ git diff --cached --stat

$ git stash list
stash@{0}: lefthook auto backup
stash@{1}: On main: NOT goal-plan-writer: concurrent/pre-existing dirty tree stashed so blind precommit-gate can release. Restore: git stash pop. Plan lives outside repo at ~/.grok/sessions/.../goal/plan.md
```

### Relevant worktrees

```text
$ git worktree list | rg '(^/Users/justinrich/Projects/holocron )|MK6-DATA-001|SPEC-REPAIR-PLAT'
/Users/justinrich/Projects/holocron                                                                                                                 a0e11267 [main]
/Users/justinrich/Projects/holocron/.kb-run-sprint/worktrees/MK6-DATA-001                                                                           ad7cdf9a [kb-run-sprint/imp-mk6-functional-completeness-1786837297/MK6-DATA-001]
/Users/justinrich/Projects/holocron/.kb-run-sprint/worktrees/MK6-DATA-001-COMPOSITE                                                                 aabe2c3b [kb-run-sprint/holocron-device-mcp-cutover/MK6-DATA-001-COMPOSITE]
/Users/justinrich/Projects/holocron/.kb-run-sprint/worktrees/SPEC-REPAIR-PLAT                                                                       a0e11267 [kb-run-sprint/holocron-device-mcp-cutover/SPEC-REPAIR-PLAT]
```

The full `git worktree list` contained many additional retained Sprint 28/33 worktrees and one
detached nested worktree at
`.kb-run-sprint/worktrees/S33-MCP-02/.tmp/D07-02/pinned-fallback-worktree`; re-run the unfiltered
command before cleanup.

### Composite WIP

```text
$ git -C .kb-run-sprint/worktrees/MK6-DATA-001-COMPOSITE rev-parse --short HEAD
aabe2c3b

$ git -C .kb-run-sprint/worktrees/MK6-DATA-001-COMPOSITE branch --show-current
kb-run-sprint/holocron-device-mcp-cutover/MK6-DATA-001-COMPOSITE

$ git -C .kb-run-sprint/worktrees/MK6-DATA-001-COMPOSITE status --porcelain=v1
?? services/platform/src/etl/composite-corpus.ts

$ git -C .kb-run-sprint/worktrees/MK6-DATA-001-COMPOSITE log --oneline -5
aabe2c3b test(MK6-DATA-001): add red composite corpus contract
a0e11267 docs: plan device and remote MCP cutover
0c469717 chore: record PLAT-05 source review gate
04f7ff8e fix: bind PLAT-05 accounting to telemetry rows
d0d5fbfc test: require durable PLAT-05 telemetry identity

$ wc -l services/platform/src/etl/composite-corpus.ts services/platform/tests/integration/mk6-data-plane-truth-live.test.ts
     840 services/platform/src/etl/composite-corpus.ts
      65 services/platform/tests/integration/mk6-data-plane-truth-live.test.ts
     905 total

$ shasum -a 256 services/platform/src/etl/composite-corpus.ts services/platform/tests/integration/mk6-data-plane-truth-live.test.ts
e720d747d16d13669f599d84c3a198ce430eb157ad3b475fcaaf727ef012a5f9  services/platform/src/etl/composite-corpus.ts
39e5df2a9f96427ff58f5b3c96f7b5ab94db5a6f008ff251014ec0fbbb3c4dc0  services/platform/tests/integration/mk6-data-plane-truth-live.test.ts

$ du -sh .tmp/MK6-DATA-001/*
1.1G .tmp/MK6-DATA-001/mk6-data-20260819190923705-3190512ed844
1.1G .tmp/MK6-DATA-001/mk6-data-20260819191142926-8f18c8155db5
1.1G .tmp/MK6-DATA-001/mk6-data-20260819191356908-f8354cf496b8
1.1G .tmp/MK6-DATA-001/mk6-data-20260819191616054-87cb984f7ff9
```

### Platform spec-repair WIP

```text
$ git -C .kb-run-sprint/worktrees/SPEC-REPAIR-PLAT rev-parse --short HEAD
a0e11267

$ git -C .kb-run-sprint/worktrees/SPEC-REPAIR-PLAT branch --show-current
kb-run-sprint/holocron-device-mcp-cutover/SPEC-REPAIR-PLAT

$ git -C .kb-run-sprint/worktrees/SPEC-REPAIR-PLAT status --porcelain=v1
 M .spec/prd/holocron-device-mcp-cutover/README.md
 M .spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/S33-PLAT-04-flip-the-data-plane-convex-to-postgres-behind-a-fail-closed.md
 M .spec/tasks/holocron-device-mcp-cutover/SPRINT.md
?? .spec/tasks/holocron-device-mcp-cutover/CUTOVER-DATA-001-production-composite-apply.md
?? .spec/tasks/holocron-device-mcp-cutover/CUTOVER-PLAT-001-compose-aware-production-checkpoint.md
?? .spec/tasks/holocron-device-mcp-cutover/CUTOVER-PLAT-002-composite-bound-enable-writes.md
?? .spec/tasks/holocron-device-mcp-cutover/CUTOVER-RELEASE-001-exact-sha-release-staging-deploy.md

$ git -C .kb-run-sprint/worktrees/SPEC-REPAIR-PLAT diff --stat
 .spec/prd/holocron-device-mcp-cutover/README.md    |  75 ++--
 ...lane-convex-to-postgres-behind-a-fail-closed.md | 432 +++------------------
 .spec/tasks/holocron-device-mcp-cutover/SPRINT.md  |  34 +-
 3 files changed, 123 insertions(+), 418 deletions(-)
```

### Live service and process state

```text
$ curl -fsS https://holocron.tail011a51.ts.net:44111/health | jq '{status,data_plane,sourceRevision,imageDigest,rollback,database_target}'
{
  "status": "ok",
  "data_plane": "convex",
  "sourceRevision": "0c469717d5f0acc680ffae0eb254dbcae7023628",
  "imageDigest": "sha256:e20d53470c936831bf2ed9e7b4bf6a1a509baab5fcd89eb6d7ec0c6fece23a4f",
  "rollback": {
    "target": "convex-frozen",
    "data_plane": "convex",
    "source": "secrets"
  },
  "database_target": {
    "host": "postgres",
    "effective_port": 5432,
    "database": "holocron",
    "fingerprint": "092a302743a11279e39e0a981c5ff5b9ae45d64d284b229a85098b35bb82a53e"
  }
}

$ ps -axo pid=,ppid=,etime=,command= | awk '/MK6-DATA-001-COMPOSITE|SPEC-REPAIR-PLAT/ && $0 !~ /awk/ {print $1, $2, $3}'
# no output

$ ps -axo pid=,ppid=,etime=,command= | awk '/\.holocron\/mcp\/src\/mastra\/stdio\.ts/ && $0 !~ /awk/ {print $1, $2, $3}' | wc -l
47
```

### Root package scripts

```json
{
  "packageManager": "pnpm@9.15.4",
  "scripts": {
    "typecheck": "tsgo --noEmit",
    "lint": "biome check .",
    "test": "vitest run",
    "build": null,
    "test:integration": "vitest run --project integration"
  }
}
```

### Final perishable re-check after writing the handoff

```text
$ git rev-parse --short HEAD
d84588ee

$ git -C .kb-run-sprint/worktrees/MK6-DATA-001-COMPOSITE rev-parse --short HEAD
aabe2c3b
$ git -C .kb-run-sprint/worktrees/MK6-DATA-001-COMPOSITE status --porcelain=v1
?? services/platform/src/etl/composite-corpus.ts

$ git -C .kb-run-sprint/worktrees/SPEC-REPAIR-PLAT rev-parse --short HEAD
a0e11267
$ git -C .kb-run-sprint/worktrees/SPEC-REPAIR-PLAT status --porcelain=v1
 M .spec/prd/holocron-device-mcp-cutover/README.md
 M .spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/S33-PLAT-04-flip-the-data-plane-convex-to-postgres-behind-a-fail-closed.md
 M .spec/tasks/holocron-device-mcp-cutover/SPRINT.md
?? .spec/tasks/holocron-device-mcp-cutover/CUTOVER-DATA-001-production-composite-apply.md
?? .spec/tasks/holocron-device-mcp-cutover/CUTOVER-PLAT-001-compose-aware-production-checkpoint.md
?? .spec/tasks/holocron-device-mcp-cutover/CUTOVER-PLAT-002-composite-bound-enable-writes.md
?? .spec/tasks/holocron-device-mcp-cutover/CUTOVER-RELEASE-001-exact-sha-release-staging-deploy.md

$ ps -axo pid=,ppid=,etime=,command= | awk '/MK6-DATA-001-COMPOSITE|SPEC-REPAIR-PLAT/ && $0 !~ /awk/ {print $1, $2, $3}'
# no output

$ curl -fsS https://holocron.tail011a51.ts.net:44111/health | jq -r '[.status,.data_plane,.sourceRevision] | @tsv'
ok convex 0c469717d5f0acc680ffae0eb254dbcae7023628
```
