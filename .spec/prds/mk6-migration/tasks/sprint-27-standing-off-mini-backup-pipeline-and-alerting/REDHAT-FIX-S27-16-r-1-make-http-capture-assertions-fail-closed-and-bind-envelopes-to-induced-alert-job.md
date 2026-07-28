# REDHAT-FIX-S27-16 — [R-1] Make HTTP capture assertions fail closed and bind envelopes to induced alert jobs

## What this does

Close R-1 CRITICAL residual certification theatre: step 8 (and alert wire claims generally) soft-pass HTTP delivery via SOFT_OK + force-print OK even when CAP is missing; assertions only require D04_01_RED_SUITE_GATE_OK + post[...] greps, not envelope fields; steps 4–6 assert only sweep stdout self-report — mutation M1 still greens those paths. Make HTTP capture assertions fail-closed, require jq envelopes, bind CAP rawBody to induced jobs, and preferably enforce CAP growth on steps 4–6/10.

## Why

Remediate red-hat finding R-1 (CRITICAL) from .spec/reviews/red-hat-sprint27-20260728T082702Z.md.

## How to verify

- `PLATFORM_IT=1 BACKUP_ALERT_OVERDUE_MS=1000 BACKUP_ALERT_TEST_WINDOW_MS=10000 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts` → Exit 0
- `pnpm tsgo --noEmit` → Exit 0
- `pnpm biome check .` → Exit 0

## Scope

Writes: .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json, .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/SPRINT.md, scripts/promote-backup-alert-http-captures.sh, scripts/gate/s27-step10-production-sla.sh, scripts/gate/**, services/platform/tests/integration/sprint27-backup-alerting-red.test.ts, services/platform/tests/**, .tmp/redhat-fix-s27-16/**, .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-ba

Prohibited: Weakening postBackupAlert production delivery to skip fetch, Client-side fabrication of CAP envelopes from posts[], Reintroducing SOFT_OK or || true around CAP checks, Replacing independent CAP with mock/spy sink as hard oracle, Out-of-scope product paths outside backup alerting / gate scripts

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: REDHAT-FIX-S27-16 — [R-1] Make HTTP capture assertions fail closed and bind envelopes to induced alert jobs
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M  (120 min)
AGENT:      implementer=red-test-generator | reviewer=test-quality-reviewer
PROPOSED-BY: red-test-generator
TDD_MODE:   red_first     RED_GREEN_REQUIRED: yes     (requires_seeded_evidence: True)
CAPABILITY: CAP-BAK-01
SPRINT:     [Sprint 27 — Standing Off-Mini Backup Pipeline and Alerting](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 BACKUP_ALERT_OVERDUE_MS=1000 BACKUP_ALERT_TEST_WINDOW_MS=10000 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
gate-plan step 8 has no SOFT_OK; missing CAP fails the step; require_all_regex hard-requires ALERT_HTTP_CAPTURES_OK and envelope success; CAP rawBody binds to induced jobs; M1 (stub postBackupAlert without fetch) fails the oracle; preferably steps 4–6/10 also observe CAP growth/binding.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST remove ALERT_HTTP_CAPTURES_SOFT_OK soft-pass branch from gate-plan step 8 (and any helper that emits it)
- MUST fail-closed when alerts-http-captures.json is missing or fails jq envelope check (method AND url AND headers AND rawBody AND receivedAt)
- MUST add ALERT_HTTP_CAPTURES_OK (and preferably envelope/job-bind tokens) to step 8 assertion.require_all_regex — not only D04_01_RED_SUITE_GATE_OK + post[...] greps
- MUST bind CAP rawBody to induced alert jobs (wal_archive / base_backup / restic_blob_mirror) so any-envelope is insufficient
- MUST ensure final success echo does not force-print ALERT_HTTP_CAPTURES_OK on a soft/missing-CAP path
- MUST kill mutation M1: stub postBackupAlert without fetch cannot green step 8 (and preferably steps 4–6/10 wire claims)
- MUST document negative_control naming stub postBackupAlert without fetch / soft-pass SOFT_OK
- MUST preferably require CAP growth or job-bound rawBody on steps 4–6 and/or step 10 when receiver is present
- NEVER treat missing CAP as soft success
- NEVER force-print hard ALERT_HTTP_CAPTURES_OK after SOFT_OK
- NEVER accept sweep stdout posts[] alone as proof of independent HTTP delivery for step 8
- NEVER synthesize method/url/headers/rawBody/receivedAt client-side from posts[]
- NEVER mock fetch globally to fabricate receiver-side captures
- NEVER leave require_all_regex without envelope/OK hard tokens on step 8
- STRICTLY independent observer: CAP is receiver-side (or promote script of receiver dual-write), not posts[] serialization
- STRICTLY flow_ref T-PLAT-024 / CAP-BAK-01 gate honesty
- STRICTLY residual of F-7 / REDHAT-FIX-S27-07 — preserve CRITICAL severity until fail-closed + bind are proven

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: AC-1
- [ ] AC-2: AC-2
- [ ] AC-3: AC-3
- [ ] AC-4: AC-4
- [ ] AC-5: AC-5
- [ ] `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean on write_allowed paths

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads)
--------------------------------------------------------------------------------

### AC-1 [PRIMARY] — GIVEN gate-plan.json step 8 currently soft-passes missing CAP envelopes (ALERT_HTTP_CAPTURES_SOFT_OK branch + force-p... (flow_ref T-PLAT-024)
  SUMMARY: GIVEN gate-plan.json step 8 currently soft-passes missing CAP envelopes (ALERT_HTTP_CAPTURES_SOFT_OK branch + force-print ALERT_HTTP_CAPTURES_OK) and step8.assertion.json require_all_regex only greps D04_01_RED_SUITE_GATE_OK + post[...] self-report lines (R-1 CRITICAL residual of F-7 / REDHAT-FIX-S27-07) WHEN the Human Testing Gate certifies independent HTTP delivery THEN step 8 MUST fail-closed if alerts-http-captures.json is missing or lacks method/url/headers/rawBody/receivedAt; SOFT_OK is removed; require_all_regex hard-requires ALERT_HTTP_CAPTURES_OK and envelope-bound tokens; final echo MUST NOT print hard OK on a soft path (T-PLAT-024).
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: backup-alerting
  VERIFY: `jq -r '.steps[] | select(.n==8) | .literal_cmd' .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json | grep -v SOFT_OK; jq -e '.steps[] | select(.n==8) | .assertion.require_all_regex | index("ALERT_HTTP_CAPTURES_OK")' .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if step 8 still has ALERT_HTTP_CAPTURES_SOFT_OK soft-pass branch (pre-fix R-1 theatre); final echo always force-prints ALERT_HTTP_CAPTURES_OK even when CAP file is missing; require_all_regex still only needs D04_01_RED_SUITE_GATE_OK + post[...] greps without envelope markers; mutation M1 stub postBackupAlert return ok without fetch still greens step 8 (soft-pass / empty CAP); oracle treats missing CAP as success via if/else soft branch; mock/spy receiver fabricates captures client-side from posts[] without real fetch wire
  START_REF: s27_step8_soft_cap_oracle_baseline
  MUST_OBSERVE: gate-plan.json step 8 literal_cmd has NO ALERT_HTTP_CAPTURES_SOFT_OK; missing CAP file causes non-zero exit (fail-closed); jq -e 'length>=1 and .[0].method and .[0].url and .[0].headers and .[0].rawBody and .[0].receivedAt' on CAP is mandatory before ALERT_HTTP_CAPTURES_OK; step8.assertion.json / gate-plan require_all_regex includes ALERT_HTTP_CAPTURES_OK; require_all_regex does not treat SOFT_OK as success; hard OK tokens only emitted after envelope jq succeeds
  MUST_NOT_OBSERVE: ALERT_HTTP_CAPTURES_SOFT_OK anywhere in step 8 cmd or logs counted as pass; force-print ALERT_HTTP_CAPTURES_OK after soft branch; gate pass with missing CAP file; empty soft signatures that green without method/url/headers/rawBody/receivedAt
  EVIDENCE: file_artifact

### AC-2 — GIVEN induced alert jobs (wal_archive kill, base_backup credential-expired, restic_blob_mirror config-removed) produc... (flow_ref T-PLAT-024)
  SUMMARY: GIVEN induced alert jobs (wal_archive kill, base_backup credential-expired, restic_blob_mirror config-removed) produce CAP rawBody payloads WHEN step 8 (and preferably steps 4–6/10) assert delivery THEN each durable capture rawBody MUST bind to the induced job_name/job_id and failure_reason/reason — not merely any envelope present (R-1 Expected: bind CAP rawBody to induced job).
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: backup-alerting
  VERIFY: `jq -e '[.[] | select(.rawBody|test("wal_archive|base_backup|restic_blob_mirror"))] | length >= 1' .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/.gate-evidence/<run>/alerts-http-captures.json; rg -n 'rawBody|job_name|bind' .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json scripts/promote-backup-alert-http-captures.sh scripts/gate/`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if CAP contains envelope fields but rawBody is empty or unrelated job names; oracle only checks .[0].method without binding to the induced job under test; steps 4–6 still green solely on sweep stdout post[...] self-report with zero CAP growth for that job; stub postBackupAlert without fetch leaves CAP unbound while posts[] still greps green
  START_REF: s27_induced_jobs_with_cap_receiver
  MUST_OBSERVE: ≥1 CAP entry whose rawBody JSON names wal_archive after kill induce; ≥1 CAP entry whose rawBody JSON names base_backup after credential induce; ≥1 CAP entry whose rawBody JSON names restic_blob_mirror after config-removed induce; documented bind check: jq select(.rawBody|fromjson|.job_name==$job) or equivalent string test
  MUST_NOT_OBSERVE: unbound envelope-only pass with wrong job; self-report posts[] as substitute for CAP job binding
  EVIDENCE: alert_artifact

### AC-3 — GIVEN mutation M1 (stub postBackupAlert to return {ok:true} without calling fetch) WHEN gate steps that claim webhook... (flow_ref T-PLAT-024)
  SUMMARY: GIVEN mutation M1 (stub postBackupAlert to return {ok:true} without calling fetch) WHEN gate steps that claim webhook delivery re-run with the fail-closed CAP oracle THEN those steps MUST fail (zero CAP growth / missing envelopes) — residual M1 kill from R-1 / F-7.
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: backup-alerting
  VERIFY: `Documented mutation probe or static proof: with postBackupAlert short-circuit before fetch, CAP length does not grow and step 8 exits non-zero; rg -n 'stub postBackupAlert|without fetch|M1' task evidence`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if stub postBackupAlert without fetch still greens step 8 via SOFT_OK or posts[] greps; client-forged captures written from posts[] after stub; soft-pass empty CAP counted as ALERT_HTTP_CAPTURES_OK
  START_REF: s27_m1_stub_postBackupAlert_no_fetch
  MUST_OBSERVE: negative_control text explicitly names: stub postBackupAlert without fetch; M1 yields CAP Δ=0 or missing CAP → gate step fail; oracle prefers CAP envelope over sweep.posts[] self-report
  MUST_NOT_OBSERVE: M1 still green under new oracle; SOFT_OK path surviving M1
  EVIDENCE: stdout

### AC-4 — GIVEN steps 4–6 and preferably step 10 currently assert only sweep stdout post[...] self-report WHEN remediation land... (flow_ref T-PLAT-024)
  SUMMARY: GIVEN steps 4–6 and preferably step 10 currently assert only sweep stdout post[...] self-report WHEN remediation lands THEN preferably CAP length growth and/or job-bound rawBody checks are required on those alert steps (R-1 Fix: preferably CAP growth/binding on steps 4–6/10) so independent HTTP delivery is not exclusive to step 8.
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: backup-alerting
  VERIFY: `jq -r '.steps[] | select(.n==4 or .n==5 or .n==6 or .n==10) | "\(.n):\(.literal_cmd)"' .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json | rg -n 'alerts-http-captures|CAP|rawBody|ALERT_HTTP' || true`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if only step 8 hard-requires CAP while steps 4–6 remain posts[]-only forever with no improvement path documented; step 10 still ignores CAP when ALERT_WEBHOOK_URL/receiver present; CAP growth assertion uses OR soft-pass that ignores missing CAP
  START_REF: s27_steps_4_6_10_self_report_only
  MUST_OBSERVE: step 8 fail-closed CAP is mandatory (blocking); preferably steps 4–6 and/or 10 snapshot CAP length or jq-bind rawBody to induced job; if steps 4–6 remain stdout-only, task notes residual risk and step 8 remains the hard wire oracle
  MUST_NOT_OBSERVE: all alert steps still purely self-report with no CAP hard path anywhere; soft CAP growth checks that pass when file missing
  EVIDENCE: file_artifact

### AC-5 — GIVEN typecheck and lint gates WHEN write_allowed paths change THEN pnpm tsgo --noEmit and pnpm biome check . exit 0. (flow_ref T-PLAT-024)
  SUMMARY: GIVEN typecheck and lint gates WHEN write_allowed paths change THEN pnpm tsgo --noEmit and pnpm biome check . exit 0.
  TEST_TIER: unit · TDD_STATE: red→green
  VERIFICATION_SERVICE: backup-alerting
  VERIFY: `pnpm tsgo --noEmit → Exit 0; pnpm biome check . → Exit 0`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if typecheck or lint failures ignored
  START_REF: s27_step8_soft_cap_oracle_baseline
  MUST_OBSERVE: typecheck exit 0; lint exit 0
  MUST_NOT_OBSERVE: unchecked write_allowed changes
  EVIDENCE: stdout


--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | Step 8 literal_cmd has no SOFT_OK soft-pass | AC-1 | `! jq -r '.steps[]\|select(.n==8)\|.literal_cmd' .spec/prds/mk6-migration/tasks/sprint-27-standing...` |
| TC-2 | Step 8 require_all_regex includes ALERT_HTTP_CAPTURES_OK | AC-1 | `jq -e '.steps[] \| select(.n==8) \| .assertion.require_all_regex \| map(test("ALERT_HTTP_CAPTURES...` |
| TC-3 | Missing CAP fails closed in step 8 cmd (no else soft branch) | AC-1 | `jq -r '.steps[]\|select(.n==8)\|.literal_cmd' .spec/prds/mk6-migration/tasks/sprint-27-standing-o...` |
| TC-4 | CAP rawBody binds to at least one induced job name on post-fix evidence | AC-2 | `jq -e '[.[]\|select(.rawBody\|test("wal_archive\|base_backup\|restic_blob_mirror"))]\|length>=1' ...` |
| TC-5 | Negative control documents stub postBackupAlert without fetch (M1) | AC-3 | `rg -n 'stub postBackupAlert without fetch\|mutation M1' .spec/prds/mk6-migration/tasks/sprint-27-...` |
| TC-6 | RED suite still passes under short windows | AC-2 | `PLATFORM_IT=1 BACKUP_ALERT_OVERDUE_MS=1000 BACKUP_ALERT_TEST_WINDOW_MS=10000 pnpm vitest run serv...` |
| TC-7 | Typecheck + lint clean | AC-5 | `pnpm tsgo --noEmit → Exit 0; pnpm biome check . → Exit 0` |

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json
- .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/SPRINT.md
- scripts/promote-backup-alert-http-captures.sh
- scripts/gate/s27-step10-production-sla.sh
- scripts/gate/**
- services/platform/tests/integration/sprint27-backup-alerting-red.test.ts
- services/platform/tests/**
- .tmp/redhat-fix-s27-16/**
- .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/.gate-evidence/**

writeProhibited:
- Weakening postBackupAlert production delivery to skip fetch
- Client-side fabrication of CAP envelopes from posts[]
- Reintroducing SOFT_OK or || true around CAP checks
- Replacing independent CAP with mock/spy sink as hard oracle
- Out-of-scope product paths outside backup alerting / gate scripts

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. .spec/reviews/red-hat-sprint27-20260728T082702Z.md (R-1 CRITICAL soft HTTP / M1; GP-2)
2. .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json step 8 literal_cmd + assertion
3. .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/.gate-evidence/20260728T075339Z/step8.assertion.json
4. .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/.gate-evidence/20260728T075339Z/alerts-http-captures.json
5. .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/REDHAT-FIX-S27-07-f-7-capture-real-webhook-http-requests-with-an-independent-receiver.md
6. services/platform/tests/integration/sprint27-backup-alerting-red.test.ts
7. services/platform/src/backup/alerting.ts
8. scripts/promote-backup-alert-http-captures.sh
9. scripts/gate/s27-step10-production-sla.sh

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- PLATFORM_IT=1 BACKUP_ALERT_OVERDUE_MS=1000 BACKUP_ALERT_TEST_WINDOW_MS=10000 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts → Exit 0
- pnpm tsgo --noEmit → Exit 0
- pnpm biome check . → Exit 0
- ! jq -r '.steps[]|select(.n==8)|.literal_cmd' .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json | grep -q SOFT_OK
- jq -e '.steps[] | select(.n==8) | .assertion.require_all_regex | map(test("ALERT_HTTP_CAPTURES_OK")) | any' .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json → true

--------------------------------------------------------------------------------
DESIGN
--------------------------------------------------------------------------------
References: .spec/reviews/red-hat-sprint27-20260728T082702Z.md, .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/REDHAT-FIX-S27-07-f-7-capture-real-webhook-http-requests-with-an-independent-receiver.md, .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json
Pattern: Fail-closed CAP: CAP="$EVIDENCE/alerts-http-captures.json"; test -f "$CAP"; jq -e 'length>=1 and all(.[]; .method and .url and .headers and .rawBody and .receivedAt)' "$CAP"; bind rawBody to induced jobs; echo ALERT_HTTP_CAPTURES_OK; require_all_regex includes ALERT_HTTP_CAPTURES_OK. Prefer pre/post CAP snapshots on steps 4–6.
Anti-pattern: if [ -f CAP ]; then OK; else SOFT_OK; fi; echo ALERT_HTTP_CAPTURES_OK always; require_all only D04_01_RED_SUITE_GATE_OK + post[job] greps; stub postBackupAlert still green.


--------------------------------------------------------------------------------
VERIFICATION GATES
--------------------------------------------------------------------------------
- PLATFORM_IT=1 BACKUP_ALERT_OVERDUE_MS=1000 BACKUP_ALERT_TEST_WINDOW_MS=10000 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts → Exit 0
- pnpm tsgo --noEmit → Exit 0
- pnpm biome check . → Exit 0
- ! jq -r '.steps[]|select(.n==8)|.literal_cmd' .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json | grep -q SOFT_OK
- jq -e '.steps[] | select(.n==8) | .assertion.require_all_regex | map(test("ALERT_HTTP_CAPTURES_OK")) | any' .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json → true

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------
- Implementer: red-test-generator
- Reviewer: test-quality-reviewer
- Rationale: R-1 is a CRITICAL test-reality residual: the gate soft-passes HTTP delivery and leaves mutation M1 green on steps that only grep sweep posts[]. red-test-generator owns fail-closed oracles, CAP binding, and negative_control naming for stub postBackupAlert without fetch.
- Proposed by: red-test-generator

--------------------------------------------------------------------------------
CAPABILITY CHAIN
--------------------------------------------------------------------------------
- touches_capabilities: ['CAP-BAK-01']

--------------------------------------------------------------------------------
CODING STANDARDS
--------------------------------------------------------------------------------
- RULES.md
- services/platform conventions
- ANTI-STUB-REVIEW: no mock/stub soft-pass oracles
- TDD red_first with seeded RED evidence before GREEN

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
- depends_on: ['REDHAT-FIX-S27-07', 'REDHAT-FIX-S27-05', 'D04-01', 'D04-05']
- blocks: ['Sprint 27 red-hat verdict lift (R-1 blocking)']

--------------------------------------------------------------------------------
NOTES
--------------------------------------------------------------------------------
- Source finding: red-hat-sprint27-20260728T082702Z.md (REDHAT-FIX-S27-16)
- CAP-BAK-01 residual remediation — gate honesty + production-truth.
- Specialist JSON retained at .tmp/s27-redhat-r-cycle2-expanded-tasks.json

</details>

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-S27-16",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "s27_step8_soft_cap_oracle_baseline": {
      "description": "Pre-fix R-1: gate-plan step 8 has SOFT_OK branch and force-prints ALERT_HTTP_CAPTURES_OK; step8.assertion.json lacks envelope require_all tokens.",
      "seed_method": "file_artifact",
      "records": [
        ".spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json step 8 literal_cmd: if CAP exists \u2192 ALERT_HTTP_CAPTURES_OK else ALERT_HTTP_CAPTURES_SOFT_OK",
        ".spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/.gate-evidence/20260728T075339Z/step8.assertion.json require_all: D04_01_RED_SUITE_GATE_OK + three post[...] only",
        ".spec/reviews/red-hat-sprint27-20260728T082702Z.md R-1 CRITICAL finding",
        "Final echo always: D04_01_RED_SUITE_GATE_OK ALERT_HTTP_CAPTURES_OK"
      ]
    },
    "s27_induced_jobs_with_cap_receiver": {
      "description": "Independent HTTP receiver wired via ALERT_WEBHOOK_URL; induce kill/credential/config; CAP file receives server-side envelopes with rawBody job names.",
      "seed_method": "cli",
      "records": [
        "ALERT_WEBHOOK_URL=http://127.0.0.1:<port>/alert",
        "backup:induce-failure --mode kill|credential-expired|config-removed",
        "backup:alert-sweep posts real fetch to receiver",
        ".spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/.gate-evidence/<run>/alerts-http-captures.json array of method/url/headers/rawBody/receivedAt"
      ]
    },
    "s27_m1_stub_postBackupAlert_no_fetch": {
      "description": "Mutation M1: postBackupAlert returns ok without fetch; CAP does not grow; fail-closed oracle must fail the gate step.",
      "seed_method": "public_api",
      "records": [
        "services/platform/src/backup/alerting.ts postBackupAlert uses fetch",
        "mutation: return {ok:true,status:200,body:'stub'} before fetch",
        "runBackupAlertSweep still posts.push payload",
        "CAP length unchanged \u2192 step 8 must exit non-zero after fix"
      ]
    },
    "s27_steps_4_6_10_self_report_only": {
      "description": "Steps 4\u20136 assert only sweep stdout post[...]; step 10 SLA script optionally checks CAP. Prefer CAP growth/binding beyond step 8.",
      "seed_method": "file_artifact",
      "records": [
        ".spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json steps 4\u20136 expect_log_regex post[job]",
        "scripts/gate/s27-step10-production-sla.sh CAP check residual",
        "R-1 preferably CAP growth on 4\u20136/10"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "maps_to_ac": null,
      "description": "Fail-closed step 8 CAP envelopes; remove SOFT_OK; require ALERT_HTTP_CAPTURES_OK in require_all_regex (R-1 CRITICAL / T-PLAT-024)",
      "primary": true,
      "flow_ref": "T-PLAT-024",
      "test_tier": "integration"
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "Bind CAP rawBody to induced jobs wal_archive/base_backup/restic_blob_mirror",
      "primary": false,
      "flow_ref": "T-PLAT-024",
      "test_tier": "integration"
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "Mutation M1 stub postBackupAlert without fetch fails CAP oracle",
      "primary": false,
      "flow_ref": "T-PLAT-024",
      "test_tier": "integration"
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "Preferably CAP growth/binding on steps 4\u20136/10",
      "primary": false,
      "flow_ref": "T-PLAT-024",
      "test_tier": "integration"
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "description": "typecheck + lint clean",
      "primary": false,
      "flow_ref": "T-PLAT-024",
      "test_tier": "unit"
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "maps_to_ac": "AC-1",
      "description": "Step 8 literal_cmd has no SOFT_OK",
      "verify": "! jq -r '.steps[]|select(.n==8)|.literal_cmd' .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json | grep -q SOFT_OK"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "maps_to_ac": "AC-1",
      "description": "require_all_regex includes ALERT_HTTP_CAPTURES_OK",
      "verify": "jq -e '.steps[] | select(.n==8) | .assertion.require_all_regex | map(test(\"ALERT_HTTP_CAPTURES_OK\")) | any' .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "maps_to_ac": "AC-1",
      "description": "Missing CAP fails closed",
      "verify": "step 8 cmd requires jq -e on CAP; no SOFT_OK else branch"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "maps_to_ac": "AC-2",
      "description": "CAP rawBody binds induced job names",
      "verify": "jq -e '[.[]|select(.rawBody|test(\"wal_archive|base_backup|restic_blob_mirror\"))]|length>=1' .gate-evidence/*/alerts-http-captures.json"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "maps_to_ac": "AC-3",
      "description": "Negative control names stub postBackupAlert without fetch",
      "verify": "rg -n 'stub postBackupAlert without fetch|mutation M1'"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "maps_to_ac": "AC-2",
      "description": "RED suite passes",
      "verify": "PLATFORM_IT=1 BACKUP_ALERT_OVERDUE_MS=1000 BACKUP_ALERT_TEST_WINDOW_MS=10000 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts \u2192 Exit 0"
    },
    {
      "id": "TC-7",
      "type": "test_criterion",
      "maps_to_ac": "AC-5",
      "description": "Typecheck + lint",
      "verify": "pnpm tsgo --noEmit \u2192 Exit 0; pnpm biome check . \u2192 Exit 0"
    }
  ],
  "proposed_by": "red-test-generator",
  "touches_capabilities": [
    "CAP-BAK-01"
  ]
}
-->

