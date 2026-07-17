# REDHAT-FIX-C2-H4 — Make the extract-status gate step self-contained and reproducible from a clean checkout

## What this does

Close red-hat cycle-2 H4 (**HIGH**) and the related M4 advisory: gate step 5 (`holo extract:status <id>`) at `.gate-evidence/kb-run-sprint-2026-07-17T05-30-00Z/step5-extract-status.log` is **non-reproducible from a clean checkout**. The step's command is `bun services/platform/src/cli/holo.ts extract:status 222ac4d3-4131-40cc-a650-e2d1a4256fa3 --json` — the id `222ac4d3-...-e2d1a4256fa3` only resolves because a **prior** extraction in the same gate run wrote that file to the gitignored `.tmp/extractions/` directory (`extract-structured.ts:128`). A reviewer checking out HEAD `f4e07af` clean sees `holo extract:status 222ac4d3-...` exit 1 with `NOT_FOUND` — the status file does not exist. The M4 advisory compounds this: struct-1 AC-2's oracle "Database query for committed rows returns 0" over-promises a database that does not exist (`.tmp/extractions/<id>.json` is a file-based store, not a SQL table; `committed:false` is a JSON boolean, not a query result).

The fix rewrites gate step 5 as a **self-contained shell pipeline** that runs `holo extract --fixture always-malformed --json` (which deterministically fails past the cap and emits a fresh `extractionId`), captures that id, and pipes it into `holo extract:status <id> --json` in a single shell sequence — so the step reproduces from a clean checkout with no hardcoded id, no dependency on a prior run, and no gitignored state. The oracle is amended to match reality: `status.committed === false` and `status.status === 'extraction_failed'` (file-based store, not a DB query). A new integration test (`struct-extract-status.test.ts`) executes the full pipeline from a freshly-deleted `.tmp/extractions/` directory and asserts it succeeds — proving reproducibility.

Provides: a self-contained gate step 5 command in `SPRINT.md` (extract → capture id → status, no hardcoded id); an updated oracle matching the file-based store reality; a new `struct-extract-status.test.ts` that runs the pipeline from a clean `.tmp/extractions/` and asserts success; RED evidence proving the pre-fix hardcoded-id command fails `NOT_FOUND` from a clean checkout.

## Why

- MUST rewrite SPRINT.md gate step 5 as a self-contained shell sequence: `id=$(bun ... extract --fixture always-malformed --json 2>/dev/null | jq -r .extractionId); bun ... extract:status "$id" --json` (or equivalent) — no hardcoded id, no dependency on a prior run
- MUST amend the gate step 5 oracle from "Database query returns 0" to "status.committed === false AND status.status === 'extraction_failed'" (file-based store, not a DB — matches M4's reality)
- MUST add a new integration test `tests/integration/service/struct-extract-status.test.ts` that: (a) deletes `.tmp/extractions/` (or asserts it does not exist), (b) runs `holo extract --fixture always-malformed --json` and captures `extractionId`, (c) runs `holo extract:status <id> --json` and asserts `status === 'extraction_failed'` + `committed === false`
- MUST prove reproducibility — the test must pass from a clean checkout with no prior gate run, no pre-existing `.tmp/extractions/` files
- MUST Write RED evidence under `.tmp/redhat-fix-c2-h4*` showing: (a) the pre-fix hardcoded-id command `holo extract:status 222ac4d3-...` exits 1 with `NOT_FOUND` from a clean checkout (delete `.tmp/extractions/` first), and (b) the pre-fix oracle "Database query returns 0" cannot be satisfied (no extractions DB table exists)
- MUST preserve the existing `holo extract:status` CLI behavior — no production code change in `extract-structured.ts` or `holo.ts`; only the gate step definition and a new test
- MUST NOT remove or skip the existing gate step 5 — it must continue to run, just self-contained
- NEVER depend on a hardcoded extraction id in any gate step command or test assertion — every id must be captured at runtime from a real extract call
- NEVER reference a "database" or "DB query" in any oracle or assertion — the store is file-based (`.tmp/extractions/<id>.json`); oracles must say `status.committed === false`
- NEVER delete `.tmp/extractions/` files written by other tests mid-run — the new test must use its own extraction id (from its own `extract --fixture always-malformed` call) so it does not race with parallel tests
- STRICTLY the new test runs `PLATFORM_IT=1` against the real fleet at `127.0.0.1:4545` — the `always-malformed` fixture deterministically fails past the cap, producing a stable `extraction_failed` status
- STRICTLY RED evidence under `.tmp/redhat-fix-c2-h4*` showing pre-fix non-reproducibility
- Grounded in: UC-INFER-03, T-INFER-010, CAP-INF-01

## How to verify

- `rg -n '222ac4d3|extract:status [0-9a-f]{8}-|extract:status \$' .spec/prds/mk6-migration/tasks/sprint-09-structured-output-on-local-models/SPRINT.md` → no hardcoded UUIDs remain; only `$id` or `$(...)` capture patterns
- `rg -n 'Database query|database query|DB query' .spec/prds/mk6-migration/tasks/sprint-09-structured-output-on-local-models/SPRINT.md tests/integration/service/struct-extract-status.test.ts` → empty (exit 1) — no DB-query oracle remains
- `rg -n 'status.*extraction_failed|committed.*false' tests/integration/service/struct-extract-status.test.ts` → ≥2 lines (the real assertion)
- `PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-extract-status.test.ts` → Exit 0 (self-contained pipeline works from a clean checkout)
- Manual reproducibility proof: `rm -rf .tmp/extractions && PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-extract-status.test.ts` → Exit 0 (proves no prior state required)
- `pnpm tsgo --noEmit` → Exit 0
- `pnpm biome check tests/integration/service/struct-extract-status.test.ts` → Exit 0

## Scope

Writes: .spec/prds/mk6-migration/tasks/sprint-09-structured-output-on-local-models/SPRINT.md (MODIFY — rewrite gate step 5 as a self-contained shell pipeline; amend oracle from "Database query returns 0" to "status.committed === false") · tests/integration/service/struct-extract-status.test.ts (NEW — self-contained extract → status pipeline test that runs from a clean `.tmp/extractions/`) · .tmp/redhat-fix-c2-h4*/** (NEW — RED+GREEN evidence)

Prohibited: services/platform/src/inference/extract-structured.ts · services/platform/src/cli/holo.ts · services/platform/src/cli/extract-fixtures.ts · services/platform/src/inference/resolve-model.ts · services/platform/src/fleet/** · services/platform/src/inference/probe-capability.ts · services/platform/src/mastra.ts · tests/fixtures/struct-fixtures.ts · tests/integration/service/struct-fixture-cli.test.ts (do not modify the existing CLI fixture test; the new sibling test owns reproducibility)

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: REDHAT-FIX-C2-H4 — Make the extract-status gate step self-contained and reproducible from a clean checkout
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     S  (90 min)
AGENT:      implementer=mastra-implementer | reviewer=mastra-reviewer
PROPOSED-BY: mastra-implementer (red-hat cycle-2 review H4 + M4)
TDD_MODE:   red_first     RED_GREEN_REQUIRED: yes     (requires_seeded_evidence: true)
CAPABILITY: CAP-INF-01
SPRINT:     [Sprint 9 — Structured Output on Local Models](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm vitest run <path>
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
SPRINT.md gate step 5 reads as a self-contained shell sequence: `id=$(bun ... extract --fixture always-malformed --json 2>/dev/null | jq -r .extractionId); bun ... extract:status "$id" --json` — no hardcoded UUID, reproducible from any clean checkout. The oracle is amended from "Database query returns 0" to "status.committed === false AND status.status === 'extraction_failed'" (file-based store, not a DB — matches M4 reality). A new `tests/integration/service/struct-extract-status.test.ts` deletes `.tmp/extractions/`, runs the pipeline, and asserts success — proving a reviewer checking out HEAD clean can reproduce step 5 without any prior gate run.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST rewrite SPRINT.md gate step 5 command as a self-contained shell pipeline: extract → capture id → status (no hardcoded UUID)
- MUST amend the gate step 5 oracle to match the file-based store reality: `status.committed === false` AND `status.status === 'extraction_failed'` (NOT "Database query returns 0")
- MUST add a new integration test `tests/integration/service/struct-extract-status.test.ts` that runs the full pipeline (extract → status) from a clean `.tmp/extractions/`
- MUST delete (or assert absence of) `.tmp/extractions/` at the start of the new test so reproducibility is proven, not assumed
- MUST capture `extractionId` at runtime from the extract call's stdout/stderr JSON — never hardcode an id in any assertion
- MUST Write RED evidence (`.tmp/redhat-fix-c2-h4-red/`) showing: (a) the pre-fix command `holo extract:status 222ac4d3-4131-40cc-a650-e2d1a4256fa3 --json` exits 1 with `NOT_FOUND` after `rm -rf .tmp/extractions`, and (b) `rg -n 'extractions' services/platform/src/**/*.ts | rg -i 'table|schema|migration'` returns zero matches (no DB table exists — M4 reality)
- MUST preserve the existing `holo extract:status` CLI behavior — no production code change
- MUST NOT remove or skip gate step 5 — it must continue to run, just self-contained
- NEVER hardcode an extraction id in any gate step command or test assertion
- NEVER reference a "database" / "DB query" in any oracle or assertion — the store is file-based
- NEVER delete `.tmp/extractions/` files written by other tests mid-run — use the new test's own extraction id
- NEVER mock `extractStructured` or the fleet — the pipeline must run end-to-end against the real fleet (the always-malformed fixture deterministically fails past the cap)
- STRICTLY the new test runs `PLATFORM_IT=1` against the real fleet at `127.0.0.1:4545`
- STRICTLY RED evidence under `.tmp/redhat-fix-c2-h4*`
- Grounded in: UC-INFER-03, T-INFER-010, CAP-INF-01

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: SPRINT.md gate step 5 command is a self-contained shell pipeline (extract → capture id → status); no hardcoded UUID remains (PRIMARY) (flow_ref T-INFER-010)
- [ ] AC-2: SPRINT.md gate step 5 oracle says `status.committed === false` (NOT "Database query returns 0"); zero "database"/"DB query" references remain in SPRINT.md (flow_ref T-INFER-010)
- [ ] AC-3: `tests/integration/service/struct-extract-status.test.ts` runs the full pipeline from a clean `.tmp/extractions/` and asserts `status === 'extraction_failed'` + `committed === false` (flow_ref T-INFER-010)
- [ ] AC-4: RED evidence proves pre-fix non-reproducibility (hardcoded-id command exits 1 NOT_FOUND from clean checkout); GREEN evidence proves post-fix pipeline runs clean from `rm -rf .tmp/extractions` (flow_ref T-INFER-010)
- [ ] `PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-extract-status.test.ts` green + `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads — RED before GREEN, proven by real services)
--------------------------------------------------------------------------------
AC-1 SPRINT.md gate step 5 is a self-contained shell pipeline (PRIMARY) (flow_ref T-INFER-010)
  GIVEN: the SPRINT.md gate step 5 command at .spec/prds/mk6-migration/tasks/sprint-09-structured-output-on-local-models/SPRINT.md
  WHEN:  grepping for hardcoded UUIDs in the step 5 command
  THEN:  zero hardcoded UUIDs remain; the command captures the id at runtime via a shell pipeline
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: c2-h4-self-contained-step5 · evidence: file_artifact
    NEGATIVE_CONTROL: would fail if the step still hardcodes '222ac4d3-4131-40cc-a650-e2d1a4256fa3' (the pre-fix state — non-reproducible from clean checkout), the step is split into two commands without a shared shell variable (the id is lost between commands), the step wraps the pipeline in a script that depends on a prior run (re-introduces the dependency), the step is removed entirely (loses gate coverage)
    CASE[0] start_ref=c2-h4-self-contained-step5 · actor=reviewer
      ACTION: Read SPRINT.md gate step 5 command → confirm it is a single shell sequence that runs extract → captures id → runs status, with no hardcoded UUID → grep SPRINT.md for the literal '222ac4d3' (the pre-fix hardcoded id) → confirm zero matches
      MUST_OBSERVE: SPRINT.md gate step 5 command reads as `id=$(... extract --fixture always-malformed --json ... | jq -r .extractionId); ... extract:status "$id" --json` or equivalent self-contained sequence | rg '222ac4d3-4131-40cc-a650-e2d1a4256fa3' SPRINT.md returns zero matches | the step captures the id from a real extract call (no static id)
      MUST_NOT_OBSERVE: the literal '222ac4d3' anywhere in SPRINT.md (the pre-fix hardcoded id) | a two-step sequence where the id is not passed between commands | a script wrapper that depends on prior-run state

AC-2 gate step 5 oracle matches the file-based store reality (no DB-query language) (flow_ref T-INFER-010)
  GIVEN: the SPRINT.md gate step 5 oracle and the file-based extraction status store at extract-structured.ts:128 (EXTRACTIONS_DIR = .tmp/extractions/)
  WHEN:  grepping SPRINT.md for database / DB-query language in the step 5 oracle
  THEN:  zero matches; the oracle says status.committed === false AND status.status === 'extraction_failed'
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: c2-h4-oracle-matches-reality · evidence: file_artifact
    NEGATIVE_CONTROL: would fail if the oracle still says "Database query for committed rows returns 0" (M4 — there is no extractions DB table), the oracle is removed entirely (no success criterion), the oracle says committed === true (inverted — would mask a silent-success defect), the oracle references a SQL query or migration that does not exist
    CASE[0] start_ref=c2-h4-oracle-matches-reality · actor=reviewer
      ACTION: Grep SPRINT.md for 'database', 'Database', 'DB query', 'committed rows' → confirm zero matches → read the step 5 oracle → confirm it says status.committed === false AND status.status === 'extraction_failed'
      MUST_OBSERVE: rg -in 'database|db query|committed rows' SPRINT.md returns zero matches | the step 5 oracle says status.committed === false AND status.status === 'extraction_failed' | the oracle matches the actual file-based store (JSON in .tmp/extractions/<id>.json, no SQL)
      MUST_NOT_OBSERVE: 'Database query returns 0' or any DB-query language | the oracle removed entirely | the oracle saying committed === true

AC-3 struct-extract-status.test.ts runs the pipeline from a clean .tmp/extractions/ (flow_ref T-INFER-010)
  GIVEN: a clean checkout with .tmp/extractions/ absent (or freshly deleted) and the real fleet at 127.0.0.1:4545
  WHEN:  running PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-extract-status.test.ts
  THEN:  the test deletes (or asserts absence of) .tmp/extractions/, runs holo extract --fixture always-malformed --json, captures extractionId, runs holo extract:status <id> --json, and asserts status === 'extraction_failed' + committed === false
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: c2-h4-clean-checkout-pipeline · evidence: stdout
    NEGATIVE_CONTROL: would fail if the test hardcodes an id (the pre-fix defect — non-reproducible from clean checkout), the test depends on a prior gate run writing the status file (re-introduces the dependency), the test mocks extractStructured or the fleet (defeats the reproducibility proof — must run the real pipeline), the test does not delete .tmp/extractions/ first (could pass on stale state from a prior run — does not prove reproducibility)
    CASE[0] start_ref=c2-h4-clean-checkout-pipeline · actor=fleet
      ACTION: Run `rm -rf .tmp/extractions && PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-extract-status.test.ts` from a clean checkout → the test deletes (or asserts absence of) .tmp/extractions/ → runs holo extract --fixture always-malformed --json via BUN_BIN subprocess → captures extractionId from the JSON output → runs holo extract:status <id> --json → asserts status === 'extraction_failed' + committed === false → record the artifact
      MUST_OBSERVE: test exits 0 | the test deletes or asserts absence of .tmp/extractions/ before running extract | the test captures extractionId from the real extract call's JSON (not hardcoded) | the test asserts status === 'extraction_failed' | the test asserts committed === false | the test passes from a clean checkout with no prior gate run
      MUST_NOT_OBSERVE: any hardcoded extraction id in the test | the test depending on a pre-existing .tmp/extractions/<id>.json file | the test mocking extractStructured or the fleet | the test passing on stale state (the rm -rf proves it runs fresh)

AC-4 RED evidence proves pre-fix non-reproducibility; GREEN evidence proves post-fix reproducibility (flow_ref T-INFER-010)
  GIVEN: the RED evidence directory .tmp/redhat-fix-c2-h4-red/ and the GREEN evidence directory .tmp/redhat-fix-c2-h4-green/
  WHEN:  reading the evidence artifacts
  THEN:  RED shows the pre-fix hardcoded-id command exits 1 NOT_FOUND after rm -rf .tmp/extractions; GREEN shows the post-fix self-contained pipeline exits 0 from the same clean state
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: c2-h4-red-green-evidence · evidence: file_artifact
    NEGATIVE_CONTROL: would fail if the RED evidence is absent (cannot prove the pre-fix command was non-reproducible), the RED evidence runs the hardcoded-id command WITHOUT first deleting .tmp/extractions (would pass on stale state — does not prove non-reproducibility), the GREEN evidence is absent (no proof the post-fix pipeline runs clean), the GREEN evidence runs against stale state (does not prove reproducibility)
    CASE[0] start_ref=c2-h4-red-green-evidence · actor=reviewer
      ACTION: Read .tmp/redhat-fix-c2-h4-red/ → confirm it shows (a) `rm -rf .tmp/extractions && bun ... extract:status 222ac4d3-4131-40cc-a650-e2d1a4256fa3 --json` exits 1 with NOT_FOUND, and (b) rg for an extractions DB table/migration returns zero matches (M4 reality) → Read .tmp/redhat-fix-c2-h4-green/ → confirm it shows the self-contained pipeline (extract → capture id → status) exits 0 with status === 'extraction_failed' + committed === false from the same clean state
      MUST_OBSERVE: .tmp/redhat-fix-c2-h4-red/ exists and contains (a) a clean-checkout NOT_FOUND artifact showing the hardcoded-id command exits 1 after rm -rf .tmp/extractions, and (b) an M4 artifact showing rg for an extractions DB table returns zero matches | .tmp/redhat-fix-c2-h4-green/ exists and contains a clean-checkout pipeline artifact showing the self-contained sequence exits 0 with status === 'extraction_failed' + committed === false
      MUST_NOT_OBSERVE: the RED evidence running the hardcoded-id command without first deleting .tmp/extractions (would pass on stale state — does not prove non-reproducibility) | the GREEN evidence absent | the GREEN evidence running against stale state (does not prove reproducibility)

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------
- TC-1 [SPRINT.md gate step 5 command has zero hardcoded UUIDs; captures id at runtime] (maps_to_ac AC-1)
- TC-2 [SPRINT.md gate step 5 oracle says status.committed === false; zero DB-query language] (maps_to_ac AC-2)
- TC-3 [struct-extract-status.test.ts runs the pipeline from a clean .tmp/extractions/ against the real fleet] (maps_to_ac AC-3)
- TC-4 [RED evidence proves pre-fix NOT_FOUND from clean checkout; GREEN evidence proves post-fix reproducibility] (maps_to_ac AC-4)
- TC-5 [Manual reproducibility proof: rm -rf .tmp/extractions && PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-extract-status.test.ts → Exit 0] (maps_to_ac AC-3)
- TC-6 [Typecheck + lint clean after the new test addition] (maps_to_ac AC-3)

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- .spec/prds/mk6-migration/tasks/sprint-09-structured-output-on-local-models/SPRINT.md (MODIFY — rewrite gate step 5 command as a self-contained shell pipeline; amend oracle from "Database query returns 0" to "status.committed === false AND status.status === 'extraction_failed'")
- tests/integration/service/struct-extract-status.test.ts (NEW — self-contained extract → status pipeline test that deletes .tmp/extractions/ first and asserts success from a clean checkout)
- .tmp/redhat-fix-c2-h4*/** (NEW evidence)
writeProhibited: services/platform/src/inference/extract-structured.ts · services/platform/src/cli/holo.ts · services/platform/src/cli/extract-fixtures.ts · services/platform/src/inference/resolve-model.ts · services/platform/src/fleet/** · services/platform/src/inference/probe-capability.ts · services/platform/src/mastra.ts · tests/fixtures/struct-fixtures.ts · tests/integration/service/struct-fixture-cli.test.ts

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. .spec/prds/mk6-migration/tasks/sprint-09-structured-output-on-local-models/SPRINT.md lines 38-45
   - focus: Test Steps section — gate step 5 command currently hardcodes the id '222ac4d3-4131-40cc-a650-e2d1a4256fa3'
2. .spec/prds/mk6-migration/tasks/sprint-09-structured-output-on-local-models/.gate-evidence/kb-run-sprint-2026-07-17T05-30-00Z/step5-extract-status.log
   - focus: the captured step 5 output — proves the hardcoded id resolved only because a prior extraction wrote it
3. .spec/prds/mk6-migration/tasks/sprint-09-structured-output-on-local-models/.gate-evidence/kb-run-sprint-2026-07-17T05-30-00Z/gate-results.json lines 47-56
   - focus: step 5 entry in gate-results.json — the oracle "ok:true, status:extraction_failed, committed:false — NO silent success" (the file-based reality the oracle should match)
4. services/platform/src/inference/extract-structured.ts lines 125-159
   - focus: EXTRACTIONS_DIR = .tmp/extractions/ + writeExtractionStatus + getExtractionStatus — the file-based store the oracle must reference (NOT a DB)
5. services/platform/src/cli/holo.ts lines 1880-1938
   - focus: extract:status CLI command — reads status by id from the file-based store; exits 1 NOT_FOUND when the id does not resolve
6. tests/integration/service/struct-fixture-cli.test.ts lines 90-103
   - focus: STEP 4 always-malformed test — the pattern (BUN_BIN subprocess + parseJsonOut + assertions) the new struct-extract-status.test.ts mirrors for the extract → status pipeline
7. tests/integration/service/harness.ts (skim)
   - focus: BUN_BIN, HOLO_CLI, PLATFORM_IT, REPO_ROOT, runHolo — the test harness utilities the new test imports

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- No hardcoded UUID in SPRINT.md: `rg -n '222ac4d3-4131-40cc-a650-e2d1a4256fa3' .spec/prds/mk6-migration/tasks/sprint-09-structured-output-on-local-models/SPRINT.md` → empty (exit 1)
- No DB-query language: `rg -in 'database|db query|committed rows' .spec/prds/mk6-migration/tasks/sprint-09-structured-output-on-local-models/SPRINT.md` → empty (exit 1)
- Oracle matches reality: `rg -n 'committed.*false|extraction_failed' .spec/prds/mk6-migration/tasks/sprint-09-structured-output-on-local-models/SPRINT.md` → ≥1 line
- Self-contained test exists: `test -f tests/integration/service/struct-extract-status.test.ts` → exit 0
- Test passes from clean checkout: `rm -rf .tmp/extractions && PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-extract-status.test.ts` → Exit 0
- RED+GREEN evidence: `test -d .tmp/redhat-fix-c2-h4-red && test -d .tmp/redhat-fix-c2-h4-green` → exit 0
- Typecheck: `pnpm tsgo --noEmit` → Exit 0
- Lint: `pnpm biome check tests/integration/service/struct-extract-status.test.ts` → Exit 0

--------------------------------------------------------------------------------
DESIGN NOTES
--------------------------------------------------------------------------------
- pattern: Self-contained shell pipeline — the step captures the extraction id at runtime via command substitution: `id=$(bun services/platform/src/cli/holo.ts extract --fixture always-malformed --json 2>/dev/null | jq -r .extractionId); bun services/platform/src/cli/holo.ts extract:status "$id" --json`. The always-malformed fixture deterministically fails past the cap (3 real AI_NoObjectGeneratedError round-trips), producing a stable `extraction_failed` status with `committed:false`. This is the smallest change that makes the step reproducible: no production code, no new abstraction, just a shell sequence + an oracle wording fix.
- pattern_source: `.gate-evidence/kb-run-sprint-2026-07-17T05-30-00Z/step5-extract-status.log` (the captured output the hardcoded id resolved to) + `extract-structured.ts:125-159` (EXTRACTIONS_DIR / writeExtractionStatus / getExtractionStatus — the file-based store) + `tests/integration/service/struct-fixture-cli.test.ts:90-103` (the STEP 4 always-malformed test pattern to mirror for the new pipeline test)
- anti_pattern: Hardcoding any extraction id in a gate step or test (the H4 defect — non-reproducible from clean checkout). Also anti-pattern: referencing a "database" / "DB query" in the oracle (M4 — there is no extractions DB table). Also anti-pattern: mocking extractStructured or the fleet in the new test (defeats the reproducibility proof — must run the real pipeline). Also anti-pattern: depending on `.tmp/extractions/` state from a prior run (re-introduces the H4 dependency).
- agent_rationale: H4 is HIGH because the headline reproducibility claim of the human gate (a reviewer can check out HEAD clean and re-run the steps) is broken for step 5 — the hardcoded id only resolves because a prior extraction in the same gate run wrote that file to the gitignored `.tmp/extractions/` directory. The fix is purely a gate-step + test artifact: no production code change (the CLI already reads status verbatim and emits a fresh id per invocation). The M4 advisory is folded into the same fix because the "Database query returns 0" oracle is the same defect at the spec level (over-promises a DB that does not exist). Together they close the reproducibility gap and align the oracle with the file-based reality.
- jq_dependency_note: the shell pipeline uses `jq -r .extractionId` to parse the extract command's JSON output. If jq is not installed, the pipeline can fall back to a node one-liner (`node -e "console.log(JSON.parse(require('fs').readFileSync(0,'utf8')).extractionId)"`) or a bun equivalent. The SPRINT.md command should prefer jq (standard on macOS + most CI) and document the fallback in a comment.
- Composes with REDHAT-FIX-C2-H3: the new self-contained pipeline benefits from the success-path `attempts` field H3 adds — when an operator runs `holo extract:status <id>` after a malformed-once extract, they see the repair iteration count. For the always-malformed case (H4's pipeline), the status is `extraction_failed` with `error.attempts === 3` (already present on the failure path at extract-structured.ts:219).

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: REDHAT-FIX-H1 (the file-based status store + extract:status CLI exist) · REDHAT-FIX-G-STEP3-4 (the always-malformed fixture exists and is registered)
Blocks: closure of the human gate reproducibility claim — until this task lands, a reviewer checking out HEAD clean cannot reproduce step 5

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-C2-H4",
  "proposed_by": "mastra-implementer",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "c2-h4-self-contained-step5": {
      "description": "The SPRINT.md gate step 5 command — currently hardcodes the id '222ac4d3-4131-40cc-a650-e2d1a4256fa3' (non-reproducible from clean checkout); must be rewritten as a self-contained shell pipeline that captures the id at runtime",
      "seed_method": "public_api",
      "records": [
        "SPRINT.md:43 step 5 command: 'Run holo extract:status <id> — reports extraction_failed with no committed row (no silent success).' — the <id> placeholder resolved to a hardcoded UUID in the gate-evidence command field",
        ".gate-evidence/kb-run-sprint-2026-07-17T05-30-00Z/gate-results.json:52 step 5 command: 'bun services/platform/src/cli/holo.ts extract:status 222ac4d3-4131-40cc-a650-e2d1a4256fa3 --json' — the hardcoded id that only resolves because a prior extraction wrote the file",
        "post-fix SPRINT.md step 5 command must read as: id=$(bun ... extract --fixture always-malformed --json 2>/dev/null | jq -r .extractionId); bun ... extract:status \"$id\" --json"
      ]
    },
    "c2-h4-oracle-matches-reality": {
      "description": "The SPRINT.md gate step 5 oracle — currently over-promises 'Database query returns 0' (M4 — no extractions DB table exists); must be amended to 'status.committed === false AND status.status === extraction_failed' (file-based store reality)",
      "seed_method": "public_api",
      "records": [
        "struct-1 task AC-2 oracle: 'MUST_OBSERVE: Database query for committed rows returns 0' — the M4 over-promise (there is no extractions DB table)",
        "extract-structured.ts:128 EXTRACTIONS_DIR = join(process.cwd(), '.tmp', 'extractions') — the file-based store (NOT a DB)",
        "extract-structured.ts:152-159 getExtractionStatus reads from .tmp/extractions/<id>.json — returns null when the file does not exist (the NOT_FOUND path the hardcoded id hits from a clean checkout)",
        "post-fix oracle must say: status.committed === false AND status.status === 'extraction_failed' (matches the file-based store; no DB-query language)"
      ]
    },
    "c2-h4-clean-checkout-pipeline": {
      "description": "The new tests/integration/service/struct-extract-status.test.ts — runs the full extract → status pipeline from a freshly-deleted .tmp/extractions/ directory against the real fleet, proving reproducibility from a clean checkout",
      "seed_method": "public_api",
      "records": [
        "tests/integration/service/harness.ts: BUN_BIN, HOLO_CLI, PLATFORM_IT, REPO_ROOT, runHolo — the test harness utilities the new test imports",
        "the test deletes (or asserts absence of) .tmp/extractions/ in beforeAll",
        "the test runs holo extract --fixture always-malformed --json via runHolo, captures extractionId from parseJsonOut(stderr) (always-malformed exits 1 with the id in stderr)",
        "the test runs holo extract:status <captured-id> --json via runHolo, asserts status === 'extraction_failed' + committed === false"
      ]
    },
    "c2-h4-red-green-evidence": {
      "description": "RED+GREEN evidence under .tmp/redhat-fix-c2-h4-{red,green}/ — RED proves pre-fix non-reproducibility (hardcoded-id command exits 1 NOT_FOUND after rm -rf .tmp/extractions); GREEN proves post-fix pipeline runs clean from the same state",
      "seed_method": "file_artifact",
      "records": [
        ".tmp/redhat-fix-c2-h4-red/clean-checkout-not-found.json: rm -rf .tmp/extractions && bun ... extract:status 222ac4d3-4131-40cc-a650-e2d1a4256fa3 --json → exit 1, NOT_FOUND",
        ".tmp/redhat-fix-c2-h4-red/m4-no-extractions-db.json: rg -n 'extractions' services/platform/src/**/*.ts | rg -i 'table|schema|migration' → zero matches (no DB table exists)",
        ".tmp/redhat-fix-c2-h4-green/clean-checkout-pipeline.json: rm -rf .tmp/extractions && id=$(... extract --fixture always-malformed --json ... | jq -r .extractionId); ... extract:status \"$id\" --json → exit 0, status === 'extraction_failed', committed === false"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN the SPRINT.md gate step 5 command WHEN grepping for hardcoded UUIDs in the step 5 command THEN zero hardcoded UUIDs remain; the command captures the id at runtime via a shell pipeline",
      "verify": "rg -n '222ac4d3-4131-40cc-a650-e2d1a4256fa3' .spec/prds/mk6-migration/tasks/sprint-09-structured-output-on-local-models/SPRINT.md; test $? -eq 1",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "litellm-fleet",
        "flow_ref": "T-INFER-010",
        "negative_control": {
          "would_fail_if": [
            "the step still hardcodes '222ac4d3-4131-40cc-a650-e2d1a4256fa3' (the pre-fix state — non-reproducible from clean checkout)",
            "the step is split into two commands without a shared shell variable (the id is lost between commands)",
            "the step wraps the pipeline in a script that depends on a prior run (re-introduces the dependency)",
            "the step is removed entirely (loses gate coverage)"
          ]
        },
        "evidence": { "artifact_type": "file_artifact", "required_capture": true },
        "cases": [
          {
            "start_ref": "c2-h4-self-contained-step5",
            "action": {
              "actor": "reviewer",
              "steps": [
                "Read SPRINT.md gate step 5 command",
                "Confirm it is a single shell sequence that runs extract → captures id → runs status, with no hardcoded UUID",
                "Grep SPRINT.md for the literal '222ac4d3' (the pre-fix hardcoded id)",
                "Confirm zero matches"
              ]
            },
            "end_state": {
              "must_observe": [
                "SPRINT.md gate step 5 command reads as `id=$(... extract --fixture always-malformed --json ... | jq -r .extractionId); ... extract:status \"$id\" --json` or equivalent self-contained sequence",
                "rg '222ac4d3-4131-40cc-a650-e2d1a4256fa3' SPRINT.md returns zero matches",
                "the step captures the id from a real extract call (no static id)"
              ],
              "must_not_observe": [
                "the literal '222ac4d3' anywhere in SPRINT.md",
                "a two-step sequence where the id is not passed between commands",
                "a script wrapper that depends on prior-run state"
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
      "description": "GIVEN the SPRINT.md gate step 5 oracle and the file-based extraction status store at extract-structured.ts:128 WHEN grepping SPRINT.md for database / DB-query language in the step 5 oracle THEN zero matches; the oracle says status.committed === false AND status.status === 'extraction_failed'",
      "verify": "rg -in 'database|db query|committed rows' .spec/prds/mk6-migration/tasks/sprint-09-structured-output-on-local-models/SPRINT.md; test $? -eq 1",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "litellm-fleet",
        "flow_ref": "T-INFER-010",
        "negative_control": {
          "would_fail_if": [
            "the oracle still says 'Database query for committed rows returns 0' (M4 — there is no extractions DB table)",
            "the oracle is removed entirely (no success criterion)",
            "the oracle says committed === true (inverted — would mask a silent-success defect)",
            "the oracle references a SQL query or migration that does not exist"
          ]
        },
        "evidence": { "artifact_type": "file_artifact", "required_capture": true },
        "cases": [
          {
            "start_ref": "c2-h4-oracle-matches-reality",
            "action": {
              "actor": "reviewer",
              "steps": [
                "Grep SPRINT.md for 'database', 'Database', 'DB query', 'committed rows'",
                "Confirm zero matches",
                "Read the step 5 oracle",
                "Confirm it says status.committed === false AND status.status === 'extraction_failed'"
              ]
            },
            "end_state": {
              "must_observe": [
                "rg -in 'database|db query|committed rows' SPRINT.md returns zero matches",
                "the step 5 oracle says status.committed === false AND status.status === 'extraction_failed'",
                "the oracle matches the actual file-based store (JSON in .tmp/extractions/<id>.json, no SQL)"
              ],
              "must_not_observe": [
                "'Database query returns 0' or any DB-query language",
                "the oracle removed entirely",
                "the oracle saying committed === true"
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
      "description": "GIVEN a clean checkout with .tmp/extractions/ absent (or freshly deleted) and the real fleet at 127.0.0.1:4545 WHEN running PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-extract-status.test.ts THEN the test deletes (or asserts absence of) .tmp/extractions/, runs holo extract --fixture always-malformed --json, captures extractionId, runs holo extract:status <id> --json, and asserts status === 'extraction_failed' + committed === false",
      "verify": "rm -rf .tmp/extractions && PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-extract-status.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "litellm-fleet",
        "flow_ref": "T-INFER-010",
        "negative_control": {
          "would_fail_if": [
            "the test hardcodes an id (the pre-fix defect — non-reproducible from clean checkout)",
            "the test depends on a prior gate run writing the status file (re-introduces the dependency)",
            "the test mocks extractStructured or the fleet (defeats the reproducibility proof — must run the real pipeline)",
            "the test does not delete .tmp/extractions/ first (could pass on stale state from a prior run — does not prove reproducibility)"
          ]
        },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [
          {
            "start_ref": "c2-h4-clean-checkout-pipeline",
            "action": {
              "actor": "fleet",
              "steps": [
                "Run `rm -rf .tmp/extractions && PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-extract-status.test.ts` from a clean checkout",
                "The test deletes (or asserts absence of) .tmp/extractions/ before running extract",
                "Runs holo extract --fixture always-malformed --json via BUN_BIN subprocess",
                "Captures extractionId from the JSON output",
                "Runs holo extract:status <id> --json",
                "Asserts status === 'extraction_failed' + committed === false"
              ]
            },
            "end_state": {
              "must_observe": [
                "test exits 0",
                "the test deletes or asserts absence of .tmp/extractions/ before running extract",
                "the test captures extractionId from the real extract call's JSON (not hardcoded)",
                "the test asserts status === 'extraction_failed'",
                "the test asserts committed === false",
                "the test passes from a clean checkout with no prior gate run"
              ],
              "must_not_observe": [
                "any hardcoded extraction id in the test",
                "the test depending on a pre-existing .tmp/extractions/<id>.json file",
                "the test mocking extractStructured or the fleet",
                "the test passing on stale state (the rm -rf proves it runs fresh)"
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
      "description": "GIVEN the RED evidence directory .tmp/redhat-fix-c2-h4-red/ and the GREEN evidence directory .tmp/redhat-fix-c2-h4-green/ WHEN reading the evidence artifacts THEN RED shows the pre-fix hardcoded-id command exits 1 NOT_FOUND after rm -rf .tmp/extractions; GREEN shows the post-fix self-contained pipeline exits 0 from the same clean state",
      "verify": "test -d .tmp/redhat-fix-c2-h4-red && test -d .tmp/redhat-fix-c2-h4-green",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "litellm-fleet",
        "flow_ref": "T-INFER-010",
        "negative_control": {
          "would_fail_if": [
            "the RED evidence is absent (cannot prove the pre-fix command was non-reproducible)",
            "the RED evidence runs the hardcoded-id command WITHOUT first deleting .tmp/extractions (would pass on stale state — does not prove non-reproducibility)",
            "the GREEN evidence is absent (no proof the post-fix pipeline runs clean)",
            "the GREEN evidence runs against stale state (does not prove reproducibility)"
          ]
        },
        "evidence": { "artifact_type": "file_artifact", "required_capture": true },
        "cases": [
          {
            "start_ref": "c2-h4-red-green-evidence",
            "action": {
              "actor": "reviewer",
              "steps": [
                "Read .tmp/redhat-fix-c2-h4-red/",
                "Confirm it shows (a) rm -rf .tmp/extractions && bun ... extract:status 222ac4d3-4131-40cc-a650-e2d1a4256fa3 --json exits 1 with NOT_FOUND, and (b) rg for an extractions DB table/migration returns zero matches (M4 reality)",
                "Read .tmp/redhat-fix-c2-h4-green/",
                "Confirm it shows the self-contained pipeline (extract → capture id → status) exits 0 with status === 'extraction_failed' + committed === false from the same clean state"
              ]
            },
            "end_state": {
              "must_observe": [
                ".tmp/redhat-fix-c2-h4-red/ exists and contains (a) a clean-checkout NOT_FOUND artifact showing the hardcoded-id command exits 1 after rm -rf .tmp/extractions, and (b) an M4 artifact showing rg for an extractions DB table returns zero matches",
                ".tmp/redhat-fix-c2-h4-green/ exists and contains a clean-checkout pipeline artifact showing the self-contained sequence exits 0 with status === 'extraction_failed' + committed === false"
              ],
              "must_not_observe": [
                "the RED evidence running the hardcoded-id command without first deleting .tmp/extractions (would pass on stale state — does not prove non-reproducibility)",
                "the GREEN evidence absent",
                "the GREEN evidence running against stale state (does not prove reproducibility)"
              ]
            }
          }
        ]
      }
    },
    { "id": "TC-1", "type": "test_criterion", "description": "SPRINT.md gate step 5 command has zero hardcoded UUIDs; captures id at runtime", "verify": "rg -n '222ac4d3-4131-40cc-a650-e2d1a4256fa3' .spec/prds/mk6-migration/tasks/sprint-09-structured-output-on-local-models/SPRINT.md; test $? -eq 1", "maps_to_ac": "AC-1" },
    { "id": "TC-2", "type": "test_criterion", "description": "SPRINT.md gate step 5 oracle says status.committed === false; zero DB-query language", "verify": "rg -in 'database|db query|committed rows' .spec/prds/mk6-migration/tasks/sprint-09-structured-output-on-local-models/SPRINT.md; test $? -eq 1", "maps_to_ac": "AC-2" },
    { "id": "TC-3", "type": "test_criterion", "description": "struct-extract-status.test.ts runs the pipeline from a clean .tmp/extractions/ against the real fleet", "verify": "rm -rf .tmp/extractions && PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-extract-status.test.ts", "maps_to_ac": "AC-3" },
    { "id": "TC-4", "type": "test_criterion", "description": "RED evidence proves pre-fix NOT_FOUND from clean checkout; GREEN evidence proves post-fix reproducibility", "verify": "test -d .tmp/redhat-fix-c2-h4-red && test -d .tmp/redhat-fix-c2-h4-green", "maps_to_ac": "AC-4" },
    { "id": "TC-5", "type": "test_criterion", "description": "Manual reproducibility proof: rm -rf .tmp/extractions && PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-extract-status.test.ts → Exit 0", "verify": "rm -rf .tmp/extractions && PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-extract-status.test.ts", "maps_to_ac": "AC-3" },
    { "id": "TC-6", "type": "test_criterion", "description": "Typecheck + lint clean after the new test addition", "verify": "pnpm tsgo --noEmit && pnpm biome check tests/integration/service/struct-extract-status.test.ts", "maps_to_ac": "AC-3" }
  ]
}
-->
</details>
