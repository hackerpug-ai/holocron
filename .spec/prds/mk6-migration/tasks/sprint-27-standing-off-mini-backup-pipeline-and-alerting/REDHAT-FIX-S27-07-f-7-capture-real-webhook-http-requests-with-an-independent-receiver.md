# REDHAT-FIX-S27-07 — [F-7] Capture real webhook HTTP requests with an independent receiver

## What this does

The Human Testing Gate's durable alert evidence is a real independent HTTP capture: each recorded request includes method, url, headers, rawBody, and receivedAt from a live http.Server (either the D04-01 RED suite receiver dual-written by REDHAT-FIX-S27-05, and/or a small gate-side receiver helper under services/platform/tests or tools). Gate oracles assert those HTTP envelope fields — so stubbing postBackupAlert to return {ok:true} without fetch fails. alerts-received.json is either replaced or renamed to a capture schema that cannot be satisfied by serializing sweep.posts[].

## Why

- D04-01 AC-1 mandates a REAL alert sink (local webhook receiver), never a mocked sink.
- Current alerts-received.json is production-free fiction: only BackupAlertPayload fields, written outside src/.
- Mutation M1 (postBackupAlert stubs ok without fetch) leaves posts[] and log oracles green — independent HTTP capture kills M1.

## How to verify

- `PLATFORM_IT=1 BACKUP_ALERT_OVERDUE_MS=1000 BACKUP_ALERT_TEST_WINDOW_MS=10000 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts`
- `pnpm tsgo --noEmit`
- `pnpm biome check .`

## Scope

Writes: (see guardrails)

Prohibited: out-of-scope product paths not listed in WRITE-ALLOWED

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: REDHAT-FIX-S27-07 — [F-7] Capture real webhook HTTP requests with an independent receiver
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M  (90 min)
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
The Human Testing Gate's durable alert evidence is a real independent HTTP capture: each recorded request includes method, url, headers, rawBody, and receivedAt from a live http.Server (either the D04-01 RED suite receiver dual-written by REDHAT-FIX-S27-05, and/or a small gate-side receiver helper under services/platform/tests or tools). Gate oracles assert those HTTP envelope fields — so stubbing postBackupAlert to return {ok:true} without fetch fails. alerts-received.json is either replaced or renamed to a capture schema that cannot be satisfied by serializing sweep.posts[].

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST stand up a real http.Server / createServer receiver as the independent gate observer OR rely on the RED suite receiver already capturing full HTTP (REDHAT-FIX-S27-05 vehicle) and promote those captures to gate evidence
- MUST assert captured POSTs include method, url, headers, rawBody, and receivedAt (schema parity with sprint27-backup-alerting-red.test.ts AlertPost)
- MUST wire ALERT_WEBHOOK_URL to the independent receiver for any gate step that claims webhook delivery
- MUST ensure durable .gate-evidence/<run>/ artifact(s) use the HTTP capture schema — never only sweep posts[]
- MUST kill mutation M1: if postBackupAlert is stubbed to return {ok:true,...} without calling fetch, gate evidence must fail (zero HTTP captures / assertion fail)
- MUST document negative_control naming stub postBackupAlert without fetch
- NEVER treat alerts-received.json payload-only dumps as proof of wire delivery
- NEVER mock fetch globally in a way that fabricates receiver-side captures
- NEVER write the capture file from runBackupAlertSweep.posts serialization alone
- STRICTLY independent observer: capture path is on the receiver side (req.method, req.url, req.headers, body), not the client-side posts[] array
- STRICTLY if a gate-side helper is added, it lives under services/platform/tests/** or tools/** / scripts/** — not production alerting.ts delivery path rewriting that weakens real fetch

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1 (PRIMARY): Gate-durable alert evidence contains ≥1 real HTTP capture with method+url+headers+rawBody+receivedAt for an induced failure path (flow_ref T-PLAT-024)
- [ ] AC-2: alerts-received.json is either removed, renamed, or upgraded so payload-only posts[] cannot pass the gate oracle alone
- [ ] AC-3: negative control / mutation probe documents that stub postBackupAlert without fetch yields zero receiver captures and fails the oracle
- [ ] AC-4: RED suite path (via S27-05) and/or gate receiver helper produces consistent HTTP envelope schema
- [ ] pnpm tsgo --noEmit + pnpm biome check . clean on write_allowed paths

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads)
--------------------------------------------------------------------------------

### AC-1 [PRIMARY] — AC-1 (flow_ref T-PLAT-024)
  GIVEN pre-fix .gate-evidence/.../alerts-received.json has only job_name/reason/failure_reason/... payload fields
  WHEN  gate runs with independent receiver (RED suite via S27-05 and/or gate receiver helper) and induces a failure + alert-sweep
  THEN  captured evidence includes HTTP envelope fields and rawBody JSON that names the failed job
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: backup-alerting
  SCENARIO:
  NEGATIVE_CONTROL: would fail if postBackupAlert is stubbed to return {ok:true,status:200,body:'ok'} without calling fetch — sweep still pushes to posts[] and serializes alerts-received.json identically (mutation M1 survives); gate continues to treat payload-only alerts-received.json as HTTP proof; receiver is a mock/spy object rather than createServer listening on a real TCP port; capture is written by the client from posts[] without reading req on the server; headers/method/url/rawBody/receivedAt fields are synthesized client-side after the fact
  MUST_OBSERVE: real http.Server or createServer listener bound to 127.0.0.1; ALERT_WEBHOOK_URL points at that receiver /alert path; ≥1 capture with method === 'POST' (or PUT); url contains /alert; headers object present (includes content-type); rawBody non-empty JSON string; receivedAt ISO timestamp; parsed body names job + failure_reason/reason
  MUST_NOT_OBSERVE: gate pass with only payload-only posts[] dump; zero TCP listeners while claiming webhook received; stub postBackupAlert without fetch still producing 'captures'
  EVIDENCE: alert_artifact

### AC-2 — AC-2 (flow_ref T-PLAT-024)
  GIVEN historical alerts-received.json was self-reported posts[]
  WHEN  remediation lands
  THEN  gate oracles require HTTP envelope fields (jq -e '.[0].method and .[0].url and .[0].headers and .[0].rawBody and .[0].receivedAt' or equivalent on the capture file). Payload-only files fail the oracle.
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: backup-alerting
  SCENARIO:
  NEGATIVE_CONTROL: would fail if oracle still only greps alerted:\s+[1-9] from sweep stdout; new file is still posts[] rename without envelope fields; oracle accepts either schema via OR-alternation (payload-only still passes)
  MUST_OBSERVE: gate-plan assertion or verify script checks method+url+headers+rawBody+receivedAt; sample capture under .gate-evidence/<run>/ validates with jq envelope check; document rename if alerts-received.json kept: e.g. alerts-http-captures.json
  MUST_NOT_OBSERVE: payload-only schema still passes envelope jq -e; OR-alternation allowing posts[]-only as success
  EVIDENCE: file_artifact

### AC-3 — AC-3 (flow_ref T-PLAT-024)
  GIVEN mutation M1 (stub postBackupAlert to return ok without fetch)
  WHEN  the independent receiver is the oracle
  THEN  zero HTTP captures are observed and the gate/RED step fails — negative_control explicitly names stub postBackupAlert without fetch.
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: backup-alerting
  SCENARIO:
  NEGATIVE_CONTROL: would fail if stub postBackupAlert return {ok:true} without fetch still produces receiver captures (impossible if captures are server-side — proves captures were client-forged); gate only asserts sweep alerted count from posts[] and ignores empty receiver; test doubles replace the receiver with a mock that auto-records on posts.push
  MUST_OBSERVE: documented RED/mutation evidence that M1 yields receiver.posts.length === 0 while sweep may still report alerted>0; oracle prefers receiver length / HTTP captures over sweep.posts.length; negative_control text explicitly includes: stub postBackupAlert without fetch
  MUST_NOT_OBSERVE: M1 still green under the new oracle; client-forged captures after stub
  EVIDENCE: stdout

### AC-4 — AC-4 (flow_ref T-PLAT-024)
  GIVEN REDHAT-FIX-S27-05 dual-writes RED suite captures OR a gate receiver helper is added
  WHEN  comparing schemas
  THEN  both paths share the AlertPost envelope {receivedAt, method, url, headers, rawBody, json?} and gate evidence uses that shape.
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: backup-alerting
  SCENARIO:
  NEGATIVE_CONTROL: would fail if gate helper invents a divergent schema without method/url; RED suite captures are not referenced and gate keeps payload-only file; helper writes capture before listen() so no real TCP path
  MUST_OBSERVE: schema parity with sprint27-backup-alerting-red.test.ts AlertPost type; createServer used (grep) in RED suite and/or new helper; gate evidence path documented in gate-plan or helper README comment
  MUST_NOT_OBSERVE: divergent capture without headers/rawBody; listen never called
  EVIDENCE: file_artifact

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | Durable gate evidence includes HTTP envelope fields on at least one capture | AC-1 | `find .gate-evidence -name '*alert*' -o -name '*capture*' | head; jq -e '..|objects|select(has("method") and has("url") and has("headers") and has("rawBody") and has("receivedAt"))' on the promoted capture file → Exit 0` |
| TC-2 | Payload-only pre-fix alerts-received.json fails the new envelope oracle | AC-2 | `jq -e '.[0].method and .[0].url and .[0].headers and .[0].rawBody and .[0].receivedAt' .spec/.../.gate-evidence/20260728T024819Z/alerts-received.json → Exit 1 (pre-fix); post-fix capture file → Exit 0` |
| TC-3 | Negative control names stub postBackupAlert without fetch; M1 leaves receiver empty | AC-3 | `rg -n 'stub postBackupAlert|without fetch|M1' task evidence or test; optional mutation probe script exits non-zero under independent receiver oracle` |
| TC-4 | createServer receiver exists in RED suite and/or gate helper | AC-4 | `rg -n 'createServer|http\.Server' services/platform/tests/integration/sprint27-backup-alerting-red.test.ts services/platform/tests tools scripts | grep -E 'alert|webhook|receiver'` |
| TC-5 | RED suite still passes (capture vehicle) | AC-1 | `PLATFORM_IT=1 BACKUP_ALERT_OVERDUE_MS=1000 BACKUP_ALERT_TEST_WINDOW_MS=10000 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts → Exit 0` |
| TC-6 | Typecheck + lint clean | AC-1 | `pnpm tsgo --noEmit → Exit 0; pnpm biome check . → Exit 0` |

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
writeProhibited:

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. .spec/reviews/red-hat-sprint27-20260728T054039Z.md (F-7, mutation M1)
2. services/platform/tests/integration/sprint27-backup-alerting-red.test.ts:53-70,129-166
3. services/platform/src/backup/alerting.ts:336-360 (postBackupAlert), ~420-430 (posts.push)
4. .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/.gate-evidence/20260728T024819Z/alerts-received.json
5. .tmp/D04-01/failure-a-wal-kill-alert.json (real HTTP capture contrast)
6. D04-01 task REQUIREMENT-CONTRACT AC-1 real sink requirement

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- jq envelope check on post-fix capture file → Exit 0
- jq envelope check on pre-fix alerts-received.json → Exit 1
- rg -n 'createServer' services/platform/tests/integration/sprint27-backup-alerting-red.test.ts → ≥1
- PLATFORM_IT=1 BACKUP_ALERT_OVERDUE_MS=1000 BACKUP_ALERT_TEST_WINDOW_MS=10000 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts → Exit 0
- pnpm tsgo --noEmit → Exit 0
- pnpm biome check . → Exit 0

--------------------------------------------------------------------------------
DESIGN
--------------------------------------------------------------------------------
References: SPRINT.md, .spec/reviews/red-hat-sprint27-20260728T054039Z.md
Anti-pattern: JSON.stringify(sweep.posts) → alerts-received.json; client-side fabrication of method/url; OR-oracle that accepts payload-only.

--------------------------------------------------------------------------------
VERIFICATION GATES
--------------------------------------------------------------------------------
- Tests: `PLATFORM_IT=1 BACKUP_ALERT_OVERDUE_MS=1000 BACKUP_ALERT_TEST_WINDOW_MS=10000 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts` → Exit 0
- Typecheck: `pnpm tsgo --noEmit` → Exit 0
- Lint: `pnpm biome check .` → Exit 0

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------
- Implementer: red-test-generator
- Reviewer: test-quality-reviewer
- Rationale: Assigned red-test-generator per SPRINT.md remediation ownership.
- Proposed by: red-test-generator

--------------------------------------------------------------------------------
CAPABILITY CHAIN
--------------------------------------------------------------------------------
- touches_capabilities: [CAP-BAK-01]

--------------------------------------------------------------------------------
CODING STANDARDS
--------------------------------------------------------------------------------
- RULES.md
- services/platform conventions

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
- depends_on: ['REDHAT-FIX-S27-05', 'D04-01', 'D04-05']
- blocks: ['Sprint 27 red-hat verdict lift (F-7 blocking)']

--------------------------------------------------------------------------------
NOTES
--------------------------------------------------------------------------------
- Source finding: red-hat-sprint27-20260728T054039Z.md (REDHAT-FIX-S27-07)
- CAP-BAK-01 remediation — gate honesty + production-truth.

</details>

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-S27-07",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "s27_independent_http_receiver": {
      "description": "Real local webhook sink on loopback; ALERT_WEBHOOK_URL points at it; backup heartbeats can be induced failed/overdue",
      "seed_method": "cli",
      "records": [
        "http.Server listening 127.0.0.1:<port>/alert",
        "ALERT_WEBHOOK_URL=http://127.0.0.1:<port>/alert",
        "induce failure + holo backup:alert-sweep OR RED suite itLive cases",
        "capture array receives server-side POST records"
      ]
    },
    "s27_alerts_received_schema_upgrade": {
      "description": "Pre-fix payload-only alerts-received.json vs post-fix HTTP capture artifact",
      "seed_method": "file_artifact",
      "records": [
        ".gate-evidence/20260728T024819Z/alerts-received.json (payload-only \u2014 RED baseline)",
        "post-fix .gate-evidence/<run>/alerts-http-captures.json or red-suite/failure-*-alert.json with envelope",
        "gate-plan oracle or verify script requiring envelope fields"
      ]
    },
    "s27_m1_stub_postBackupAlert_no_fetch": {
      "description": "Mutation M1: postBackupAlert returns ok without fetch; independent receiver stays empty",
      "seed_method": "public_api",
      "records": [
        "services/platform/src/backup/alerting.ts postBackupAlert ~336-360 uses fetch",
        "mutation: return {ok:true,status:200,body:'stub'} before fetch",
        "runBackupAlertSweep still posts.push(payload) at ~424",
        "receiver.posts.length remains 0 \u2014 oracle must fail"
      ]
    },
    "s27_http_capture_schema_parity": {
      "description": "AlertPost schema from RED suite is the canonical capture shape",
      "seed_method": "file_artifact",
      "records": [
        "sprint27-backup-alerting-red.test.ts AlertPost type: receivedAt, method, url, headers, rawBody, json",
        "receiver push at lines 145-152",
        "optional gate helper reuses same shape"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "description": "GIVEN CAP-BAK-01 alerting claims a webhook fired WHEN the Human Testing Gate records alert evidence THEN the durable artifact is an independent HTTP capture from a real http.Server with method, url, headers, rawBody, and receivedAt \u2014 proving a POST crossed the wire (T-PLAT-024).",
      "verify": "",
      "primary": true,
      "flow_ref": "T-PLAT-024",
      "scenario": {
        "start_ref": "s27_independent_http_receiver",
        "evidence": "alert_artifact",
        "negative_control": {
          "would_fail_if": [
            "postBackupAlert is stubbed to return {ok:true,status:200,body:'ok'} without calling fetch \u2014 sweep still pushes to posts[] and serializes alerts-received.json identically (mutation M1 survives)",
            "gate continues to treat payload-only alerts-received.json as HTTP proof",
            "receiver is a mock/spy object rather than createServer listening on a real TCP port",
            "capture is written by the client from posts[] without reading req on the server",
            "headers/method/url/rawBody/receivedAt fields are synthesized client-side after the fact"
          ]
        },
        "must_observe": [
          "real http.Server or createServer listener bound to 127.0.0.1",
          "ALERT_WEBHOOK_URL points at that receiver /alert path",
          "\u22651 capture with method === 'POST' (or PUT)",
          "url contains /alert",
          "headers object present (includes content-type)",
          "rawBody non-empty JSON string",
          "receivedAt ISO timestamp",
          "parsed body names job + failure_reason/reason"
        ],
        "must_not_observe": [
          "gate pass with only payload-only posts[] dump",
          "zero TCP listeners while claiming webhook received",
          "stub postBackupAlert without fetch still producing 'captures'"
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN historical alerts-received.json was self-reported posts[] WHEN remediation lands THEN gate oracles require HTTP envelope fields (jq -e '.[0].method and .[0].url and .[0].headers and .[0].rawBody and .[0].receivedAt' or equivalent on the capture file). Payload-only files fail the oracle.",
      "verify": "",
      "primary": false,
      "flow_ref": "T-PLAT-024",
      "scenario": {
        "start_ref": "s27_alerts_received_schema_upgrade",
        "evidence": "file_artifact",
        "negative_control": {
          "would_fail_if": [
            "oracle still only greps alerted:\\s+[1-9] from sweep stdout",
            "new file is still posts[] rename without envelope fields",
            "oracle accepts either schema via OR-alternation (payload-only still passes)"
          ]
        },
        "must_observe": [
          "gate-plan assertion or verify script checks method+url+headers+rawBody+receivedAt",
          "sample capture under .gate-evidence/<run>/ validates with jq envelope check",
          "document rename if alerts-received.json kept: e.g. alerts-http-captures.json"
        ],
        "must_not_observe": [
          "payload-only schema still passes envelope jq -e",
          "OR-alternation allowing posts[]-only as success"
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN mutation M1 (stub postBackupAlert to return ok without fetch) WHEN the independent receiver is the oracle THEN zero HTTP captures are observed and the gate/RED step fails \u2014 negative_control explicitly names stub postBackupAlert without fetch.",
      "verify": "",
      "primary": false,
      "flow_ref": "T-PLAT-024",
      "scenario": {
        "start_ref": "s27_m1_stub_postBackupAlert_no_fetch",
        "evidence": "stdout",
        "negative_control": {
          "would_fail_if": [
            "stub postBackupAlert return {ok:true} without fetch still produces receiver captures (impossible if captures are server-side \u2014 proves captures were client-forged)",
            "gate only asserts sweep alerted count from posts[] and ignores empty receiver",
            "test doubles replace the receiver with a mock that auto-records on posts.push"
          ]
        },
        "must_observe": [
          "documented RED/mutation evidence that M1 yields receiver.posts.length === 0 while sweep may still report alerted>0",
          "oracle prefers receiver length / HTTP captures over sweep.posts.length",
          "negative_control text explicitly includes: stub postBackupAlert without fetch"
        ],
        "must_not_observe": [
          "M1 still green under the new oracle",
          "client-forged captures after stub"
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "GIVEN REDHAT-FIX-S27-05 dual-writes RED suite captures OR a gate receiver helper is added WHEN comparing schemas THEN both paths share the AlertPost envelope {receivedAt, method, url, headers, rawBody, json?} and gate evidence uses that shape.",
      "verify": "",
      "primary": false,
      "flow_ref": "T-PLAT-024",
      "scenario": {
        "start_ref": "s27_http_capture_schema_parity",
        "evidence": "file_artifact",
        "negative_control": {
          "would_fail_if": [
            "gate helper invents a divergent schema without method/url",
            "RED suite captures are not referenced and gate keeps payload-only file",
            "helper writes capture before listen() so no real TCP path"
          ]
        },
        "must_observe": [
          "schema parity with sprint27-backup-alerting-red.test.ts AlertPost type",
          "createServer used (grep) in RED suite and/or new helper",
          "gate evidence path documented in gate-plan or helper README comment"
        ],
        "must_not_observe": [
          "divergent capture without headers/rawBody",
          "listen never called"
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Durable gate evidence includes HTTP envelope fields on at least one capture",
      "verify": "find .gate-evidence -name '*alert*' -o -name '*capture*' | head; jq -e '..|objects|select(has(\"method\") and has(\"url\") and has(\"headers\") and has(\"rawBody\") and has(\"receivedAt\"))' on the promoted capture file \u2192 Exit 0",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Payload-only pre-fix alerts-received.json fails the new envelope oracle",
      "verify": "jq -e '.[0].method and .[0].url and .[0].headers and .[0].rawBody and .[0].receivedAt' .spec/.../.gate-evidence/20260728T024819Z/alerts-received.json \u2192 Exit 1 (pre-fix); post-fix capture file \u2192 Exit 0",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Negative control names stub postBackupAlert without fetch; M1 leaves receiver empty",
      "verify": "rg -n 'stub postBackupAlert|without fetch|M1' task evidence or test; optional mutation probe script exits non-zero under independent receiver oracle",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "createServer receiver exists in RED suite and/or gate helper",
      "verify": "rg -n 'createServer|http\\.Server' services/platform/tests/integration/sprint27-backup-alerting-red.test.ts services/platform/tests tools scripts | grep -E 'alert|webhook|receiver'",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "RED suite still passes (capture vehicle)",
      "verify": "PLATFORM_IT=1 BACKUP_ALERT_OVERDUE_MS=1000 BACKUP_ALERT_TEST_WINDOW_MS=10000 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts \u2192 Exit 0",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "Typecheck + lint clean",
      "verify": "pnpm tsgo --noEmit \u2192 Exit 0; pnpm biome check . \u2192 Exit 0",
      "maps_to_ac": "AC-1"
    }
  ]
}
-->
