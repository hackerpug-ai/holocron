# REDHAT-FIX-07 — Copy REDHAT-FIX-04's evidence files (`redhat-fix-04-path.json`, `redhat-fix-04-production-mutation.log`, `redhat-fix-04-red.log`) from `.kb-run-sprint/worktrees/REDHAT-FIX-04/.tmp/sprint-25/` to the primary checkout's `.tmp/sprint-25/` and commit them (or re-run `pnpm vitest run tests/integration/redhat-fix-04-production-hook-reconnect.test.ts` on the primary checkout, which self-generates the files), so REDHAT-FIX-04's own TC-5 verify command passes on a cold checkout
> Status: ✅ Completed
> Cycle: 1
> Reviewer: product-manager+technical
> Completed: 2026-07-26T05:32:56Z
> Sprint: [Sprint 25: Reactive Surfaces — SSE Streaming, Mission Progress, Degraded](./SPRINT.md)
> Agent: react-native-ui-implementer
> Estimate: 15 min
> Type: CHORE
> Priority: P0
> Effort: S
> Proposed by: react-native-ui-planner
> TDD_MODE: skipped · RED_GREEN_REQUIRED: no · SEEDED_EVIDENCE_REQUIRED: yes
> Source finding: `.spec/reviews/red-hat-sprint25-reactive-20260725T211242Z.md#G-3`

## Background

- **Finding:** `.spec/reviews/red-hat-sprint25-reactive-20260725T211242Z.md#G-3` (PARTIAL recurrence)
- **Red-hat report:** `.spec/reviews/red-hat-sprint25-reactive-20260725T211242Z.md`
- **Why it matters:** Cycle-3 closed H3 (production-code mutation kills) and G-2 (fresh gate). The **only remaining blocker** for an unqualified Sprint 25 close is G-3 recurring on REDHAT-FIX-04 itself: its TC-5 evidence triad exists only under `.kb-run-sprint/worktrees/REDHAT-FIX-04/.tmp/sprint-25/`, not at the contract-mandated primary `.tmp/sprint-25/` path. Underlying mutation evidence is honest and independently re-verified — this is process/evidence-hygiene only.
- **PRD refs:** UC-SYNC-02, T-SYNC-006
- **Capability:** CAP-SYNC-01

## Critical Constraints

### MUST
- MUST place all three files at primary-checkout contract paths: `.tmp/sprint-25/redhat-fix-04-path.json`, `.tmp/sprint-25/redhat-fix-04-production-mutation.log`, `.tmp/sprint-25/redhat-fix-04-red.log`
- MUST make REDHAT-FIX-04 TC-5 shell exit 0 on primary checkout without depending on `.kb-run-sprint/worktrees/`
- MUST keep path.json path field equal to exactly `'A'` (PATH-A production truth already landed by REDHAT-FIX-04)
- MUST ensure all three files are non-empty (size > 0); mutation.log must contain production-assembly-reset kill evidence (failures>=1 / exit non-zero / KILLED) and correct-path exit=0
- MUST leave dual durable copies under `.spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/.gate-evidence/tdd/` so cold clones can recover (mirror REDHAT-FIX-06 pattern)
- MUST prefer copy-from-worktree when `.kb-run-sprint/worktrees/REDHAT-FIX-04/.tmp/sprint-25/redhat-fix-04-{path.json,production-mutation.log,red.log}` exist; else regenerate via `pnpm vitest run tests/integration/redhat-fix-04-production-hook-reconnect.test.ts` on primary
- MUST force-add (`.tmp` is gitignored) OR rely on durable `.gate-evidence/tdd/` + suite self-seed so cold-checkout recovery is documented and verifiable

### NEVER
- NEVER leave the three evidence files only under `.kb-run-sprint/worktrees/REDHAT-FIX-04/.tmp/sprint-25/` as the sole location
- NEVER claim REDHAT-FIX-04 TC-5 pass while primary-checkout `.tmp/sprint-25/redhat-fix-04-{path.json,production-mutation.log,red.log}` are missing
- NEVER invent empty/0-byte placeholders for red.log or production-mutation.log
- NEVER flip path.json to `'B'` or re-open PATH-B product re-scope
- NEVER change product behavior of `hooks/use-resumable-sse-stream.ts`, `services/platform/src/http/chat-runs.ts`, `services/platform/src/db/seed-e2e.ts`, `services/platform/src/research/progress.ts`, or `services/platform/src/mcp/executor.ts`
- NEVER re-litigate H3 (assemblyRef-reset mutant already KILLED in production by REDHAT-FIX-04)
- NEVER rewrite mutation.log to fake KILLED without suite output
- NEVER delete worktree evidence until primary-checkout mandated paths are restored and verified

### STRICTLY
- STRICTLY `tdd_mode` skipped for this chore — proof is file existence + jq + non-empty content, not a new product feature RED→GREEN ceremony
- STRICTLY `verification_policy.requires_seeded_evidence: true` (Axis B — behavioral proof of cold-checkout file presence at contract paths)
- STRICTLY process/evidence-hygiene only — SafeAreaView / touch targets N/A (no UI product work)
- STRICTLY if force-commit of `.tmp/` is rejected by policy, commit durable copies under `.gate-evidence/tdd/` and document that TC-5 must be run after suite bootstrap (or `git add -f`) so contract path is populated
- STRICTLY prefer copy of independently verified worktree mutation log over inventing a new mutation narrative; regeneration via real suite is acceptable if worktree is gone
- STRICTLY PATH-A freeze: `jq -e '.path=="A"'` must succeed; path B is a hard fail for this task

## Specification

**Objective:** Close cycle-3 G-3 PARTIAL recurrence by restoring REDHAT-FIX-04's TDD evidence chain (path.json PATH-A + production-mutation.log + red.log) at the TC-5-mandated primary-checkout `.tmp/sprint-25/` paths and dual-writing durable sprint `.gate-evidence/tdd/` copies, so REDHAT-FIX-04 TC-5 passes on a cold checkout without depending on the REDHAT-FIX-04 worktree.

**Success state:** On primary checkout without worktrees: `test -f .tmp/sprint-25/redhat-fix-04-red.log && test -f .tmp/sprint-25/redhat-fix-04-production-mutation.log && test -f .tmp/sprint-25/redhat-fix-04-path.json && jq -e '.path=="A"' .tmp/sprint-25/redhat-fix-04-path.json` exits 0; all three files non-empty; mutation.log shows production-assembly-reset KILLED + correct exit=0; durable copies exist under sprint `.gate-evidence/tdd/`; no product code behavior changes.

## Capability Chain

- **Touches:** CAP-SYNC-01
- **Provides:** redhat-fix-04-cold-checkout-tdd-evidence, g3-partial-closure-fix-04-evidence-home
- **Consumes:** production-hook-sse-reconnect-mutation-oracle, assemblyRef-reset-mutant-kill-evidence, cold-checkout-tdd-evidence-chain
- **Boundary contracts:**
  - REDHAT-FIX-04 TC-5: `test -f .tmp/sprint-25/redhat-fix-04-red.log && test -f .tmp/sprint-25/redhat-fix-04-production-mutation.log && test -f .tmp/sprint-25/redhat-fix-04-path.json && jq -e '.path=="A"' .tmp/sprint-25/redhat-fix-04-path.json`
  - Contract-mandated primary-checkout paths are ONLY under `.tmp/sprint-25/` — worktree-only alt path is NOT a substitute
  - `.tmp/` is gitignored — dual durability via `git add -f` AND/OR committed `.gate-evidence/tdd/` copies (REDHAT-FIX-06 pattern)
  - path.json MUST remain `{"path":"A"}` (PATH-A production truth for H3)
  - mutation.log MUST retain honest production-assembly-reset kill evidence
  - red.log MUST be non-empty real RED capture
  - product freeze: never edit chat-runs.ts, progress.ts, seed-e2e.ts, executor.ts, or H3 production hook for this chore
  - H3 CLOSED; G-2 CLOSED; this task closes only G-3 partial recurrence on REDHAT-FIX-04

## Acceptance Criteria

### AC-1: AC-1 [PRIMARY]
- **Description:** GIVEN a primary checkout that does not depend on `.kb-run-sprint/worktrees` WHEN REDHAT-FIX-04 TC-5 shell verify runs THEN it exits 0: all three contract files exist under `.tmp/sprint-25/` and jq accepts path==`"A"`
- **Test tier:** `integration` · **Verification service:** `filesystem + jq TC-5 on primary checkout` · **Flow ref:** `UC-SYNC-02`
- **Verify:** `test -f .tmp/sprint-25/redhat-fix-04-red.log && test -f .tmp/sprint-25/redhat-fix-04-production-mutation.log && test -f .tmp/sprint-25/redhat-fix-04-path.json && jq -e '.path=="A"' .tmp/sprint-25/redhat-fix-04-path.json`
- **Scenario:** tier `visible` · test_tier `integration` · topology `single-node`
  - **Negative control — would fail if:** empty — three files only under worktrees (current G-3 PARTIAL), stub — only redhat-fix-04-ac1-api-response.json without the three TC-5 files, disconnect — path.json missing path key or path != A, static — files never written on primary cold checkout
  - **Evidence:** artifact `file_artifact`, required_capture=True
  - **Case 1** — start_ref `tc5-mandated-paths-fix04`: actor `cli_user`
    - **Steps:**
      - mkdir -p .tmp/sprint-25
      - Copy the three TC-5 files from worktree OR regenerate via vitest on primary
      - Run REDHAT-FIX-04 TC-5 shell verify on primary checkout without referencing worktrees
    - **MUST observe:**
      - `.tmp/sprint-25/redhat-fix-04-red.log exists and file size > 0`
      - `.tmp/sprint-25/redhat-fix-04-production-mutation.log exists and file size > 0`
      - `.tmp/sprint-25/redhat-fix-04-path.json exists and file size > 0`
      - `jq '.path' equals 'A' on .tmp/sprint-25/redhat-fix-04-path.json`
      - `TC-5 shell command exit code == 0 on primary checkout`
    - **MUST NOT observe:**
      - `empty/start signature: test -f fails on primary for any of the three files (size == 0 or missing)`
      - `evidence only under worktrees (primary contract paths empty)`
      - `path field equals null or empty string '' or path equals 'B'`

### AC-2: AC-2
- **Description:** GIVEN worktree evidence is sound (or suite regenerates honestly) WHEN this task completes THEN all three primary `.tmp/sprint-25/` files are non-empty, path.json path==`"A"`, and production-mutation.log contains production-assembly-reset kill evidence plus correct-path exit=0
- **Test tier:** `integration` · **Verification service:** `filesystem content integrity + rg/jq content checks`
- **Verify:** `test -s .tmp/sprint-25/redhat-fix-04-red.log && test -s .tmp/sprint-25/redhat-fix-04-production-mutation.log && test -s .tmp/sprint-25/redhat-fix-04-path.json && jq -e '.path=="A"' .tmp/sprint-25/redhat-fix-04-path.json && rg -E 'production-assembly-reset.*(failures=[1-9]|exit=[1-9]|exit_nonzero|KILLED)' .tmp/sprint-25/redhat-fix-04-production-mutation.log && rg -q 'correct.*(exit=0|exit_ok=true|failures=0)' .tmp/sprint-25/redhat-fix-04-production-mutation.log`
- **Scenario:** tier `visible` · test_tier `integration` · topology `single-node`
  - **Negative control — would fail if:** empty — 0-byte placeholders, stub — mutation.log without production-assembly-reset kill line, static — path field not A, mock — invented empty red_first / mutation narrative
  - **Evidence:** artifact `file_artifact`, required_capture=True
  - **Case 1** — start_ref `worktree-fix04-evidence`: actor `cli_user`
    - **Steps:**
      - Copy sound worktree files to .tmp/sprint-25/ OR re-run production-hook suite on primary
      - Assert non-empty sizes with test -s
      - jq path==A; rg production-assembly-reset kill + correct exit=0 in mutation.log
    - **MUST observe:**
      - `redhat-fix-04-red.log size > 0`
      - `redhat-fix-04-production-mutation.log size > 0`
      - `redhat-fix-04-path.json size > 0 and path == 'A'`
      - `mutation.log contains production-assembly-reset KILLED or exit=1 failures=1 kill evidence`
      - `mutation.log contains correct path exit=0 / failures=0`
    - **MUST NOT observe:**
      - `empty/start signature: any of the three files size == 0`
      - `mutation.log without production-assembly-reset kill evidence`
      - `path field equals 'B' or missing`
      - `correct and mutant both failures==0 (SURVIVES)`

### AC-3: AC-3
- **Description:** GIVEN `.tmp/` is gitignored WHEN durability is required for cold clone recovery THEN durable copies of the three REDHAT-FIX-04 evidence files exist under sprint `.gate-evidence/tdd/` (committed) with path==A and non-empty logs, OR the three `.tmp` files are force-added with `git add -f` and present after clone
- **Test tier:** `integration` · **Verification service:** `git-tracked durable evidence OR force-added .tmp files + cold-checkout simulation`
- **Verify:** `test -s .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/.gate-evidence/tdd/redhat-fix-04-path.json && test -s .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/.gate-evidence/tdd/redhat-fix-04-production-mutation.log && test -s .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/.gate-evidence/tdd/redhat-fix-04-red.log && jq -e '.path=="A"' .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/.gate-evidence/tdd/redhat-fix-04-path.json`
- **Scenario:** tier `visible` · test_tier `integration` · topology `single-node`
  - **Negative control — would fail if:** empty — only gitignored .tmp with no durable copy and no force-add, stub — durable copies empty or wrong filenames, static — worktree-only evidence, mock — durable path.json not PATH-A
  - **Evidence:** artifact `file_artifact`, required_capture=True
  - **Case 1** — start_ref `durable-gate-evidence-fix04`: actor `cli_user`
    - **Steps:**
      - mkdir -p sprint .gate-evidence/tdd
      - Copy the three files into .gate-evidence/tdd/ and keep .tmp/sprint-25/ populated for TC-5
      - git add durable .gate-evidence/tdd/redhat-fix-04-*; optionally git add -f .tmp/sprint-25/redhat-fix-04-*
    - **MUST observe:**
      - `durable .gate-evidence/tdd/redhat-fix-04-path.json exists and size > 0 with path == 'A'`
      - `durable .gate-evidence/tdd/redhat-fix-04-production-mutation.log exists and size > 0`
      - `durable .gate-evidence/tdd/redhat-fix-04-red.log exists and size > 0`
      - `TC-5-mandated .tmp paths still satisfied (all three sizes > 0) OR documented force-add leaves them tracked`
    - **MUST NOT observe:**
      - `empty/start signature: no durable and no force-added .tmp files (all sizes == 0)`
      - `evidence only under .kb-run-sprint/worktrees/ (primary durable empty)`

### AC-4: AC-4
- **Description:** GIVEN worktree evidence may or may not still exist WHEN implementer restores evidence THEN prefer filesystem copy from worktree if present, else regenerate via `pnpm vitest run tests/integration/redhat-fix-04-production-hook-reconnect.test.ts` on primary; NEVER invent empty placeholders; no product code changes to frozen backend/client H3 surfaces
- **Test tier:** `integration` · **Verification service:** `procedure audit + product freeze git status + optional vitest regenerate`
- **Verify:** `test -s .tmp/sprint-25/redhat-fix-04-path.json && test -s .tmp/sprint-25/redhat-fix-04-production-mutation.log && test -s .tmp/sprint-25/redhat-fix-04-red.log && jq -e '.path=="A"' .tmp/sprint-25/redhat-fix-04-path.json && git status --porcelain -- services/platform/src/http/chat-runs.ts services/platform/src/db/seed-e2e.ts services/platform/src/research/progress.ts services/platform/src/mcp/executor.ts hooks/use-resumable-sse-stream.ts | test -z "$(cat)"`
- **Scenario:** tier `visible` · test_tier `integration` · topology `single-node`
  - **Negative control — would fail if:** empty — invent 0-byte logs instead of suite regenerate, stub — edit product hook/backend files, static — leave evidence only in worktree, mock — flip path to B or re-open H3 product rework
  - **Evidence:** artifact `file_artifact`, required_capture=True
  - **Case 1** — start_ref `worktree-fix04-evidence`: actor `cli_user`
    - **Steps:**
      - If worktree files exist: cp triad to .tmp/sprint-25/
      - Else: pnpm vitest run tests/integration/redhat-fix-04-production-hook-reconnect.test.ts on primary
      - Dual-write durable copies under .gate-evidence/tdd/
      - Confirm no product diffs to frozen surfaces
    - **MUST observe:**
      - `.tmp/sprint-25/redhat-fix-04-path.json exists and file size > 0`
      - `.tmp/sprint-25/redhat-fix-04-production-mutation.log exists and file size > 0`
      - `.tmp/sprint-25/redhat-fix-04-red.log exists and file size > 0`
      - `jq path field equals 'A' on .tmp/sprint-25/redhat-fix-04-path.json`
      - `git status --porcelain for frozen product files is empty string (0 dirty lines)`
    - **MUST NOT observe:**
      - `empty/start signature: any of three files size == 0`
      - `path field equals 'B'`
      - `frozen product file dirty in git status (chat-runs.ts or use-resumable-sse-stream.ts modified)`
      - `0-byte placeholders (size == 0)`

## Test Criteria

| ID | Statement | Maps to | Verify |
|---|---|---|---|
| TC-1 | REDHAT-FIX-04 TC-5 shell exits 0 on primary checkout (all three files + path==A) | AC-1 | `test -f .tmp/sprint-25/redhat-fix-04-red.log && test -f .tmp/sprint-25/redhat-fix-04-production-mutation.log && test -f .tmp/sprint-25/redhat-fix-04-path.json && jq -e '.path=="A"' .tmp/sprint-25/redhat-fix-04-path.json` |
| TC-2 | All three evidence files non-empty; mutation.log contains production-assembly-reset kill + correct exit=0 | AC-2 | `test -s .tmp/sprint-25/redhat-fix-04-red.log && test -s .tmp/sprint-25/redhat-fix-04-production-mutation.log && test -s .tmp/sprint-25/redhat-fix-04-path.json && jq -e '.path=="A"' .tmp/sprint-25/redhat-fix-04-path.json && rg -E 'production-assembly-reset.*(failures=[1-9]|exit=[1-9]|exit_nonzero|KILLED)' .tmp/sprint-25/redhat-fix-04-production-mutation.log && rg -q 'correct.*(exit=0|exit_ok=true|failures=0)' .tmp/sprint-25/redhat-fix-04-production-mutation.log` |
| TC-3 | Durable committed copies exist under sprint .gate-evidence/tdd/ with path A and non-empty logs | AC-3 | `test -s .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/.gate-evidence/tdd/redhat-fix-04-path.json && test -s .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/.gate-evidence/tdd/redhat-fix-04-production-mutation.log && test -s .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/.gate-evidence/tdd/redhat-fix-04-red.log && jq -e '.path=="A"' .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/.gate-evidence/tdd/redhat-fix-04-path.json` |
| TC-4 | Product freeze: no dirty frozen backend/H3 product files for this task | AC-4 | `git status --porcelain -- services/platform/src/http/chat-runs.ts services/platform/src/db/seed-e2e.ts services/platform/src/research/progress.ts services/platform/src/mcp/executor.ts hooks/use-resumable-sse-stream.ts \| test -z "$(cat)"` |
| TC-5 | Optional regenerate path: production-hook suite runs on primary and leaves contract files present | AC-4 | `pnpm vitest run tests/integration/redhat-fix-04-production-hook-reconnect.test.ts ; test -f .tmp/sprint-25/redhat-fix-04-red.log && test -f .tmp/sprint-25/redhat-fix-04-production-mutation.log && test -f .tmp/sprint-25/redhat-fix-04-path.json && jq -e '.path=="A"' .tmp/sprint-25/redhat-fix-04-path.json` |

## Reading List

- `.spec/reviews/red-hat-sprint25-reactive-20260725T211242Z.md` — G-3 PARTIAL (cycle 3; fix-04 evidence hygiene only remaining blocker)
- `.spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/REDHAT-FIX-04-fix-production-hook-mutation-test-assemblyref.md` — AC-5 / TC-5 contract command
- `.spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/REDHAT-FIX-06-restore-tdd-evidence-chain-path-json-red-logs.md` — pattern to mirror (durable `.gate-evidence/tdd/` + force-add or self-seed)
- `.kb-run-sprint/worktrees/REDHAT-FIX-04/.tmp/sprint-25/redhat-fix-04-path.json` — source path A
- `.kb-run-sprint/worktrees/REDHAT-FIX-04/.tmp/sprint-25/redhat-fix-04-production-mutation.log` — source mutation kill log
- `.kb-run-sprint/worktrees/REDHAT-FIX-04/.tmp/sprint-25/redhat-fix-04-red.log` — source RED baseline
- `tests/integration/redhat-fix-04-production-hook-reconnect.test.ts` — EVIDENCE_DIR `.tmp/sprint-25`; self-generates path/mutation artifacts
- `.spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/.gate-evidence/tdd/` — existing FIX-01/02 durable pattern
- `.gitignore` — `.tmp/` gitignore implication for commit strategy

## Guardrails

### WRITE-ALLOWED
- `.tmp/sprint-25/redhat-fix-04-path.json` (RESTORE)
- `.tmp/sprint-25/redhat-fix-04-production-mutation.log` (RESTORE)
- `.tmp/sprint-25/redhat-fix-04-red.log` (RESTORE)
- `.spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/.gate-evidence/tdd/redhat-fix-04-path.json` (NEW durable)
- `.spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/.gate-evidence/tdd/redhat-fix-04-production-mutation.log` (NEW durable)
- `.spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/.gate-evidence/tdd/redhat-fix-04-red.log` (NEW durable)
- `tests/integration/redhat-fix-04-production-hook-reconnect.test.ts` (MODIFY only if minimal self-seed bootstrap of the three evidence files is required — prefer pure copy+commit)
- `.gitignore` (MODIFY only if team decides to un-ignore specific redhat-fix-04 evidence — prefer durable `.gate-evidence` + force-add over broad `.tmp` un-ignore)

### WRITE-PROHIBITED
- `hooks/use-resumable-sse-stream.ts` — H3 closed by REDHAT-FIX-04; do not re-open product behavior
- `services/platform/src/http/chat-runs.ts` — SSE backend freeze
- `services/platform/src/db/seed-e2e.ts` — H1 closed
- `services/platform/src/research/progress.ts` — H2 closed
- `services/platform/src/mcp/executor.ts` — S-REACTIVE-03 strongest surface; non-regressed
- Flipping path.json to B
- Inventing empty/0-byte red or mutation logs
- Leaving evidence only under `.kb-run-sprint/worktrees/REDHAT-FIX-04/`
- Re-litigating H3 production-assembly-reset mutant kills

## Design

- **References:** `.spec/reviews/red-hat-sprint25-reactive-20260725T211242Z.md#G-3`, `REDHAT-FIX-04 AC-5/TC-5`, `REDHAT-FIX-06 dual durability pattern`, worktree source triad, `tests/integration/redhat-fix-04-production-hook-reconnect.test.ts`
- **Pattern:** Copy or regenerate TDD evidence to contract path; dual-write durable `.gate-evidence/tdd/`
- **Pattern source:** REDHAT-FIX-06
- **Anti-pattern:** Leave evidence only in worktree; invent 0-byte placeholders; flip path to B; re-open H3 product code; strip kill lines from mutation.log
- **Interaction notes:**
  - Recommended procedure: `mkdir -p .tmp/sprint-25` and sprint `.gate-evidence/tdd`; if worktree present: `cp .kb-run-sprint/worktrees/REDHAT-FIX-04/.tmp/sprint-25/redhat-fix-04-{path.json,production-mutation.log,red.log} .tmp/sprint-25/`; else: `pnpm vitest run tests/integration/redhat-fix-04-production-hook-reconnect.test.ts`; dual-write durable copies; `git add` durable `.gate-evidence/tdd/redhat-fix-04-*`; optionally `git add -f .tmp/sprint-25/redhat-fix-04-*`; commit; re-run TC-5 shell.
  - Worktree path.json content is `{"path":"A","task":"REDHAT-FIX-04"}`; TC-5 only requires `.path=="A"`.
  - Worktree mutation.log already shows correct exit=0 failures=0 and production-assembly-reset exit=1 failures=1 KILLED — prefer copy of that sound log.
  - REDHAT-FIX-06 already restored fix-01/02 evidence; this task only covers fix-04 three-file recurrence.
  - No mobile UI changes; SafeArea/touch N/A.
  - M5 typecheck regression in the FIX-04 test file (NodeXMLHttpRequest) is OUT OF SCOPE for this chore unless regenerating the suite fails hard — do not expand into type fixes here.
  - Closes G-3 partial only; H3/G-2 already CLOSED — do not re-litigate.

## Agent Assignment

- **Agent:** `react-native-ui-implementer`
- **Rationale:** Owns process/evidence hygiene for REDHAT-FIX-04's TC-5 cold-checkout artifacts (path.json + production mutation log + RED log) at the contract-mandated `.tmp/sprint-25/` paths. This is the cycle-3 G-3 PARTIAL recurrence of the same class REDHAT-FIX-06 closed for FIX-01/02; no product behavior changes. Reviewer: react-native-ui-reviewer (evidence location + PATH-A honesty + non-empty mutation kill log); mastra-reviewer optional dual-lens on PATH-A freeze + frozen backend surfaces.
- **Reviewer:** `react-native-ui-reviewer`
- **Proposed by:** `react-native-ui-planner` (plus mastra-planner contract enrichments at consolidation)

## Agent Instructions

1. Prefer copy-from-worktree when source triad exists and is sound (cycle-3 report: underlying evidence honest).
2. Dual-write durable `.gate-evidence/tdd/` copies; force-add `.tmp` only if policy allows.
3. Run verification gates (TC-5 shell + content integrity + durable copies + product freeze).
4. Do not re-open H3 product code or frozen backend surfaces.
5. Do not invent empty red/mutation logs.

## Verification Gates

| Gate | Command | Expected |
|---|---|---|
| REDHAT-FIX-04 TC-5 cold-checkout | `test -f .tmp/sprint-25/redhat-fix-04-red.log && test -f .tmp/sprint-25/redhat-fix-04-production-mutation.log && test -f .tmp/sprint-25/redhat-fix-04-path.json && jq -e '.path=="A"' .tmp/sprint-25/redhat-fix-04-path.json` | Exit 0 |
| Non-empty content + mutation kill evidence | `test -s .tmp/sprint-25/redhat-fix-04-red.log && test -s .tmp/sprint-25/redhat-fix-04-production-mutation.log && test -s .tmp/sprint-25/redhat-fix-04-path.json && rg -E 'production-assembly-reset.*(failures=[1-9]|exit=[1-9]|exit_nonzero|KILLED)' .tmp/sprint-25/redhat-fix-04-production-mutation.log && rg -q 'correct.*(exit=0|exit_ok=true|failures=0)' .tmp/sprint-25/redhat-fix-04-production-mutation.log` | Exit 0 |
| Durable .gate-evidence/tdd copies | `test -s .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/.gate-evidence/tdd/redhat-fix-04-path.json && test -s .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/.gate-evidence/tdd/redhat-fix-04-production-mutation.log && test -s .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/.gate-evidence/tdd/redhat-fix-04-red.log && jq -e '.path=="A"' .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/.gate-evidence/tdd/redhat-fix-04-path.json` | Exit 0 |
| Product freeze | `git status --porcelain -- services/platform/src/http/chat-runs.ts services/platform/src/db/seed-e2e.ts services/platform/src/research/progress.ts services/platform/src/mcp/executor.ts hooks/use-resumable-sse-stream.ts` | Empty output |
| Optional suite regenerate (if worktree absent) | `pnpm vitest run tests/integration/redhat-fix-04-production-hook-reconnect.test.ts` | Suite green or evidence files generated; TC-5 then exit 0 |

## Dependencies

- **depends_on:** REDHAT-FIX-04, REDHAT-FIX-06
- **blocks:** —

## Review Criteria

- Every AC/TC stable; behavioral ACs pass `validate_scenario` with 0 CRITICAL
- Source finding G-3 PARTIAL closed with evidence at contract-mandated paths (not worktree-only)
- Writes only under WRITE-ALLOWED
- PATH-A freeze holds; mutation kill honesty preserved; product freeze holds
- Evidence artifacts at contract-mandated paths

## Notes

- Mastra enrichments folded at consolidation: PATH-A freeze, mutation-log kill honesty (correct exit=0 + production-assembly-reset KILLED), backend product freeze (chat-runs/progress/seed-e2e/executor), dual durability pattern.
- Contract: MUST-PRESERVE PATH-A — path.json `{"path":"A"}` only; PATH-B without gate re-scope is forbidden.
- Contract: MUST-PRESERVE mutation kill honesty — production-assembly-reset exit non-zero / failures>=1 / KILLED and correct exit=0; do not fabricate.
- Contract: MUST-PRESERVE non-empty red.log — red_first historical capture; 0-byte stubs fail integrity.
- Contract: MUST-PRESERVE frozen backend surfaces — chat-runs.ts afterSeq filter, progress.ts writer, seed-e2e Streaming seed, executor.ts p95 — zero product edits this task.
- Contract: MUST-PRESERVE H3 production unit createResumableSseController / useResumableSSEStream thin adapter — evidence location only; do not re-open product.
- Contract: MUST-PROVE cold-checkout — REDHAT-FIX-04 TC-5 exits 0 without `.kb-run-sprint/worktrees` dependency.
- Contract: MUST dual-write durable `.gate-evidence/tdd/` (REDHAT-FIX-06 pattern) because `.tmp/` is gitignored.
- Contract: MUST-NOT re-litigate H3/G-2 (CLOSED cycle-3); this task closes only G-3 PARTIAL recurrence on fix-04 evidence location.
- Suggested implementer commit message: `fix(sprint-25): restore REDHAT-FIX-04 TDD evidence at TC-5 path (G-3 partial)`

<!-- REQUIREMENT-CONTRACT v1
-->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-07",
  "proposed_by": "react-native-ui-planner",
  "tdd_mode": "skipped",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": false,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "worktree-fix04-evidence": {
      "description": "Sound REDHAT-FIX-04 TDD evidence currently only in REDHAT-FIX-04 worktree .tmp/sprint-25/",
      "seed_method": "cli",
      "records": [
        "redhat-fix-04-path.json",
        "redhat-fix-04-production-mutation.log",
        "redhat-fix-04-red.log"
      ]
    },
    "tc5-mandated-paths-fix04": {
      "description": "Contract-mandated primary-checkout locations for REDHAT-FIX-04 TC-5",
      "seed_method": "cli",
      "records": [
        ".tmp/sprint-25/redhat-fix-04-path.json",
        ".tmp/sprint-25/redhat-fix-04-production-mutation.log",
        ".tmp/sprint-25/redhat-fix-04-red.log"
      ]
    },
    "durable-gate-evidence-fix04": {
      "description": "Git-trackable durable copies under sprint .gate-evidence/tdd/",
      "seed_method": "cli",
      "records": [
        ".spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/.gate-evidence/tdd/redhat-fix-04-path.json",
        ".spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/.gate-evidence/tdd/redhat-fix-04-production-mutation.log",
        ".spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/.gate-evidence/tdd/redhat-fix-04-red.log"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN a primary checkout that does not depend on .kb-run-sprint/worktrees WHEN REDHAT-FIX-04 TC-5 shell verify runs THEN it exits 0: all three contract files exist under .tmp/sprint-25/ and jq accepts path==\"A\"",
      "verify": "test -f .tmp/sprint-25/redhat-fix-04-red.log && test -f .tmp/sprint-25/redhat-fix-04-production-mutation.log && test -f .tmp/sprint-25/redhat-fix-04-path.json && jq -e '.path==\"A\"' .tmp/sprint-25/redhat-fix-04-path.json",
      "maps_to_ac": null,
      "flow_ref": "UC-SYNC-02",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "filesystem + jq TC-5 on primary checkout",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "empty \u2014 three files only under .kb-run-sprint/worktrees/REDHAT-FIX-04/.tmp/sprint-25/ (current G-3 PARTIAL)",
            "stub \u2014 only redhat-fix-04-ac1-api-response.json present without the three TC-5 files",
            "disconnect \u2014 path.json missing path key or path != A",
            "static \u2014 files never written on primary cold checkout"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "tc5-mandated-paths-fix04",
            "action": {
              "actor": "cli_user",
              "steps": [
                "mkdir -p .tmp/sprint-25",
                "Copy the three TC-5 files from worktree OR regenerate via vitest on primary",
                "Run REDHAT-FIX-04 TC-5 shell verify on primary checkout without referencing worktrees"
              ]
            },
            "end_state": {
              "must_observe": [
                ".tmp/sprint-25/redhat-fix-04-red.log exists and file size > 0",
                ".tmp/sprint-25/redhat-fix-04-production-mutation.log exists and file size > 0",
                ".tmp/sprint-25/redhat-fix-04-path.json exists and file size > 0",
                "jq '.path' equals 'A' on .tmp/sprint-25/redhat-fix-04-path.json",
                "TC-5 shell command exit code == 0 on primary checkout"
              ],
              "must_not_observe": [
                "empty/start signature: test -f fails on primary for any of the three files (size == 0 or missing)",
                "evidence only under worktrees (primary contract paths empty)",
                "path field equals null or empty string '' or path equals 'B'"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN worktree evidence is sound (or suite regenerates honestly) WHEN this task completes THEN all three primary .tmp/sprint-25/ files are non-empty, path.json path==\"A\", and production-mutation.log contains production-assembly-reset kill evidence plus correct-path exit=0",
      "verify": "test -s .tmp/sprint-25/redhat-fix-04-red.log && test -s .tmp/sprint-25/redhat-fix-04-production-mutation.log && test -s .tmp/sprint-25/redhat-fix-04-path.json && jq -e '.path==\"A\"' .tmp/sprint-25/redhat-fix-04-path.json && rg -E 'production-assembly-reset.*(failures=[1-9]|exit=[1-9]|exit_nonzero|KILLED)' .tmp/sprint-25/redhat-fix-04-production-mutation.log && rg -q 'correct.*(exit=0|exit_ok=true|failures=0)' .tmp/sprint-25/redhat-fix-04-production-mutation.log",
      "maps_to_ac": null,
      "flow_ref": "UC-SYNC-02",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "filesystem content integrity + rg/jq content checks",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "empty \u2014 0-byte placeholders at contract paths",
            "stub \u2014 mutation.log present but no production-assembly-reset kill line",
            "static \u2014 path.json path field not A",
            "mock \u2014 invented empty red_first / mutation narrative without real content"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "worktree-fix04-evidence",
            "action": {
              "actor": "cli_user",
              "steps": [
                "Copy sound worktree files to .tmp/sprint-25/ OR re-run production-hook suite on primary",
                "Assert non-empty sizes with test -s",
                "jq path==A; rg production-assembly-reset kill + correct exit=0 in mutation.log"
              ]
            },
            "end_state": {
              "must_observe": [
                "redhat-fix-04-red.log size > 0",
                "redhat-fix-04-production-mutation.log size > 0",
                "redhat-fix-04-path.json size > 0 and path == 'A'",
                "mutation.log contains production-assembly-reset KILLED or exit=1 failures=1 kill evidence",
                "mutation.log contains correct path exit=0 / failures=0"
              ],
              "must_not_observe": [
                "empty/start signature: any of the three files size == 0",
                "mutation.log without production-assembly-reset kill evidence",
                "path field equals 'B' or missing",
                "correct and mutant both failures==0 (SURVIVES)"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN .tmp/ is gitignored WHEN durability is required for cold clone recovery THEN durable copies of the three REDHAT-FIX-04 evidence files exist under sprint .gate-evidence/tdd/ (committed) with path==A and non-empty logs, OR the three .tmp files are force-added with git add -f and present after clone",
      "verify": "test -s .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/.gate-evidence/tdd/redhat-fix-04-path.json && test -s .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/.gate-evidence/tdd/redhat-fix-04-production-mutation.log && test -s .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/.gate-evidence/tdd/redhat-fix-04-red.log && jq -e '.path==\"A\"' .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/.gate-evidence/tdd/redhat-fix-04-path.json",
      "maps_to_ac": null,
      "flow_ref": "UC-SYNC-02",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "git-tracked durable evidence OR force-added .tmp files + cold-checkout simulation",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "empty \u2014 only gitignored .tmp holds artifacts with no durable copy and no force-add",
            "stub \u2014 durable copies empty or wrong filenames",
            "static \u2014 worktree-only evidence with no committed recovery path",
            "mock \u2014 durable path.json content not matching PATH-A"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "durable-gate-evidence-fix04",
            "action": {
              "actor": "cli_user",
              "steps": [
                "mkdir -p sprint .gate-evidence/tdd",
                "Copy the three files into .gate-evidence/tdd/ and keep .tmp/sprint-25/ populated for TC-5",
                "git add durable .gate-evidence/tdd/redhat-fix-04-*; optionally git add -f .tmp/sprint-25/redhat-fix-04-*"
              ]
            },
            "end_state": {
              "must_observe": [
                "durable .gate-evidence/tdd/redhat-fix-04-path.json exists and size > 0 with path == 'A'",
                "durable .gate-evidence/tdd/redhat-fix-04-production-mutation.log exists and size > 0",
                "durable .gate-evidence/tdd/redhat-fix-04-red.log exists and size > 0",
                "TC-5-mandated .tmp paths still satisfied (all three sizes > 0) OR documented force-add leaves them tracked"
              ],
              "must_not_observe": [
                "empty/start signature: no durable and no force-added .tmp files (all sizes == 0)",
                "evidence only under .kb-run-sprint/worktrees/ (primary durable empty)"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN worktree evidence may or may not still exist WHEN implementer restores evidence THEN prefer filesystem copy from worktree if present, else regenerate via pnpm vitest run tests/integration/redhat-fix-04-production-hook-reconnect.test.ts on primary; NEVER invent empty placeholders; no product code changes to frozen backend/client H3 surfaces",
      "verify": "test -s .tmp/sprint-25/redhat-fix-04-path.json && test -s .tmp/sprint-25/redhat-fix-04-production-mutation.log && test -s .tmp/sprint-25/redhat-fix-04-red.log && jq -e '.path==\"A\"' .tmp/sprint-25/redhat-fix-04-path.json && git status --porcelain -- services/platform/src/http/chat-runs.ts services/platform/src/db/seed-e2e.ts services/platform/src/research/progress.ts services/platform/src/mcp/executor.ts hooks/use-resumable-sse-stream.ts | test -z \"$(cat)\"",
      "maps_to_ac": null,
      "flow_ref": "UC-SYNC-02",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "procedure audit + product freeze git status + optional vitest regenerate",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "empty \u2014 invent 0-byte logs when worktree missing instead of running suite regenerate",
            "stub \u2014 edit product hook/backend files unrelated to evidence restore",
            "static \u2014 leave evidence only in worktree and claim done",
            "mock \u2014 flip path to B or re-open H3 product rework"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "worktree-fix04-evidence",
            "action": {
              "actor": "cli_user",
              "steps": [
                "If worktree files exist: cp triad to .tmp/sprint-25/",
                "Else: pnpm vitest run tests/integration/redhat-fix-04-production-hook-reconnect.test.ts on primary",
                "Dual-write durable copies under .gate-evidence/tdd/",
                "Confirm no product diffs to frozen surfaces"
              ]
            },
            "end_state": {
              "must_observe": [
                ".tmp/sprint-25/redhat-fix-04-path.json exists and file size > 0",
                ".tmp/sprint-25/redhat-fix-04-production-mutation.log exists and file size > 0",
                ".tmp/sprint-25/redhat-fix-04-red.log exists and file size > 0",
                "jq path field equals 'A' on .tmp/sprint-25/redhat-fix-04-path.json",
                "git status --porcelain for frozen product files is empty string (0 dirty lines)"
              ],
              "must_not_observe": [
                "empty/start signature: any of three files size == 0",
                "path field equals 'B'",
                "frozen product file dirty in git status (chat-runs.ts or use-resumable-sse-stream.ts modified)",
                "0-byte placeholders (size == 0)"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "REDHAT-FIX-04 TC-5 shell exits 0 on primary checkout (all three files + path==A)",
      "verify": "test -f .tmp/sprint-25/redhat-fix-04-red.log && test -f .tmp/sprint-25/redhat-fix-04-production-mutation.log && test -f .tmp/sprint-25/redhat-fix-04-path.json && jq -e '.path==\"A\"' .tmp/sprint-25/redhat-fix-04-path.json",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "All three evidence files non-empty; mutation.log contains production-assembly-reset kill + correct exit=0",
      "verify": "test -s .tmp/sprint-25/redhat-fix-04-red.log && test -s .tmp/sprint-25/redhat-fix-04-production-mutation.log && test -s .tmp/sprint-25/redhat-fix-04-path.json && jq -e '.path==\"A\"' .tmp/sprint-25/redhat-fix-04-path.json && rg -E 'production-assembly-reset.*(failures=[1-9]|exit=[1-9]|exit_nonzero|KILLED)' .tmp/sprint-25/redhat-fix-04-production-mutation.log && rg -q 'correct.*(exit=0|exit_ok=true|failures=0)' .tmp/sprint-25/redhat-fix-04-production-mutation.log",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Durable committed copies exist under sprint .gate-evidence/tdd/ with path A and non-empty logs",
      "verify": "test -s .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/.gate-evidence/tdd/redhat-fix-04-path.json && test -s .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/.gate-evidence/tdd/redhat-fix-04-production-mutation.log && test -s .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/.gate-evidence/tdd/redhat-fix-04-red.log && jq -e '.path==\"A\"' .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/.gate-evidence/tdd/redhat-fix-04-path.json",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Product freeze: no dirty frozen backend/H3 product files for this task",
      "verify": "git status --porcelain -- services/platform/src/http/chat-runs.ts services/platform/src/db/seed-e2e.ts services/platform/src/research/progress.ts services/platform/src/mcp/executor.ts hooks/use-resumable-sse-stream.ts | test -z \"$(cat)\"",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "Optional regenerate path: production-hook suite runs on primary and leaves contract files present",
      "verify": "pnpm vitest run tests/integration/redhat-fix-04-production-hook-reconnect.test.ts ; test -f .tmp/sprint-25/redhat-fix-04-red.log && test -f .tmp/sprint-25/redhat-fix-04-production-mutation.log && test -f .tmp/sprint-25/redhat-fix-04-path.json && jq -e '.path==\"A\"' .tmp/sprint-25/redhat-fix-04-path.json",
      "maps_to_ac": "AC-4"
    }
  ]
}
-->
