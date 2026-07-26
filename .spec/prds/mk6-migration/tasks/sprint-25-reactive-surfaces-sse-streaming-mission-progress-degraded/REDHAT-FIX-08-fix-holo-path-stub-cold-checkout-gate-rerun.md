# REDHAT-FIX-08 — Fix the `holo` PATH stub — wire cold-checkout dispatch via repo `./bin/holo` → `services/platform/src/cli/holo.ts` so gate step 1 (`seed:e2e`) is re-runnable; re-run full 5-step gate and commit fresh `gate-results.json`
> Status: ✅ Completed
> Cycle: 1
> Reviewer: product-manager+technical
> Completed: 2026-07-26T05:32:55Z
> Sprint: [Sprint 25: Reactive Surfaces — SSE Streaming, Mission Progress, Degraded](./SPRINT.md)
> Agent: react-native-ui-implementer
> Estimate: 30 min
> Type: CHORE
> Priority: P0
> Effort: S
> Proposed by: react-native-ui-planner
> TDD_MODE: skipped · RED_GREEN_REQUIRED: no · SEEDED_EVIDENCE_REQUIRED: yes
> Source finding: `.spec/reviews/red-hat-sprint25-reactive-20260725T225400Z.md#F-E1`

## Outcome

On a cold checkout: test -x bin/holo && bin/holo seed:e2e --reset (or pnpm seed:e2e) succeeds without depending on ~/.local/bin/holo; SPRINT.md/GATE-RESULTS.md/gate-results.json step-1 text use the cold-checkout-safe command; gate-results.json exists with verdict pass, steps 5/5, NEW run_id, written_at > 2026-07-25T22:44:09Z; GATE-RESULTS.md cites the same run_id; this-cycle step-1-seed.log shows Streaming seed; frozen product files remain untouched.

## Background

- **Finding:** .spec/reviews/red-hat-sprint25-reactive-20260725T225400Z.md#F-E1 + G-2-REGRESSED
- **Red-hat report:** `.spec/reviews/red-hat-sprint25-reactive-20260725T225400Z.md`
- **Why it matters:** Cycle-4 closed G-3 (REDHAT-FIX-07) and re-verified H3. The **only remaining blocker** for an unqualified Sprint 25 close is F-E1: gate step 1 (`holo seed:e2e --reset`) is not re-runnable on a cold checkout because PATH `holo` is a stub limited to `verify:no-convex-client` (exit 127). An aborted re-run using that stub deleted `gate-results.json` (G-2-REGRESSED).
- **PRD refs:** UC-SYNC-02, T-SYNC-006, T-SYNC-005, T-SYNC-007, T-INFER-015
- **Capability:** CAP-SYNC-01
- **Specialists:** proposed_by react-native-ui-planner; boundary enrichments from mastra-planner (verify:no-convex-client preservation, PATH-stripped cold-checkout, fail-closed exit-127, broader product freeze).

## Critical Constraints

### MUST
- MUST make seed:e2e re-runnable on a cold checkout WITHOUT depending on broken ~/.local/bin/holo stub alone — prefer ./bin/holo seed:e2e --reset and/or pnpm seed:e2e with package.json bin install surface
- MUST preserve verify:no-convex-client via ./bin/holo or pnpm verify:no-convex-client
- MUST update SPRINT.md Human Test Deliverable step 1 so the documented command is cold-checkout-safe; if bare holo remains, MUST fix how holo resolves on cold clone in-repo
- MUST re-run the full Sprint 25 5-step human gate against current HEAD using the fixed dispatch path for step 1
- MUST produce fresh gate-results.json with NEW run_id ≠ s25-ht-20260725T203604Z and ≠ s25-ht-20260725T155918Z and ≠ s25-ht-20260725T224451Z; written_at after 2026-07-25T22:44:09Z
- MUST restore/replace overwritten .gate-evidence/step-1-seed.log with this-cycle successful seed evidence
- MUST update GATE-RESULTS.md to match the fresh run
- MUST fail-closed: no verdict:pass if step 1 exits 127 or any step fails
- MUST keep gate-results.prev.json as historical archive

### NEVER
- NEVER claim gate pass with missing gate-results.json
- NEVER only bump written_at on gate-results.prev.json without a real this-cycle re-run after F-E1 fix
- NEVER re-open H3/H1/H2 product work on frozen surfaces
- NEVER leave gate step 1 documenting bare holo seed:e2e --reset without a cold-checkout path
- NEVER write verdict:pass when step 1 exited 127
- NEVER invent empty/0-byte step evidence logs
- NEVER delete gate-results.prev.json
- NEVER depend solely on replacing ~/.local/bin/holo as the only fix (operator-local; does not survive cold clone alone)

### STRICTLY
- STRICTLY tdd_mode skipped (process/executability chore) — no product RED→GREEN ceremony
- STRICTLY requires_seeded_evidence true — full 5-step gate re-run is the behavioral seed
- STRICTLY requires_tests true — smoke/integration checks on CLI dispatch plus gate artifact checks
- STRICTLY fail-closed gate write: only emit verdict pass when steps_passed == steps_executed == steps_total and every required log is non-empty
- STRICTLY gate-results.json schema parity with gate-results.prev.json
- STRICTLY written_at is wall-clock of THIS run; must be >= 2026-07-25T22:44:09Z
- STRICTLY product freeze on frozen surfaces; CLI dispatcher / docs / gate artifacts only
- STRICTLY step-1 command in gate-results.json text and GATE-RESULTS.md must match the cold-checkout-safe invocation actually used

## Specification

**Objective:** Close cycle-4 F-E1 (HIGH executability) and G-2-REGRESSED by making Sprint 25 gate step 1 re-runnable on a cold checkout via in-repo ./bin/holo → services/platform/src/cli/holo.ts dispatch (plus package bin / documented pnpm seed:e2e), updating gate docs so they do not lie about bare PATH holo, then re-running the full 5-step human gate against HEAD and publishing a fresh gate-results.json + GATE-RESULTS.md that post-dates REDHAT-FIX-07.

**Success state:** On a cold checkout: test -x bin/holo && bin/holo seed:e2e --reset (or pnpm seed:e2e) succeeds without depending on ~/.local/bin/holo; SPRINT.md/GATE-RESULTS.md/gate-results.json step-1 text use the cold-checkout-safe command; gate-results.json exists with verdict pass, steps 5/5, NEW run_id, written_at > 2026-07-25T22:44:09Z; GATE-RESULTS.md cites the same run_id; this-cycle step-1-seed.log shows Streaming seed; frozen product files remain untouched.

## Capability Chain

- **Touches:** CAP-SYNC-01
- **Provides:** cold-checkout-holo-dispatch, fresh-gate-results-post-fix07, gate-step1-seed-command-truth, gate-step1-fail-closed-on-unknown-command
- **Consumes:** honest-streaming-seed-oracle, production-hook-sse-reconnect-mutation-oracle, research-iteration-writer, redhat-fix-04-cold-checkout-tdd-evidence, platform-cli-seed-e2e, in-repo-bin-holo-dispatcher
- **Boundary contracts:**
  - Gate step 1 MUST be re-runnable on a cold checkout without depending on the broken operator PATH stub at ~/.local/bin/holo alone
  - Documented gate command MUST resolve via repo-relative ./bin/holo and/or pnpm seed:e2e / pnpm exec holo (package.json bin maps holo → ./bin/holo)
  - bin/holo MUST exec bun services/platform/src/cli/holo.ts "$@" (already true on primary — preserve; do not regress to PATH stub)
  - verify:no-convex-client MUST remain invokable via ./bin/holo verify:no-convex-client or pnpm verify:no-convex-client
  - Fail-closed: if seed:e2e exits 127, gate-results.json MUST NOT have verdict==pass
  - gate-results.json MUST exist at sprint folder with schema parity to gate-results.prev.json
  - run_id MUST be NEW: not s25-ht-20260725T203604Z and not s25-ht-20260725T155918Z and not s25-ht-20260725T224451Z
  - written_at MUST be ISO-8601 UTC strictly AFTER REDHAT-FIX-07 completion 2026-07-25T22:44:09Z
  - GATE-RESULTS.md MUST cite the same run_id and verdict as gate-results.json
  - Product freeze: do NOT edit hooks/use-resumable-sse-stream.ts, chat-runs.ts, seed-e2e.ts, progress.ts, executor.ts, mission-research.ts, mission/cycle.ts for product behavior
  - H1/H2/H3/G-3 CLOSED — this task is F-E1 + G-2-REGRESSED only

## Acceptance Criteria

### AC-1: Cold-checkout in-repo holo dispatch for seed:e2e succeeds
- **Description:** GIVEN A primary/cold checkout where PATH holo may still resolve to the broken ~/.local/bin/holo stub that only implements verify:no-convex-client WHEN The operator runs the cold-checkout-safe gate step 1 command via repo-relative ./bin/holo seed:e2e --reset (or documented pnpm seed:e2e) THEN Command exits non-127; stdout/log shows seed activity; dispatch path is bun services/platform/src/cli/holo.ts via bin/holo — not the 1KB PATH stub
- **Test tier:** `integration` · **Verification service:** `bin/holo + services/platform/src/cli/holo.ts seed:e2e + filesystem` · **Flow ref:** `UC-SYNC-02`
- **Verify:** `test -x bin/holo && bin/holo 2>&1 | rg -q 'seed:e2e|Commands|Usage' && (bin/holo seed:e2e --reset >/tmp/redhat-fix-08-seed-smoke.log 2>&1; ec=$?; test $ec -ne 127; ! rg -q 'unknown command: seed:e2e' /tmp/redhat-fix-08-seed-smoke.log) && rg -n "case 'seed:e2e'" services/platform/src/cli/holo.ts && jq -e '.bin.holo=="./bin/holo"' package.json`
- **Scenario:** tier `visible` · test_tier `integration` · topology `single-node`
  - **Negative control — would fail if:** empty, stub, static, mock
  - **Evidence:** artifact `stdout`, required_capture=True
  - **Case 1** — start_ref `cold-checkout-holo-dispatch`: actor `cli_user`
    - **Steps:**
      - Confirm test -x bin/holo
      - Run bin/holo (no args) and observe full usage listing seed:e2e
      - Run bin/holo seed:e2e --reset without relying on PATH holo
      - Capture stdout/stderr; assert exit is not 127 and output is not unknown command
    - **MUST observe:**
      - `bin/holo is executable and test -x exits 0`
      - `bin/holo usage output contains literal 'seed:e2e'`
      - `bin/holo seed:e2e --reset exit code is not 127`
      - `package.json bin.holo equals literal './bin/holo'`
      - `seed smoke log size > 0`
    - **MUST NOT observe:**
      - `empty/start signature: holo: unknown command: seed:e2e from ./bin/holo`
      - `exit code equals 127 for bin/holo seed:e2e --reset`
      - `bin/holo missing (size == 0 or not executable)`

### AC-2: PATH-stub documented/neutralized; verify:no-convex-client preserved
- **Description:** GIVEN SPRINT.md currently documents bare holo seed:e2e --reset while PATH holo is the broken stub WHEN Implementer lands the durable cold-checkout fix (docs + in-repo dispatch; optional PATH install is not the sole fix) THEN SPRINT.md step 1 uses ./bin/holo seed:e2e --reset and/or pnpm seed:e2e with a PATH footnote; verify:no-convex-client remains invokable via ./bin/holo or pnpm script; bin/holo remains the platform CLI dispatcher
- **Test tier:** `integration` · **Verification service:** `SPRINT.md + bin/holo dispatcher + package scripts + PATH-stripped cold-checkout` · **Flow ref:** `n/a`
- **Verify:** `rg -n 'bin/holo seed:e2e|pnpm seed:e2e|pnpm exec holo seed:e2e' .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/SPRINT.md && rg -ni 'PATH stub|verify:no-convex-client|\.local/bin/holo|unknown command|cold.?checkout' .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/SPRINT.md && head -40 bin/holo | rg -q 'services/platform/src/cli/holo.ts|exec' && rg -n "case 'verify:no-convex-client'" services/platform/src/cli/holo.ts && jq -e '.scripts["verify:no-convex-client"]|length>0' package.json && env PATH="/usr/bin:/bin:/usr/local/bin:$HOME/.bun/bin" ./bin/holo 2>&1 | rg -q 'seed:e2e'`
- **Scenario:** tier `visible` · test_tier `integration` · topology `single-node`
  - **Negative control — would fail if:** static, stub, empty, disconnect
  - **Evidence:** artifact `file_artifact`, required_capture=True
  - **Case 1** — start_ref `cold-checkout-holo-dispatch`: actor `cli_user`
    - **Steps:**
      - Update SPRINT.md Human Test Deliverable item 1 to ./bin/holo seed:e2e --reset (or pnpm seed:e2e) with one-line PATH stub footnote
      - Confirm bin/holo still execs platform holo.ts
      - Confirm verify:no-convex-client still registered and invocable via bin/holo or package script
      - Simulate PATH without ~/.local/bin and confirm ./bin/holo still lists seed:e2e
      - Do not rely solely on ln -sf of operator ~/.local/bin/holo as the only durable fix
    - **MUST observe:**
      - `SPRINT.md contains literal './bin/holo seed:e2e' or 'pnpm seed:e2e' for step 1`
      - `SPRINT.md contains literal 'PATH stub' or 'verify:no-convex-client' or '.local/bin/holo' footnote`
      - `bin/holo head contains literal 'services/platform/src/cli/holo.ts'`
      - `package.json scripts.verify:no-convex-client length > 0`
      - `PATH-stripped ./bin/holo usage contains literal 'seed:e2e'`
    - **MUST NOT observe:**
      - `empty/start signature: only bare 'holo seed:e2e --reset' with no cold-checkout path and no PATH footnote (size == 0 durable fix)`
      - `bin/holo reduced to verify:no-convex-client-only stub (exit 127 for seed:e2e)`
      - `verify:no-convex-client removed from platform CLI (0 case matches) and package scripts`

### AC-3: PRIMARY — Full 5-step fresh gate-results.json after FIX-07 [PRIMARY]
- **Description:** GIVEN HEAD after REDHAT-FIX-01..07 with F-E1 dispatch fixed; gate-results.json currently missing (only .prev.json with s25-ht-20260725T203604Z); aborted run s25-ht-20260725T224451Z died at step 1 exit 127 WHEN The full 5-step human gate is executed against HEAD using the cold-checkout-safe step-1 command THEN Every step exits 0; fresh gate-results.json is written with verdict pass, steps_passed==5, NEW run_id, written_at >= 2026-07-25T22:44:09Z; this-cycle step evidence logs non-empty including restored Streaming seed log; no step exit 127
- **Test tier:** `e2e` · **Verification service:** `Maestro + bin/holo seed:e2e + named iOS Simulator + holocron_nonprod platform` · **Flow ref:** `UC-SYNC-02`
- **Verify:**
```bash
test -f .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/gate-results.json && jq -e '.verdict=="pass" and .steps_passed==5 and .steps_executed==5 and .steps_total==5 and .run_id != "s25-ht-20260725T203604Z" and .run_id != "s25-ht-20260725T155918Z" and .run_id != "s25-ht-20260725T224451Z" and (.written_at >= "2026-07-25T22:44:09Z")' .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/gate-results.json && python3 - <<'PY'
import json,pathlib
root=pathlib.Path('.spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded')
g=json.loads((root/'gate-results.json').read_text())
for s in g['steps']:
  p=pathlib.Path(s.get('evidence') or s.get('log') or '')
  assert p.is_file() and p.stat().st_size>0, s
  assert s.get('result')=='pass' and s.get('exit_code')==0, s
  assert s.get('exit_code')!=127
log=(root/'.gate-evidence'/'step-1-seed.log').read_text()
assert 'unknown command' not in log
assert 'Streaming' in log or 'conversations: 5' in log or 'conversations:5' in log
print('gate ok', g['run_id'], g['written_at'])
PY
```
- **Scenario:** tier `visible` · test_tier `e2e` · topology `single-node`
  - **Negative control — would fail if:** empty, stub, disconnect, static, mock
  - **Evidence:** artifact `file_artifact`, required_capture=True
  - **Case 1** — start_ref `sprint-25-gate-head-post-fix07`: actor `cli_user`
    - **Steps:**
      - Ensure platform + Zero + Metro + Simulator healthy
      - Step 1: ./bin/holo seed:e2e --reset (or pnpm seed:e2e); capture this-cycle step-1-seed.log with Streaming seed
      - Step 2: maestro test .maestro/reactive/reconnect-exactly-once.yml
      - Step 3: maestro test .maestro/reactive/research-progress-advances.yml
      - Step 4: bash .maestro/reactive/run-cross-surface-sync-slo.sh
      - Step 5: bash .maestro/reactive/run-degraded-no-hang.sh
      - Write gate-results.json with new run_id s25-ht-YYYYMMDDTHHMMSSZ and written_at=now UTC after 2026-07-25T22:44:09Z
      - Fail-closed: if any step non-zero, do not write verdict pass
    - **MUST observe:**
      - `gate-results.json path exists and file size > 0 at sprint folder`
      - `verdict equals 'pass'`
      - `steps_passed == 5 and steps_executed == 5 and steps_total == 5`
      - `run_id != 's25-ht-20260725T203604Z' and run_id != 's25-ht-20260725T155918Z' and run_id != 's25-ht-20260725T224451Z'`
      - `written_at >= '2026-07-25T22:44:09Z'`
      - `step-1-seed.log size > 0 and contains 'Streaming' or 'conversations:5'`
      - `each steps[].result equals 'pass' and exit_code equals 0`
    - **MUST NOT observe:**
      - `empty/start signature: gate-results.json missing (file size == 0 or absent)`
      - `run_id equals 's25-ht-20260725T203604Z'`
      - `run_id equals 's25-ht-20260725T155918Z'`
      - `verdict equals 'pass' with steps_passed < 5`
      - `step-1-seed.log contains 'unknown command: seed:e2e'`
      - `step 1 exit_code equals 127`

### AC-4: GATE-RESULTS.md parity + product freeze
- **Description:** GIVEN Fresh gate-results.json from AC-3 and frozen product surfaces from closed H1/H2/H3 WHEN GATE-RESULTS.md is updated and git status is checked for frozen files THEN GATE-RESULTS.md cites the same run_id, verdict, and written_at as gate-results.json; step-1 text matches the cold-checkout-safe command; frozen product files have empty porcelain status
- **Test tier:** `e2e` · **Verification service:** `GATE-RESULTS.md + gate-results.json + git product freeze` · **Flow ref:** `UC-SYNC-02`
- **Verify:**
```bash
python3 - <<'PY'
import json,pathlib
root=pathlib.Path('.spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded')
g=json.loads((root/'gate-results.json').read_text())
md=(root/'GATE-RESULTS.md').read_text()
assert g['run_id'] in md, g['run_id']
assert g['run_id'] not in ('s25-ht-20260725T203604Z','s25-ht-20260725T155918Z','s25-ht-20260725T224451Z')
assert g['verdict'] in md
assert 'bin/holo seed:e2e' in md or 'pnpm seed:e2e' in md or './bin/holo' in md
print('GATE-RESULTS.md parity OK', g['run_id'])
PY
git status --porcelain -- hooks/use-resumable-sse-stream.ts services/platform/src/http/chat-runs.ts services/platform/src/db/seed-e2e.ts services/platform/src/research/progress.ts services/platform/src/mcp/executor.ts services/platform/src/observability/mission-research.ts services/platform/src/mission/cycle.ts | test -z "$(cat)"
```
- **Scenario:** tier `visible` · test_tier `e2e` · topology `single-node`
  - **Negative control — would fail if:** static, empty, stub, disconnect
  - **Evidence:** artifact `file_artifact`, required_capture=True
  - **Case 1** — start_ref `gate-results-prev-schema`: actor `cli_user`
    - **Steps:**
      - Update GATE-RESULTS.md from fresh gate-results.json (verdict, run_id, written_at, 5 steps)
      - Ensure step-1 documentation uses ./bin/holo seed:e2e or pnpm seed:e2e
      - Confirm step-1 log for this run mentions Streaming or conversations:5
      - Run git status --porcelain on frozen product surfaces; expect empty
    - **MUST observe:**
      - `GATE-RESULTS.md contains fresh run_id matching gate-results.json run_id field (non-empty string length > 0)`
      - `GATE-RESULTS.md contains verdict literal matching gate-results.json 'pass'`
      - `GATE-RESULTS.md step-1 uses './bin/holo' or 'pnpm seed:e2e'`
      - `git status --porcelain for frozen product files is empty string (0 dirty lines)`
    - **MUST NOT observe:**
      - `empty/start signature: only pre-fix run_id 's25-ht-20260725T203604Z' as current in GATE-RESULTS.md`
      - `frozen product file dirty in git status (use-resumable-sse-stream.ts or chat-runs.ts modified; dirty line count > 0)`
      - `step-1 text claims success while log has 'unknown command: seed:e2e'`

## Test Criteria

| ID | Statement | Maps to | Type | Verify |
|----|-----------|---------|------|--------|
| TC-1 | bin/holo is executable and bin/holo seed:e2e --reset does not return exit 127 / unknown command | AC-1 | happy_path | `test -x bin/holo && (bin/holo seed:e2e --reset >/tmp/redhat-fix-08-tc1.log 2>&1; ec=$?; test $ec -ne 127; ! rg -q 'unkno…` |
| TC-2 | SPRINT.md documents cold-checkout-safe step-1 command and PATH stub truth; bin/holo remains platform CLI dispatcher; verify:no-convex-client preserved | AC-2 | happy_path | `rg -n 'bin/holo seed:e2e\|pnpm seed:e2e\|pnpm exec holo seed:e2e' .spec/prds/mk6-migration/tasks/sprint-25-reactive-surf…` |
| TC-3 | Fresh gate-results.json exists with pass, 5/5, new run_id, written_at after REDHAT-FIX-07 | AC-3 | happy_path | `test -f .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/gate-results.…` |
| TC-4 | This-cycle step evidence logs referenced by gate-results.json all exist, are non-empty, and step-1 is not the aborted unknown-command log | AC-3 | happy_path | `python3 - <<'PY' import json,pathlib root=pathlib.Path('.spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-s…` |
| TC-5 | GATE-RESULTS.md run_id/verdict match gate-results.json and are not the stale cycle-3 id; product freeze holds | AC-4 | happy_path | `python3 - <<'PY' import json,pathlib root=pathlib.Path('.spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-s…` |
| TC-6 | PATH-stripped cold checkout still exposes seed:e2e via ./bin/holo without ~/.local/bin | AC-2 | happy_path | `env PATH="/usr/bin:/bin:/usr/local/bin:$HOME/.bun/bin" ./bin/holo 2>&1 \| rg -q seed:e2e` |

## Reading List

- `.spec/reviews/red-hat-sprint25-reactive-20260725T225400Z.md` (39-55,130-135) — F-E1 HIGH executability + G-2-REGRESSED; fix options (a)(b)(c)
- `bin/holo` (1-40) — Primary-checkout dispatcher already execs bun services/platform/src/cli/holo.ts
- `package.json` (7-8,35-40) — bin.holo → ./bin/holo; scripts.seed:e2e and verify:no-convex-client
- `services/platform/src/cli/holo.ts` (1750-1810) — case seed:e2e ~1793; case verify:no-convex-client ~1758
- `.spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/gate-results.prev.json` (1-65) — Schema exemplar + historical run_id
- `.spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/GATE-RESULTS.md` (1-20) — Stale citation of s25-ht-20260725T203604Z
- `.spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/SPRINT.md` (34-46,86-89) — Human Test Deliverable step 1 bare holo; cycle-4 F-E1 note
- `.spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/.gate-evidence/s25-ht-20260725T224451Z/step1.log` (1-10) — Aborted re-run: unknown command seed:e2e exit 127
- `.spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/REDHAT-FIX-05-rerun-full-human-gate-fresh-gate-results.md` (1-100) — Fail-closed 5-step gate re-run pattern
- `.spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/REDHAT-FIX-07-copy-redhat-fix-04-evidence-files-cold-checkout.md` (1-60) — Product freeze + written_at lower bound 2026-07-25T22:44:09Z
- `.maestro/reactive/reconnect-exactly-once.yml` (1-40) — Gate step 2 Maestro flow
- `.maestro/reactive/research-progress-advances.yml` (1-40) — Gate step 3 Maestro flow
- `.maestro/reactive/run-cross-surface-sync-slo.sh` (1-40) — Gate step 4 harness
- `.maestro/reactive/run-degraded-no-hang.sh` (1-50) — Gate step 5 fleet-down harness

## Guardrails

### WRITE-ALLOWED
- bin/holo (MODIFY only if needed to preserve/strengthen dispatcher; already correct — do not replace with PATH stub)
- package.json (MODIFY only if needed for bin install surface / scripts.seed:e2e clarity — already largely correct)
- .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/SPRINT.md (MODIFY step-1 command + PATH footnote)
- .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/gate-results.json (NEW/REPLACE this-cycle)
- .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/GATE-RESULTS.md (MODIFY to match fresh run)
- .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/.gate-evidence/** (NEW/REPLACE this-cycle logs including step-1-seed.log)
- README or operator docs (MODIFY optional one-line holo PATH footnote)
- ~/.local/bin/holo (optional operator-local symlink/replace — NOT sufficient alone)

### WRITE-PROHIBITED
- hooks/use-resumable-sse-stream.ts — H3 closed; product freeze
- services/platform/src/http/chat-runs.ts — SSE backend freeze
- services/platform/src/db/seed-e2e.ts — H1 closed
- services/platform/src/research/progress.ts — H2 closed
- services/platform/src/mcp/executor.ts — S-REACTIVE-03 freeze
- services/platform/src/observability/mission-research.ts — product freeze
- services/platform/src/mission/cycle.ts — product freeze
- Copying gate-results.prev.json with only written_at bump
- Claiming pass with incomplete steps or step 1 exit 127
- Re-opening H1/H2/H3 product behavior
- Leaving gate docs documenting bare holo seed:e2e --reset with no cold-checkout path
- Deleting gate-results.prev.json
- Relying solely on operator-local ~/.local/bin/holo symlink without repo doc/bin durability

## Design

- **References:** `.spec/reviews/red-hat-sprint25-reactive-20260725T225400Z.md#F-E1`, `.spec/reviews/red-hat-sprint25-reactive-20260725T225400Z.md#G-2-REGRESSED`, `SPRINT.md Human Testing Gate`, `gate-results.prev.json schema exemplar`, `REDHAT-FIX-05 fail-closed gate re-run pattern`, `REDHAT-FIX-07 product freeze + written_at lower bound 2026-07-25T22:44:09Z`, `bin/holo (primary checkout dispatcher)`, `mastra-planner boundary enrichments (verify:no-convex-client + PATH-stripped cold-checkout)`
- **Pattern:** bin/holo dispatcher exec bun holo.ts + document cold-checkout-safe gate step 1 + fail-closed full 5-step gate re-run → fresh gate-results.json + GATE-RESULTS.md
- **Pattern source:** bin/holo:1-40; REDHAT-FIX-05 gate re-run; cycle-4 F-E1 fix options b+c
- **Anti-pattern:** Relying on ~/.local/bin/holo stub that only implements verify:no-convex-client; bare holo seed:e2e in docs without cold-checkout path; only bumping written_at on .prev.json; claiming pass after step 1 exit 127
- **Interaction notes:**
  - Preferred durable fix: (b)+(c) document/gate commands use ./bin/holo or pnpm seed:e2e with PATH footnote; ensure package.json bin remains correct. (a) operator PATH symlink optional extra only.
  - Primary checkout ALREADY has correct bin/holo dispatcher — verify + document + use it; do not reinvent.
  - Preserve verify:no-convex-client via ./bin/holo or pnpm verify:no-convex-client.
  - Gate re-run procedure mirrors REDHAT-FIX-05: 5 consolidated steps, this-cycle logs, fail-closed write, keep .prev.json historical.
  - Abandon pattern: s25-ht-20260725T224451Z died at step 1 exit 127 — never write pass from that state.
  - H1/H2/H3/G-3 confirmed closed — do not re-litigate product surfaces.
  - No mobile UI product work; SafeArea/touch N/A for this chore.

## Verification Gates

| Gate | Command | Expected |
|------|---------|----------|
| in-repo holo dispatch smoke | `test -x bin/holo && bin/holo 2>&1 \| head -5 && (bin/holo seed:e2e --reset >/tmp/redhat-fix-08-seed-…` | Exit 0; usage printed; seed not unknown command |
| SPRINT.md cold-checkout step-1 truth | `rg -n 'bin/holo seed:e2e\|pnpm seed:e2e\|pnpm exec holo seed:e2e' .spec/prds/mk6-migration/tasks/spr…` | At least one match for cold-checkout-safe step 1 |
| PATH-stripped cold checkout | `env PATH="/usr/bin:/bin:/usr/local/bin:$HOME/.bun/bin" ./bin/holo 2>&1 \| rg -q seed:e2e` | Exit 0; usage lists seed:e2e without ~/.local/bin |
| verify:no-convex-client preserved | `rg -n "case 'verify:no-convex-client'" services/platform/src/cli/holo.ts && jq -e '.scripts["verify:…` | Exit 0 |
| gate-results.json freshness post-FIX-07 | `test -f .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-de…` | Exit 0 |
| GATE-RESULTS.md sync | `rg -F "$(jq -r .run_id .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-miss…` | run_id present in GATE-RESULTS.md |
| product freeze | `git status --porcelain -- hooks/use-resumable-sse-stream.ts services/platform/src/http/chat-runs.ts …` | Empty porcelain (0 dirty lines) |

## Agent Assignment

- **Implementer:** react-native-ui-implementer — Owns Sprint 25 human-gate re-runnability: cold-checkout holo/seed:e2e dispatch surface, SPRINT.md/GATE-RESULTS.md step-1 command truth, Maestro reactive flows, and sprint-folder gate-results.json / GATE-RESULTS.md authorship. F-E1 executability + G-2-REGRESSED fresh gate only — no product UI/hook/backend behavior. Reviewer: react-native-ui-reviewer (optional mastra-reviewer dual-lens on product freeze + fail-closed).
- **Reviewer:** react-native-ui-reviewer (optional dual-lens: mastra-reviewer on product freeze + fail-closed)
- **Proposed by:** react-native-ui-planner (mastra-planner boundary enrichments folded at consolidation)

## Dependencies

- **depends_on:** REDHAT-FIX-07, REDHAT-FIX-05, REDHAT-FIX-04, REDHAT-FIX-01
- **blocks:** (none)

## Coding Standards

- `RULES.md`

## Notes

- Cycle-4 sole HIGH blocker: F-E1 + G-2-REGRESSED (missing gate-results.json after aborted re-run).
- Confirmed CLOSED (do not re-open): H1, H2, H3, G-3, S-REACTIVE-03, SSE backend.
- Advisory out-of-scope: M-H2-LIVE, M3+M6, M5, F-ORACLE-MISMATCH, L-S05-STALE.
- Preferred durable fix: document + use `./bin/holo seed:e2e --reset` or `pnpm seed:e2e`; keep package.json bin; operator PATH symlink optional only.
- Suggested commit message after implementation: `fix(sprint-25): cold-checkout holo seed:e2e dispatcher + fresh gate-results (F-E1/G-2)`

<!-- REQUIREMENT-CONTRACT v1
-->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-08",
  "tdd_mode": "skipped",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": false,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "cold-checkout-holo-dispatch": {
      "description": "Primary checkout with committed bin/holo dispatcher (exec bun services/platform/src/cli/holo.ts) and package.json bin/seed:e2e scripts; operator PATH may still shadow with broken ~/.local/bin/holo stub that only implements verify:no-convex-client",
      "seed_method": "public_api",
      "records": [
        "bin/holo exists, executable, execs bun services/platform/src/cli/holo.ts",
        "package.json bin.holo = ./bin/holo; scripts.seed:e2e = bun services/platform/src/cli/holo.ts seed:e2e --reset",
        "which holo may still resolve to ~/.local/bin/holo (broken stub) \u2014 must not be required for gate"
      ]
    },
    "aborted-gate-run-fe1": {
      "description": "Evidence of aborted re-run s25-ht-20260725T224451Z that hit F-E1 at step 1",
      "seed_method": "public_api",
      "records": [
        ".gate-evidence/s25-ht-20260725T224451Z/step1.log contains holo: unknown command: seed:e2e",
        "step1.exit is 127",
        "canonical gate-results.json missing (only gate-results.prev.json with run_id s25-ht-20260725T203604Z)"
      ]
    },
    "sprint-25-gate-head-post-fix07": {
      "description": "HEAD after REDHAT-FIX-01..07 with H1/H2/H3 closed; platform on holocron_nonprod; named iOS Simulator; Zero + Metro healthy",
      "seed_method": "public_api",
      "records": [
        "REDHAT-FIX-07 completed 2026-07-25T22:44:09Z",
        "Maestro flows under .maestro/reactive/ available",
        "fleet stop/restore harness for degraded step present",
        "gate-results.prev.json schema exemplar for fresh write"
      ]
    },
    "gate-results-prev-schema": {
      "description": "Schema reference from gate-results.prev.json for the fresh write shape",
      "seed_method": "public_api",
      "records": [
        "fields: sprint_id, run_id, verdict, runner, written_at, steps_total, steps_executed, steps_passed, steps[]",
        "5 consolidated steps: seed; reconnect; research; MCP p95; degraded",
        "historical run_id s25-ht-20260725T203604Z must not be reused as current"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN A primary/cold checkout where PATH holo may still resolve to the broken ~/.local/bin/holo stub that only implements verify:no-convex-client WHEN The operator runs the cold-checkout-safe gate step 1 command via repo-relative ./bin/holo seed:e2e --reset (or documented pnpm seed:e2e) THEN Command exits non-127; stdout/log shows seed activity; dispatch path is bun services/platform/src/cli/holo.ts via bin/holo \u2014 not the 1KB PATH stub",
      "verify": "test -x bin/holo && bin/holo 2>&1 | rg -q 'seed:e2e|Commands|Usage' && (bin/holo seed:e2e --reset >/tmp/redhat-fix-08-seed-smoke.log 2>&1; ec=$?; test $ec -ne 127; ! rg -q 'unknown command: seed:e2e' /tmp/redhat-fix-08-seed-smoke.log) && rg -n \"case 'seed:e2e'\" services/platform/src/cli/holo.ts && jq -e '.bin.holo==\"./bin/holo\"' package.json",
      "maps_to_ac": null,
      "flow_ref": "UC-SYNC-02",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "bin/holo + services/platform/src/cli/holo.ts seed:e2e + filesystem",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "empty",
            "stub",
            "static",
            "mock"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "cold-checkout-holo-dispatch",
            "action": {
              "actor": "cli_user",
              "steps": [
                "Confirm test -x bin/holo",
                "Run bin/holo (no args) and observe full usage listing seed:e2e",
                "Run bin/holo seed:e2e --reset without relying on PATH holo",
                "Capture stdout/stderr; assert exit is not 127 and output is not unknown command"
              ]
            },
            "end_state": {
              "must_observe": [
                "bin/holo is executable and test -x exits 0",
                "bin/holo usage output contains literal 'seed:e2e'",
                "bin/holo seed:e2e --reset exit code is not 127",
                "package.json bin.holo equals literal './bin/holo'",
                "seed smoke log size > 0"
              ],
              "must_not_observe": [
                "empty/start signature: holo: unknown command: seed:e2e from ./bin/holo",
                "exit code equals 127 for bin/holo seed:e2e --reset",
                "bin/holo missing (size == 0 or not executable)"
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
      "description": "GIVEN SPRINT.md currently documents bare holo seed:e2e --reset while PATH holo is the broken stub WHEN Implementer lands the durable cold-checkout fix (docs + in-repo dispatch; optional PATH install is not the sole fix) THEN SPRINT.md step 1 uses ./bin/holo seed:e2e --reset and/or pnpm seed:e2e with a PATH footnote; verify:no-convex-client remains invokable via ./bin/holo or pnpm script; bin/holo remains the platform CLI dispatcher",
      "verify": "rg -n 'bin/holo seed:e2e|pnpm seed:e2e|pnpm exec holo seed:e2e' .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/SPRINT.md && rg -ni 'PATH stub|verify:no-convex-client|\\.local/bin/holo|unknown command|cold.?checkout' .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/SPRINT.md && head -40 bin/holo | rg -q 'services/platform/src/cli/holo.ts|exec' && rg -n \"case 'verify:no-convex-client'\" services/platform/src/cli/holo.ts && jq -e '.scripts[\"verify:no-convex-client\"]|length>0' package.json && env PATH=\"/usr/bin:/bin:/usr/local/bin:$HOME/.bun/bin\" ./bin/holo 2>&1 | rg -q 'seed:e2e'",
      "maps_to_ac": null,
      "flow_ref": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "SPRINT.md + bin/holo dispatcher + package scripts + PATH-stripped cold-checkout",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "static",
            "stub",
            "empty",
            "disconnect"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "cold-checkout-holo-dispatch",
            "action": {
              "actor": "cli_user",
              "steps": [
                "Update SPRINT.md Human Test Deliverable item 1 to ./bin/holo seed:e2e --reset (or pnpm seed:e2e) with one-line PATH stub footnote",
                "Confirm bin/holo still execs platform holo.ts",
                "Confirm verify:no-convex-client still registered and invocable via bin/holo or package script",
                "Simulate PATH without ~/.local/bin and confirm ./bin/holo still lists seed:e2e",
                "Do not rely solely on ln -sf of operator ~/.local/bin/holo as the only durable fix"
              ]
            },
            "end_state": {
              "must_observe": [
                "SPRINT.md contains literal './bin/holo seed:e2e' or 'pnpm seed:e2e' for step 1",
                "SPRINT.md contains literal 'PATH stub' or 'verify:no-convex-client' or '.local/bin/holo' footnote",
                "bin/holo head contains literal 'services/platform/src/cli/holo.ts'",
                "package.json scripts.verify:no-convex-client length > 0",
                "PATH-stripped ./bin/holo usage contains literal 'seed:e2e'"
              ],
              "must_not_observe": [
                "empty/start signature: only bare 'holo seed:e2e --reset' with no cold-checkout path and no PATH footnote (size == 0 durable fix)",
                "bin/holo reduced to verify:no-convex-client-only stub (exit 127 for seed:e2e)",
                "verify:no-convex-client removed from platform CLI (0 case matches) and package scripts"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN HEAD after REDHAT-FIX-01..07 with F-E1 dispatch fixed; gate-results.json currently missing (only .prev.json with s25-ht-20260725T203604Z); aborted run s25-ht-20260725T224451Z died at step 1 exit 127 WHEN The full 5-step human gate is executed against HEAD using the cold-checkout-safe step-1 command THEN Every step exits 0; fresh gate-results.json is written with verdict pass, steps_passed==5, NEW run_id, written_at >= 2026-07-25T22:44:09Z; this-cycle step evidence logs non-empty including restored Streaming seed log; no step exit 127",
      "verify": "test -f .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/gate-results.json && jq -e '.verdict==\"pass\" and .steps_passed==5 and .steps_executed==5 and .steps_total==5 and .run_id != \"s25-ht-20260725T203604Z\" and .run_id != \"s25-ht-20260725T155918Z\" and .run_id != \"s25-ht-20260725T224451Z\" and (.written_at >= \"2026-07-25T22:44:09Z\")' .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/gate-results.json && python3 - <<'PY'\nimport json,pathlib\nroot=pathlib.Path('.spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded')\ng=json.loads((root/'gate-results.json').read_text())\nfor s in g['steps']:\n  p=pathlib.Path(s.get('evidence') or s.get('log') or '')\n  assert p.is_file() and p.stat().st_size>0, s\n  assert s.get('result')=='pass' and s.get('exit_code')==0, s\n  assert s.get('exit_code')!=127\nlog=(root/'.gate-evidence'/'step-1-seed.log').read_text()\nassert 'unknown command' not in log\nassert 'Streaming' in log or 'conversations: 5' in log or 'conversations:5' in log\nprint('gate ok', g['run_id'], g['written_at'])\nPY",
      "maps_to_ac": null,
      "flow_ref": "UC-SYNC-02",
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "Maestro + bin/holo seed:e2e + named iOS Simulator + holocron_nonprod platform",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "empty",
            "stub",
            "disconnect",
            "static",
            "mock"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "sprint-25-gate-head-post-fix07",
            "action": {
              "actor": "cli_user",
              "steps": [
                "Ensure platform + Zero + Metro + Simulator healthy",
                "Step 1: ./bin/holo seed:e2e --reset (or pnpm seed:e2e); capture this-cycle step-1-seed.log with Streaming seed",
                "Step 2: maestro test .maestro/reactive/reconnect-exactly-once.yml",
                "Step 3: maestro test .maestro/reactive/research-progress-advances.yml",
                "Step 4: bash .maestro/reactive/run-cross-surface-sync-slo.sh",
                "Step 5: bash .maestro/reactive/run-degraded-no-hang.sh",
                "Write gate-results.json with new run_id s25-ht-YYYYMMDDTHHMMSSZ and written_at=now UTC after 2026-07-25T22:44:09Z",
                "Fail-closed: if any step non-zero, do not write verdict pass"
              ]
            },
            "end_state": {
              "must_observe": [
                "gate-results.json path exists and file size > 0 at sprint folder",
                "verdict equals 'pass'",
                "steps_passed == 5 and steps_executed == 5 and steps_total == 5",
                "run_id != 's25-ht-20260725T203604Z' and run_id != 's25-ht-20260725T155918Z' and run_id != 's25-ht-20260725T224451Z'",
                "written_at >= '2026-07-25T22:44:09Z'",
                "step-1-seed.log size > 0 and contains 'Streaming' or 'conversations:5'",
                "each steps[].result equals 'pass' and exit_code equals 0"
              ],
              "must_not_observe": [
                "empty/start signature: gate-results.json missing (file size == 0 or absent)",
                "run_id equals 's25-ht-20260725T203604Z'",
                "run_id equals 's25-ht-20260725T155918Z'",
                "verdict equals 'pass' with steps_passed < 5",
                "step-1-seed.log contains 'unknown command: seed:e2e'",
                "step 1 exit_code equals 127"
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
      "description": "GIVEN Fresh gate-results.json from AC-3 and frozen product surfaces from closed H1/H2/H3 WHEN GATE-RESULTS.md is updated and git status is checked for frozen files THEN GATE-RESULTS.md cites the same run_id, verdict, and written_at as gate-results.json; step-1 text matches the cold-checkout-safe command; frozen product files have empty porcelain status",
      "verify": "python3 - <<'PY'\nimport json,pathlib\nroot=pathlib.Path('.spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded')\ng=json.loads((root/'gate-results.json').read_text())\nmd=(root/'GATE-RESULTS.md').read_text()\nassert g['run_id'] in md, g['run_id']\nassert g['run_id'] not in ('s25-ht-20260725T203604Z','s25-ht-20260725T155918Z','s25-ht-20260725T224451Z')\nassert g['verdict'] in md\nassert 'bin/holo seed:e2e' in md or 'pnpm seed:e2e' in md or './bin/holo' in md\nprint('GATE-RESULTS.md parity OK', g['run_id'])\nPY\ngit status --porcelain -- hooks/use-resumable-sse-stream.ts services/platform/src/http/chat-runs.ts services/platform/src/db/seed-e2e.ts services/platform/src/research/progress.ts services/platform/src/mcp/executor.ts services/platform/src/observability/mission-research.ts services/platform/src/mission/cycle.ts | test -z \"$(cat)\"",
      "maps_to_ac": null,
      "flow_ref": "UC-SYNC-02",
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "GATE-RESULTS.md + gate-results.json + git product freeze",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "static",
            "empty",
            "stub",
            "disconnect"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "gate-results-prev-schema",
            "action": {
              "actor": "cli_user",
              "steps": [
                "Update GATE-RESULTS.md from fresh gate-results.json (verdict, run_id, written_at, 5 steps)",
                "Ensure step-1 documentation uses ./bin/holo seed:e2e or pnpm seed:e2e",
                "Confirm step-1 log for this run mentions Streaming or conversations:5",
                "Run git status --porcelain on frozen product surfaces; expect empty"
              ]
            },
            "end_state": {
              "must_observe": [
                "GATE-RESULTS.md contains fresh run_id matching gate-results.json run_id field (non-empty string length > 0)",
                "GATE-RESULTS.md contains verdict literal matching gate-results.json 'pass'",
                "GATE-RESULTS.md step-1 uses './bin/holo' or 'pnpm seed:e2e'",
                "git status --porcelain for frozen product files is empty string (0 dirty lines)"
              ],
              "must_not_observe": [
                "empty/start signature: only pre-fix run_id 's25-ht-20260725T203604Z' as current in GATE-RESULTS.md",
                "frozen product file dirty in git status (use-resumable-sse-stream.ts or chat-runs.ts modified; dirty line count > 0)",
                "step-1 text claims success while log has 'unknown command: seed:e2e'"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "primary": false,
      "description": "bin/holo is executable and bin/holo seed:e2e --reset does not return exit 127 / unknown command",
      "verify": "test -x bin/holo && (bin/holo seed:e2e --reset >/tmp/redhat-fix-08-tc1.log 2>&1; ec=$?; test $ec -ne 127; ! rg -q 'unknown command: seed:e2e' /tmp/redhat-fix-08-tc1.log)",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "primary": false,
      "description": "SPRINT.md documents cold-checkout-safe step-1 command and PATH stub truth; bin/holo remains platform CLI dispatcher; verify:no-convex-client preserved",
      "verify": "rg -n 'bin/holo seed:e2e|pnpm seed:e2e|pnpm exec holo seed:e2e' .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/SPRINT.md && head -40 bin/holo | rg -q 'services/platform/src/cli/holo.ts|exec' && rg -n \"case 'verify:no-convex-client'\" services/platform/src/cli/holo.ts && jq -e '.scripts[\"verify:no-convex-client\"]|length>0' package.json",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "primary": false,
      "description": "Fresh gate-results.json exists with pass, 5/5, new run_id, written_at after REDHAT-FIX-07",
      "verify": "test -f .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/gate-results.json && jq -e '.verdict==\"pass\" and .steps_passed==5 and .steps_executed==5 and .run_id != \"s25-ht-20260725T203604Z\" and .run_id != \"s25-ht-20260725T155918Z\" and (.written_at >= \"2026-07-25T22:44:09Z\")' .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/gate-results.json",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "primary": false,
      "description": "This-cycle step evidence logs referenced by gate-results.json all exist, are non-empty, and step-1 is not the aborted unknown-command log",
      "verify": "python3 - <<'PY'\nimport json,pathlib\nroot=pathlib.Path('.spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded')\ng=json.loads((root/'gate-results.json').read_text())\nfor s in g['steps']:\n  p=pathlib.Path(s.get('evidence') or s.get('log') or '')\n  assert p.is_file() and p.stat().st_size>0, s\nlog=(root/'.gate-evidence'/'step-1-seed.log').read_text()\nassert 'unknown command' not in log\nassert 'Streaming' in log or 'conversations: 5' in log or 'conversations:5' in log\nprint('evidence ok', len(g['steps']), g['run_id'])\nPY",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "primary": false,
      "description": "GATE-RESULTS.md run_id/verdict match gate-results.json and are not the stale cycle-3 id; product freeze holds",
      "verify": "python3 - <<'PY'\nimport json,pathlib\nroot=pathlib.Path('.spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded')\ng=json.loads((root/'gate-results.json').read_text())\nmd=(root/'GATE-RESULTS.md').read_text()\nassert g['run_id'] in md\nassert g['run_id']!='s25-ht-20260725T203604Z'\nprint('ok', g['run_id'])\nPY\ngit status --porcelain -- hooks/use-resumable-sse-stream.ts services/platform/src/http/chat-runs.ts services/platform/src/db/seed-e2e.ts services/platform/src/research/progress.ts services/platform/src/mcp/executor.ts services/platform/src/observability/mission-research.ts services/platform/src/mission/cycle.ts | test -z \"$(cat)\"",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "primary": false,
      "description": "PATH-stripped cold checkout still exposes seed:e2e via ./bin/holo without ~/.local/bin",
      "verify": "env PATH=\"/usr/bin:/bin:/usr/local/bin:$HOME/.bun/bin\" ./bin/holo 2>&1 | rg -q seed:e2e",
      "maps_to_ac": "AC-2"
    }
  ]
}
-->
