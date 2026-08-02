# REDHAT-FIX-S29-R2-H03 — Compare article output to an immutable pre-freeze comparator, never a child authored from the SUT (H-03; sprint29-soak-flip.test.ts:157-213,863-894)

## What this does

Close red-hat H-03 (cycle-2) by forcing article parity to compare the post-soak network /article/:token response against an immutable pre-freeze D06-03 baseline (content-addressed sha256 + byteLength captured before fence/ETL/flip), never against bytes freshly fetched from the system-under-test child and written as the baseline in the same test run.

## Why

Remediate cycle-2 red-hat finding for CAP-CUT-01 (`REDHAT-FIX-S29-R2-H03`). Grounded in UC-SYNC-03 / UC-SYNC-04 / T-SYNC-008–010 / CAP-CUT-01 (and CAP-MIG-01 when ETL parity applies). Review evidence: `.spec/reviews/red-hat-20260802T022855Z-sprint-29-main-sha-cab5c0717974a96e33c338105b5d198d82cb607d.md` (reviewed SHA `cab5c0717974a96e33c338105b5d198d82cb607d`).

## How to verify

- `test -s .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-h03-red.log`
- `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-soak-flip.test.ts -t 'article|R2-H03|TC-6'`
- `bun services/platform/src/cli/holo.ts cutover:verify-article --json | jq -e '.ok==true and .match==true and .transport=="network" and .sha256==.baselineSha256'`
- `jq -e '.path=="A" and .agent=="devops-engineer"' .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-h03-path.json`
- `pnpm tsgo --noEmit` → exit 0

## Scope

Writes: services/platform/tests/integration/sprint29-soak-flip.test.ts — MODIFY remove SUT-authored baseline; load immutable pre-freeze fixture, services/platform/src/cutover/soak-fence.ts — MODIFY runVerifyArticle only if fail-closed/provenance fields needed, services/platform/src/cutover/article-baseline.ts — MODIFY capture helpers to enforce pre-freeze phase metadata if needed, services/platform/src/cli/holo.ts — MODIFY verify-article flags only if baseline path required, services/platform/tests/fixtures/sprint29/** — ADD frozen pre-freeze article-baseline fixture with real sha256 provenance, services/platform/tests/integration/redhat-fix-s29-r2-h03-*.test.ts — NEW optional, .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-h03-** — evidence

Prohibited: Self-authoring baseline from post-fence SUT in the same verification run, Static article:compat stub as parity oracle, app/, components/, hooks/, screens/, convex/** deletion, Weakening network transport back to createHonoApp sole oracle, Changing HOLO_MIGRATION_READ_ONLY fence mechanism

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: REDHAT-FIX-S29-R2-H03 — Compare article output to an immutable pre-freeze comparator, never a child authored from the SUT (H-03; sprint29-soak-flip.test.ts:157-213,863-894)
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M  (120 min)
AGENT:      implementer=devops-engineer | reviewer=code-reviewer
PROPOSED-BY: mastra-planner
TDD_MODE:   red_first     RED_GREEN_REQUIRED: yes     (requires_seeded_evidence: True)
CAPABILITY: CAP-CUT-01
SPRINT:     [Sprint 29 — Cutover: Write Freeze, ETL and Read-Only Soak Flip](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-*.test.ts
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
sprint29-soak-flip article cases load a pre-existing immutable article-baseline.json (D06-03 path or committed frozen fixture with provenance) captured before fence arm; runVerifyArticle match requires equal sha256/byteLength to that pre-freeze comparator; suite fails if baseline is missing, post-dates fence_armed_at incorrectly, or is written from the same post-fence child response used for comparison.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST compare post-soak GET /article/:token to an immutable pre-freeze comparator (D06-03 article-baseline.json or frozen fixture) with recorded sha256 + byteLength + capturedAtMs + shareToken
- MUST capture or require that baseline before HOLO_MIGRATION_READ_ONLY fence engage / cutover flip — not after starting the post-fence child (sprint29-soak-flip.test.ts:157-213 anti-pattern)
- MUST keep network transport for the verify-side GET (runVerifyArticle network path); baseline load is file/artifact, not SUT response rewrite
- MUST fail closed when baseline missing, empty, status!=200 at capture, or sha256 length != 64
- MUST capture RED evidence at cab5c071 proving self-authored baseline yields trivial match (157-213 then 863-894)
- NEVER fetch post-fence SUT /article/:token and write those bytes as the expected baseline for the same run (sprint29-soak-flip.test.ts:157-213)
- NEVER assert only report.sha256 === report.baselineSha256 when baselineSha256 was produced from the same response stream in beforeAll
- NEVER use static article:compat stub as the parity oracle
- NEVER delete convex/ or touch app/, components/, hooks/, screens/
- NEVER invent baseline sha256 without reading a pre-freeze artifact
- STRICTLY tdd_mode red_first; evidence under .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-h03-*
- STRICTLY PRIMARY AC test_tier e2e with real network article GET
- STRICTLY baseline provenance fields include capturedAtMs and preferably fence_armed_at ordering (capturedAtMs <= fence_armed_at OR documented pre-freeze phase)
- STRICTLY match requires byteLength equality AND sha256 equality
- STRICTLY baseline file is treated read-only during verify phase

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: GIVEN immutable_pre_freeze_article_baseline with sha256 64-hex, byteLength > 0,…
- [ ] AC-2: GIVEN suite source after R2-H03 WHEN static analysis of sprint29-soak-flip.test…
- [ ] AC-3: GIVEN missing_or_corrupt_baseline WHEN runVerifyArticle executes THEN ok false;…
- [ ] AC-4: GIVEN immutable_pre_freeze_article_baseline and intentionally mutated live arti…
- [ ] AC-5: GIVEN pre_fix_self_authored_article_baseline at cab5c071 WHEN implementer compl…
- [ ] `pnpm tsgo --noEmit` clean + biome clean on touched paths

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads)
--------------------------------------------------------------------------------

### AC-1 [PRIMARY] — GIVEN immutable_pre_freeze_article_baseline with sha256 64-hex, byteL… (flow_ref T-SYNC-010)
  GIVEN/WHEN/THEN: GIVEN immutable_pre_freeze_article_baseline with sha256 64-hex, byteLength > 0, shareToken, capturedAtMs from pre-fence phase WHEN operator runs cutover:verify-article --json (or runVerifyArticle) against post-soak network endpoint THEN report.match true only when live sha256 and byteLength equal the pre-freeze baseline; transport network; ok true
  TEST_TIER: e2e · TDD_STATE: red→green
  VERIFICATION_SERVICE: hono article
  VERIFY: `bun services/platform/src/cli/holo.ts cutover:verify-article --json | jq -e '.ok==true and .match==true and .transport=="network" and (.baselineSha256|length)==64 and .sha256==.baselineSha256 and .byteLength==.baselineByteLength and .byteLength>0'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if stub: returns ok without real CLI/service; empty: empty start state still greens; mock: mocked dependency without live I/O; static: hard-coded green report
  START_REF: immutable_pre_freeze_article_baseline
  MUST_OBSERVE: AC-1 report field ok equals true OR exit_code equals 1; AC-1 evidence_bytes count >= 1; artifact path contains literal 'redhat-fix-s29-r2'; baseline path is D06-03 default or frozen fixture path recorded before fence; report.sha256 equals baseline.sha256 (64-hex); report.byteLength equals baseline.byteLength and both > 0; report.match === true; report.transport === 'network'
  MUST_NOT_OBSERVE: empty/start signature: empty result or (0) count or none; stub green without real dependency; mock-only success
  EVIDENCE: file_artifact (required_capture=True)

### AC-2 [PRIMARY] — GIVEN suite source after R2-H03 WHEN static analysis of sprint29-soak… (flow_ref T-SYNC-010)
  GIVEN/WHEN/THEN: GIVEN suite source after R2-H03 WHEN static analysis of sprint29-soak-flip.test.ts article baseline setup THEN no writeFileSync of article-baseline from post-fence fetch in beforeAll that later becomes the compare target for the same child
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: vitest + static
  VERIFY: `rg -n 'article-baseline|baselineRes|writeFileSync' services/platform/tests/integration/sprint29-soak-flip.test.ts; PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-soak-flip.test.ts -t 'article|R2-H03|TC-6'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if stub: returns ok without real CLI/service; empty: empty start state still greens; mock: mocked dependency without live I/O; static: hard-coded green report
  START_REF: pre_fix_self_authored_article_baseline
  MUST_OBSERVE: AC-2 report field ok equals true OR exit_code equals 1; AC-2 evidence_bytes count >= 1; artifact path contains literal 'redhat-fix-s29-r2'; test loads baseline from pre-existing path (fixture or .tmp/D06-03 captured in a prior pre-fence phase); AC-2 observed_status equals literal 'PASS' and observed_count >= 1; article parity test exit 0 only with immutable comparator
  MUST_NOT_OBSERVE: empty/start signature: empty result or (0) count or none; stub green without real dependency; mock-only success
  EVIDENCE: file_artifact (required_capture=True)

### AC-3 — GIVEN missing_or_corrupt_baseline WHEN runVerifyArticle executes THEN… (flow_ref T-SYNC-010)
  GIVEN/WHEN/THEN: GIVEN missing_or_corrupt_baseline WHEN runVerifyArticle executes THEN ok false; match false; clear mismatch reason
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: cutover CLI
  VERIFY: `bun services/platform/src/cli/holo.ts cutover:verify-article --json --baseline /tmp/missing-article-baseline.json; jq -e '.ok==false and .match!=true'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if stub: returns ok without real CLI/service; empty: empty start state still greens; mock: mocked dependency without live I/O; static: hard-coded green report
  START_REF: missing_or_corrupt_baseline
  MUST_OBSERVE: AC-3 report field ok equals true OR exit_code equals 1; AC-3 evidence_bytes count >= 1; artifact path contains literal 'redhat-fix-s29-r2'; ok === false; match === false or undefined; AC-3 observed_status equals literal 'PASS' and observed_count >= 1
  MUST_NOT_OBSERVE: empty/start signature: empty result or (0) count or none; stub green without real dependency; mock-only success
  EVIDENCE: file_artifact (required_capture=True)

### AC-4 — GIVEN immutable_pre_freeze_article_baseline and intentionally mutated… (flow_ref T-SYNC-010)
  GIVEN/WHEN/THEN: GIVEN immutable_pre_freeze_article_baseline and intentionally mutated live article content (or wrong token) WHEN verify-article compares THEN match false; ok false; sha256 differs
  TEST_TIER: e2e · TDD_STATE: red→green
  VERIFICATION_SERVICE: hono article
  VERIFY: `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-soak-flip.test.ts -t 'R2-H03|mismatch|article-negative'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if stub: returns ok without real CLI/service; empty: empty start state still greens; mock: mocked dependency without live I/O; static: hard-coded green report
  START_REF: immutable_pre_freeze_article_baseline
  MUST_OBSERVE: AC-4 report field ok equals true OR exit_code equals 1; AC-4 evidence_bytes count >= 1; artifact path contains literal 'redhat-fix-s29-r2'; ok === false; match === false; sha256 !== baselineSha256 OR status != 200
  MUST_NOT_OBSERVE: empty/start signature: empty result or (0) count or none; stub green without real dependency; mock-only success
  EVIDENCE: file_artifact (required_capture=True)

### AC-5 — GIVEN pre_fix_self_authored_article_baseline at cab5c071 WHEN impleme… (flow_ref T-SYNC-010)
  GIVEN/WHEN/THEN: GIVEN pre_fix_self_authored_article_baseline at cab5c071 WHEN implementer completes R2-H03 THEN red+green+path.json under redhat-fix-s29-r2-h03-*
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: filesystem
  VERIFY: `test -s .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-h03-red.log && jq -e '.path=="A" and .agent=="devops-engineer"' .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-h03-path.json`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if stub: returns ok without real CLI/service; empty: empty start state still greens; mock: mocked dependency without live I/O; static: hard-coded green report
  START_REF: pre_fix_self_authored_article_baseline
  MUST_OBSERVE: AC-5 report field ok equals true OR exit_code equals 1; AC-5 evidence_bytes count >= 1; artifact path contains literal 'redhat-fix-s29-r2'; red log size > 0 documenting self-authored baseline defect; AC-5 observed_status equals literal 'PASS' and observed_count >= 1; AC-5 observed_status equals literal 'PASS' and observed_count >= 1
  MUST_NOT_OBSERVE: empty/start signature: empty result or (0) count or none; stub green without real dependency; mock-only success
  EVIDENCE: file_artifact (required_capture=True)

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | verify-article match requires equality to pre-freeze baseline sha256 … | AC-1 | `cutover:verify-article --json` |
| TC-2 | sprint29-soak-flip does not author article-baseline from post-fence S… | AC-2 | `rg + suite article cases` |
| TC-3 | missing baseline yields ok false match false without auto-author from… | AC-3 | `verify-article missing path` |
| TC-4 | divergent live content fails match | AC-4 | `negative article case` |
| TC-5 | baseline provenance includes capturedAtMs and 64-hex sha256 | AC-1 | `jq baseline file fields` |
| TC-6 | RED evidence non-empty for self-authored baseline defect at cab5c071 | AC-5 | `test -s redhat-fix-s29-r2-h03-red.log` |
| TC-7 | typecheck and lint clean on write_allowed surfaces | AC-1 | `pnpm tsgo --noEmit && scoped biome` |

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/tests/integration/sprint29-soak-flip.test.ts — MODIFY remove SUT-authored baseline; load immutable pre-freeze fixture
- services/platform/src/cutover/soak-fence.ts — MODIFY runVerifyArticle only if fail-closed/provenance fields needed
- services/platform/src/cutover/article-baseline.ts — MODIFY capture helpers to enforce pre-freeze phase metadata if needed
- services/platform/src/cli/holo.ts — MODIFY verify-article flags only if baseline path required
- services/platform/tests/fixtures/sprint29/** — ADD frozen pre-freeze article-baseline fixture with real sha256 provenance
- services/platform/tests/integration/redhat-fix-s29-r2-h03-*.test.ts — NEW optional
- .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-h03-** — evidence
writeProhibited:
- Self-authoring baseline from post-fence SUT in the same verification run
- Static article:compat stub as parity oracle
- app/, components/, hooks/, screens/
- convex/** deletion
- Weakening network transport back to createHonoApp sole oracle
- Changing HOLO_MIGRATION_READ_ONLY fence mechanism

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. .spec/reviews/red-hat-20260802T022855Z-sprint-29-main-sha-cab5c0717974a96e33c338105b5d198d82cb607d.md:93-97 — H-03 HIGH finding
2. .spec/reviews/red-hat-20260802T022855Z-sprint-29-main-sha-cab5c0717974a96e33c338105b5d198d82cb607d.md:111 — remediation #5 preserve article pre-freeze comparator
3. services/platform/tests/integration/sprint29-soak-flip.test.ts:157-213 — baseline capture from post-fence child
4. services/platform/tests/integration/sprint29-soak-flip.test.ts:863-894 — compare same endpoint to self-authored baseline
5. services/platform/src/cutover/soak-fence.ts:1322-1341 — runVerifyArticle network + baseline load
6. services/platform/src/cutover/article-baseline.ts:37 — defaultArticleBaselinePath D06-03
7. D06-03-durable-write-fence-cron-queue-drain-quiet-interval.md — article-baseline capture phase
8. D06-05-flip-app-plus-mcp-into-rollbackable-read-only-soak-run-verification-ga.md — AC-4 article parity
9. REDHAT-FIX-S29-H01-verify-deployed-network-mcp-and-article-endpoints-with-schema-valid-postgres-backed-per-tool.md — network article AC-4 parent

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- gate: `test -s .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-h03-red.log` → Exit 0
- gate: `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-soak-flip.test.ts -t 'article|R2-H03|TC-6'` → Exit 0
- gate: `bun services/platform/src/cli/holo.ts cutover:verify-article --json | jq -e '.ok==true and .match==true and .transport=="network" and .sha256==.baselineSha256'` → Exit 0
- gate: `jq -e '.path=="A" and .agent=="devops-engineer"' .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-h03-path.json` → Exit 0
- gate: `pnpm tsgo --noEmit` → Exit 0

--------------------------------------------------------------------------------
DESIGN
--------------------------------------------------------------------------------
References: .spec/reviews/red-hat-20260802T022855Z-sprint-29-main-sha-cab5c0717974a96e33c338105b5d198d82cb607d.md#H-03, sprint29-soak-flip.test.ts:157-213,863-894, article-baseline.ts D06-03 path, D06-03 / D06-05 AC-4
Interaction notes:
- Coordinate with sibling R2 remediations; do not fake-pass incomplete siblings
pattern: Capture article-baseline during D06-03 pre-freeze (or ship frozen fixture with pre-freeze provenance). Post-soak verify-article only reads that immutable file and compares network bytes. Tests must not write the expected value from the SUT under test in the same run.
pattern_source: Review H-03 + D06-03 baseline capture + H01 network article AC
anti_pattern: beforeAll fetch post-fence child → writeFileSync article-baseline → TC-6 compare same child (self-equality)

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------
Implementer: devops-engineer — PRIMARY surface is D06-05 article parity: immutable pre-freeze D06-03 article-baseline comparator vs post-soak network GET. Removes self-equality anti-pattern where the suite authors the baseline from the same post-fence child it later compares. CAP-CUT-01 soak verification. Implementer = devops-engineer; planner = mastra-planner; reviewers = mastra-reviewer + test-quality-reviewer.
Reviewer: code-reviewer (+ mastra-reviewer / convex-reviewer / test-quality-reviewer when domain-scoped)
Proposed By: mastra-planner

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: D06-03, REDHAT-FIX-S29-H01, D06-05
Blocks: unqualified-sprint-29-close

--------------------------------------------------------------------------------
NOTES
--------------------------------------------------------------------------------
['Finding lineage: .spec/reviews/red-hat-20260802T022855Z-sprint-29-main-sha-cab5c0717974a96e33c338105b5d198d82cb607d.md finding H-03 HIGH; reviewed SHA cab5c0717974a96e33c338105b5d198d82cb607d', 'Cycle-2: H01 network article path still self-authors expected value; this task restores D06-03 pre-freeze comparator integrity', 'Fakeability: AC-1/AC-2 fail if suite reintroduces fetch→write baseline→compare same response', 'Coordinates with R2-H02 for endpoint identity on article reports but owns baseline immutability exclusively']

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-S29-R2-H03",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "immutable_pre_freeze_article_baseline": {
      "description": "D06-03 article-baseline.json or committed frozen fixture captured against pre-fence public article bytes for a known shareToken; sha256 64-hex; byteLength>0; capturedAtMs before fence_armed_at.",
      "seed_method": "migration_fixture",
      "records": [
        ".tmp/D06-03/article-baseline.json or services/platform/tests/fixtures/sprint29/article-baseline-pre-freeze.json",
        "fields: sha256, byteLength, shareToken, capturedAtMs, url",
        "shareToken exists as public document in holocron_nonprod"
      ]
    },
    "missing_or_corrupt_baseline": {
      "description": "Absent path or baseline with empty sha256 / zero byteLength.",
      "seed_method": "migration_fixture",
      "records": [
        "path does not exist",
        "or sha256: '' / byteLength: 0"
      ]
    },
    "pre_fix_self_authored_article_baseline": {
      "description": "cab5c071: beforeAll fetches post-fence child /article/:token, writes article-baseline.json, later TC-6 compares same endpoint to that baseline.",
      "seed_method": "recorded_external",
      "records": [
        "services/platform/tests/integration/sprint29-soak-flip.test.ts:157-213",
        "services/platform/tests/integration/sprint29-soak-flip.test.ts:863-894",
        "services/platform/src/cutover/article-baseline.ts defaultArticleBaselinePath",
        ".spec/reviews/red-hat-20260802T022855Z-sprint-29-main-sha-cab5c0717974a96e33c338105b5d198d82cb607d.md H-03"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "flow_ref": "T-SYNC-010",
      "description": "GIVEN immutable_pre_freeze_article_baseline with sha256 64-hex, byteLength > 0, shareToken, capturedAtMs from pre-fence phase WHEN operator runs cutover:verify-article --json (or runVerifyArticle) against post-soak network endpoint THEN report.match true only when live sha256 and byteLength equal the pre-freeze baseline; transport network; ok true",
      "verify": "bun services/platform/src/cli/holo.ts cutover:verify-article --json | jq -e '.ok==true and .match==true and .transport==\"network\" and (.baselineSha256|length)==64 and .sha256==.baselineSha256 and .byteLength==.baselineByteLength and .byteLength>0'",
      "maps_to_ac": null,
      "test_tier": "e2e",
      "scenario": {
        "topology": "single-node",
        "verification_service": "hono article",
        "negative_control": {
          "would_fail_if": [
            "stub: returns ok without real CLI/service",
            "empty: empty start state still greens",
            "mock: mocked dependency without live I/O",
            "static: hard-coded green report"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "immutable_pre_freeze_article_baseline",
            "action": {
              "actor": "operator",
              "steps": [
                "load pre-freeze baseline file (no rewrite)",
                "network GET /article/:token post-soak",
                "compare sha256/byteLength"
              ]
            },
            "end_state": {
              "must_observe": [
                "AC-1 report field ok equals true OR exit_code equals 1",
                "AC-1 evidence_bytes count >= 1",
                "artifact path contains literal 'redhat-fix-s29-r2'",
                "baseline path is D06-03 default or frozen fixture path recorded before fence",
                "report.sha256 equals baseline.sha256 (64-hex)",
                "report.byteLength equals baseline.byteLength and both > 0",
                "report.match === true",
                "report.transport === 'network'"
              ],
              "must_not_observe": [
                "empty/start signature: empty result or (0) count or none",
                "stub green without real dependency",
                "mock-only success"
              ]
            }
          }
        ],
        "tier": "visible",
        "test_tier": "e2e"
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "primary": true,
      "flow_ref": "T-SYNC-010",
      "description": "GIVEN suite source after R2-H03 WHEN static analysis of sprint29-soak-flip.test.ts article baseline setup THEN no writeFileSync of article-baseline from post-fence fetch in beforeAll that later becomes the compare target for the same child",
      "verify": "rg -n 'article-baseline|baselineRes|writeFileSync' services/platform/tests/integration/sprint29-soak-flip.test.ts; PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-soak-flip.test.ts -t 'article|R2-H03|TC-6'",
      "maps_to_ac": null,
      "test_tier": "integration",
      "scenario": {
        "topology": "single-node",
        "verification_service": "vitest + static",
        "negative_control": {
          "would_fail_if": [
            "stub: returns ok without real CLI/service",
            "empty: empty start state still greens",
            "mock: mocked dependency without live I/O",
            "static: hard-coded green report"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "pre_fix_self_authored_article_baseline",
            "action": {
              "actor": "cli_user",
              "steps": [
                "inspect test for self-author pattern",
                "run article parity tests with immutable baseline fixture"
              ]
            },
            "end_state": {
              "must_observe": [
                "AC-2 report field ok equals true OR exit_code equals 1",
                "AC-2 evidence_bytes count >= 1",
                "artifact path contains literal 'redhat-fix-s29-r2'",
                "test loads baseline from pre-existing path (fixture or .tmp/D06-03 captured in a prior pre-fence phase)",
                "AC-2 observed_status equals literal 'PASS' and observed_count >= 1",
                "article parity test exit 0 only with immutable comparator"
              ],
              "must_not_observe": [
                "empty/start signature: empty result or (0) count or none",
                "stub green without real dependency",
                "mock-only success"
              ]
            }
          }
        ],
        "tier": "visible",
        "test_tier": "integration"
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "primary": false,
      "flow_ref": "T-SYNC-010",
      "description": "GIVEN missing_or_corrupt_baseline WHEN runVerifyArticle executes THEN ok false; match false; clear mismatch reason",
      "verify": "bun services/platform/src/cli/holo.ts cutover:verify-article --json --baseline /tmp/missing-article-baseline.json; jq -e '.ok==false and .match!=true'",
      "maps_to_ac": null,
      "test_tier": "integration",
      "scenario": {
        "topology": "single-node",
        "verification_service": "cutover CLI",
        "negative_control": {
          "would_fail_if": [
            "stub: returns ok without real CLI/service",
            "empty: empty start state still greens",
            "mock: mocked dependency without live I/O",
            "static: hard-coded green report"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "missing_or_corrupt_baseline",
            "action": {
              "actor": "operator",
              "steps": [
                "verify-article with missing baseline",
                "assert fail-closed"
              ]
            },
            "end_state": {
              "must_observe": [
                "AC-3 report field ok equals true OR exit_code equals 1",
                "AC-3 evidence_bytes count >= 1",
                "artifact path contains literal 'redhat-fix-s29-r2'",
                "ok === false",
                "match === false or undefined",
                "AC-3 observed_status equals literal 'PASS' and observed_count >= 1"
              ],
              "must_not_observe": [
                "empty/start signature: empty result or (0) count or none",
                "stub green without real dependency",
                "mock-only success"
              ]
            }
          }
        ],
        "tier": "visible",
        "test_tier": "integration"
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "primary": false,
      "flow_ref": "T-SYNC-010",
      "description": "GIVEN immutable_pre_freeze_article_baseline and intentionally mutated live article content (or wrong token) WHEN verify-article compares THEN match false; ok false; sha256 differs",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-soak-flip.test.ts -t 'R2-H03|mismatch|article-negative'",
      "maps_to_ac": null,
      "test_tier": "e2e",
      "scenario": {
        "topology": "single-node",
        "verification_service": "hono article",
        "negative_control": {
          "would_fail_if": [
            "stub: returns ok without real CLI/service",
            "empty: empty start state still greens",
            "mock: mocked dependency without live I/O",
            "static: hard-coded green report"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "immutable_pre_freeze_article_baseline",
            "action": {
              "actor": "operator",
              "steps": [
                "use wrong shareToken or divergent baseline fixture",
                "verify-article",
                "assert mismatch"
              ]
            },
            "end_state": {
              "must_observe": [
                "AC-4 report field ok equals true OR exit_code equals 1",
                "AC-4 evidence_bytes count >= 1",
                "artifact path contains literal 'redhat-fix-s29-r2'",
                "ok === false",
                "match === false",
                "sha256 !== baselineSha256 OR status != 200"
              ],
              "must_not_observe": [
                "empty/start signature: empty result or (0) count or none",
                "stub green without real dependency",
                "mock-only success"
              ]
            }
          }
        ],
        "tier": "visible",
        "test_tier": "e2e"
      }
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "primary": false,
      "flow_ref": "T-SYNC-010",
      "description": "GIVEN pre_fix_self_authored_article_baseline at cab5c071 WHEN implementer completes R2-H03 THEN red+green+path.json under redhat-fix-s29-r2-h03-*",
      "verify": "test -s .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-h03-red.log && jq -e '.path==\"A\" and .agent==\"devops-engineer\"' .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-h03-path.json",
      "maps_to_ac": null,
      "test_tier": "integration",
      "scenario": {
        "topology": "single-node",
        "verification_service": "filesystem",
        "negative_control": {
          "would_fail_if": [
            "stub: returns ok without real CLI/service",
            "empty: empty start state still greens",
            "mock: mocked dependency without live I/O",
            "static: hard-coded green report"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "pre_fix_self_authored_article_baseline",
            "action": {
              "actor": "cli_user",
              "steps": [
                "red",
                "implement",
                "green",
                "path.json"
              ]
            },
            "end_state": {
              "must_observe": [
                "AC-5 report field ok equals true OR exit_code equals 1",
                "AC-5 evidence_bytes count >= 1",
                "artifact path contains literal 'redhat-fix-s29-r2'",
                "red log size > 0 documenting self-authored baseline defect",
                "AC-5 observed_status equals literal 'PASS' and observed_count >= 1",
                "AC-5 observed_status equals literal 'PASS' and observed_count >= 1"
              ],
              "must_not_observe": [
                "empty/start signature: empty result or (0) count or none",
                "stub green without real dependency",
                "mock-only success"
              ]
            }
          }
        ],
        "tier": "visible",
        "test_tier": "integration"
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "verify-article match requires equality to pre-freeze baseline sha256 and byteLength over network transport",
      "maps_to_ac": "AC-1",
      "verify": "cutover:verify-article --json"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "sprint29-soak-flip does not author article-baseline from post-fence SUT response for the same comparison",
      "maps_to_ac": "AC-2",
      "verify": "rg + suite article cases"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "missing baseline yields ok false match false without auto-author from SUT",
      "maps_to_ac": "AC-3",
      "verify": "verify-article missing path"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "divergent live content fails match",
      "maps_to_ac": "AC-4",
      "verify": "negative article case"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "baseline provenance includes capturedAtMs and 64-hex sha256",
      "maps_to_ac": "AC-1",
      "verify": "jq baseline file fields"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "RED evidence non-empty for self-authored baseline defect at cab5c071",
      "maps_to_ac": "AC-5",
      "verify": "test -s redhat-fix-s29-r2-h03-red.log"
    },
    {
      "id": "TC-7",
      "type": "test_criterion",
      "description": "typecheck and lint clean on write_allowed surfaces",
      "maps_to_ac": "AC-1",
      "verify": "pnpm tsgo --noEmit && scoped biome"
    }
  ],
  "touches_capabilities": [
    "CAP-CUT-01"
  ],
  "provides": [
    "immutable-pre-freeze-article-comparator",
    "article-parity-without-self-equality"
  ],
  "consumes": [
    "d06-03-article-baseline-capture",
    "h01-network-verify-article",
    "public-share-token-document"
  ],
  "boundary_contracts": [
    "Baseline is pre-freeze immutable artifact, not SUT output of the verification run",
    "Network GET is the live actual; file is the expected",
    "Missing baseline fails closed without auto-author"
  ],
  "proposed_by": "mastra-planner",
  "source_finding": {
    "report": ".spec/reviews/red-hat-20260802T022855Z-sprint-29-main-sha-cab5c0717974a96e33c338105b5d198d82cb607d.md",
    "reviewed_sha": "cab5c0717974a96e33c338105b5d198d82cb607d"
  }
}
-->

</details>
