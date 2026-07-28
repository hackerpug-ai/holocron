# REDHAT-FIX-S27-13 — [F-15] Enable or honestly gate Langfuse backup span export

## What this does

Make backup span export status honest: either real Langfuse export succeeds, or local-only mode is explicit with exportOk=false and no silent fiction.

## Why

- Remediate red-hat finding for CAP-BAK-01 (REDHAT-FIX-S27-13).
- Grounded in UC-PLAT-06 / T-PLAT-024 / CAP-BAK-01.

## How to verify

- `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-span-export.test.ts` → Exit 0; disabled mode asserts exportOk false
- `rg -n "const exportOk = true" services/platform/src/backup/span.ts ; test $? -eq 1` → rg exit 1 (no match)
- `pnpm tsgo --noEmit` → Exit 0
- `pnpm biome check .` → Exit 0

## Scope

Writes: services/platform/src/backup/span.ts (MODIFY), services/platform/src/observability/langfuse-exporter.ts (MODIFY only if status honesty requires it), services/platform/tests/integration/sprint27-backup-span-export.test.ts (NEW), .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/D04-03-configure-continuous-wal-archiving-and-scheduled-base-backups.md (MODIFY AC-3 honesty only), .tmp/redhat-fix-s27-13/** (NEW evidence)

Prohibited: services/platform/src/backup/alerting.ts — not this finding, services/platform/src/backup/wal-archive.ts — beyond wiring exportOk honesty, mocking @mastra/* or Langfuse HTTP in green tests, secrets committed into repo

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: REDHAT-FIX-S27-13 — [F-15] Enable or honestly gate Langfuse backup span export
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M  (90 min)
AGENT:      implementer=mastra-implementer | reviewer=code-reviewer
PROPOSED-BY: mastra-planner
TDD_MODE:   red_first     RED_GREEN_REQUIRED: yes     (requires_seeded_evidence: True)
CAPABILITY: CAP-BAK-01
SPRINT:     [Sprint 27 — Standing Off-Mini Backup Pipeline and Alerting](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm vitest run <path>
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
emitBackupSpan returns exportOk consistent with exportError; unconfigured env produces local span + trace_id without claiming Langfuse success; configured env can export with exportError=null; RED suite proves both modes.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST stop hardcoding exportOk=true in emitBackupSpan when Langfuse is disabled or flush fails (span.ts currently sets const exportOk = true while exportError is set)
- MUST either (Path A) configure real LANGFUSE_PUBLIC_KEY/SECRET_KEY/BASE_URL for gate/dev so exportError is null on success, OR (Path B) honestly document D04-03 AC-3 as local span jsonl + trace_id on heartbeat when exporter disabled
- MUST keep heartbeat upsert independent of Langfuse transport failure (export soft-fail must not block last_success_at after R2 confirm)
- MUST record local span evidence (jsonl) with exportOk boolean consistent with exportError (exportOk===false iff exportError non-null for disabled/failed paths)
- MUST add RED→GREEN integration coverage proving honesty of export fields under both configured and unconfigured env
- NEVER claim OTel/Langfuse export success while exportError reads 'Langfuse exporter disabled'
- NEVER stub HolocronLangfuseExporter.exportTracingEvent to fake success
- NEVER require live Langfuse credentials for local CI if Path B honesty gate is chosen — but then AC text and exportOk must match that choice
- NEVER delete local span logging as a shortcut to hide exportError
- STRICTLY emitBackupSpan always returns a hex traceId written to heartbeat regardless of export path
- STRICTLY when LANGFUSE_* present, exercise real export path (no mock transport) in the configured-mode test
- STRICTLY update D04-03 task text / CAP-BAK-01 notes if AC-3 is downgraded so gate claims stop lying

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: exportOk false when Langfuse disabled (PRIMARY)
- [ ] AC-2: Configured Langfuse path can export without exportError
- [ ] AC-3: Heartbeat/trace_id path independent of export failure
- [ ] AC-4: Honest D04-03 AC-3 claim text
- [ ] `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads)
--------------------------------------------------------------------------------

### AC-1 [PRIMARY] — exportOk false when Langfuse disabled (PRIMARY) (flow_ref T-PLAT-021)
  GIVEN LANGFUSE_PUBLIC_KEY/SECRET_KEY/BASE_URL unset (or incomplete) so createLangfuseExporterFromEnv is disabled
  WHEN  emitBackupSpan is called for backup:wal_archive with real attributes
  THEN  Returned span has exportOk===false, exportError non-null describing disabled/missing config, traceId hex length>=16, and local jsonl line written; no claim of successful Langfuse export
  TEST_TIER: integration · TDD_STATE: red
  VERIFICATION_SERVICE: backup-span+filesystem
  VERIFY: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-span-export.test.ts -t "disabled"`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if exportOk remains hardcoded true; exportError null while disabled; traceId missing; exporter mocked to always succeed
  START_REF: langfuse_unconfigured
  MUST_OBSERVE: exportOk === false; exportError matches /disabled|not configured|missing/i; traceId hex length >= 16; jsonl record contains same exportOk false
  MUST_NOT_OBSERVE: exportOk === true with exportError set; exportError null under disabled env; empty traceId
  EVIDENCE: file_artifact (required_capture=True)

### AC-2 — Configured Langfuse path can export without exportError (flow_ref T-PLAT-021)
  GIVEN Real LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_BASE_URL (or LANGFUSE_HOST) pointing at a reachable Langfuse (self-hosted or cloud test project)
  WHEN  emitBackupSpan runs and flush completes
  THEN  exportOk===true and exportError===null OR test is explicitly skipped with documented env requirement — never green with fake exporter
  TEST_TIER: integration · TDD_STATE: red
  VERIFICATION_SERVICE: Langfuse
  VERIFY: `PLATFORM_IT=1 LANGFUSE_PUBLIC_KEY=... LANGFUSE_SECRET_KEY=... LANGFUSE_BASE_URL=... pnpm vitest run services/platform/tests/integration/sprint27-backup-span-export.test.ts -t "configured"`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if test asserts exportOk true without credentials; mock transport used; exportError still disabled with valid config
  START_REF: langfuse_configured
  MUST_OBSERVE: exportOk === true; exportError === null; traceId hex length >= 16
  MUST_NOT_OBSERVE: exportError Langfuse exporter disabled; mocked success without HTTP to Langfuse
  EVIDENCE: api_response (required_capture=True)

### AC-3 — Heartbeat/trace_id path independent of export failure (flow_ref T-PLAT-021)
  GIVEN Langfuse disabled and a successful R2-confirmed backup job path (or unit of emit+upsert integration)
  WHEN  Job records span then upserts backup_heartbeat.trace_id
  THEN  Heartbeat row receives the same trace_id even though exportOk is false
  TEST_TIER: integration · TDD_STATE: red
  VERIFICATION_SERVICE: Postgres+backup-span
  VERIFY: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-span-export.test.ts -t "heartbeat"`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if export failure blocks heartbeat write; trace_id left null on success path; fake heartbeat without real upsert
  START_REF: langfuse_unconfigured
  MUST_OBSERVE: backup_heartbeat.trace_id equals span.traceId; exportOk false does not clear trace_id
  MUST_NOT_OBSERVE: trace_id null after success upsert; exception aborting heartbeat solely due to Langfuse disabled
  EVIDENCE: db_query (required_capture=True)

### AC-4 — Honest D04-03 AC-3 claim text (flow_ref T-PLAT-021)
  GIVEN Chosen path A (Langfuse required for full OTel claim) or path B (local span + trace_id)
  WHEN  Reviewer reads D04-03 / CAP notes and gate language for AC-3
  THEN  Documentation matches implementation: either gate requires Langfuse config for export claim, or AC-3 is rewritten to local span + trace_id without 'emitted via langfuse-exporter' when disabled
  TEST_TIER: integration · TDD_STATE: red
  VERIFICATION_SERVICE: docs+source
  VERIFY: `rg -n "langfuse-exporter|local span|exportOk|exportError" .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/D04-03-configure-continuous-wal-archiving-and-scheduled-base-backups.md services/platform/src/backup/span.ts`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if docs still claim always-on Langfuse export; code still hardcodes exportOk true
  START_REF: honest_ac3_contract
  MUST_OBSERVE: exportOk assigned from real exporter status not const true; AC-3 text admits local-only mode OR requires Langfuse config for export claim
  MUST_NOT_OBSERVE: const exportOk = true; AC-3 unconditional 'emitted via langfuse-exporter' with disabled exporter accepted as pass
  EVIDENCE: file_artifact (required_capture=True)

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | exportOk is false when Langfuse credentials are absent | AC-1 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-span-export.test.ts -t "disabled"` |
| TC-2 | exportError is non-null when Langfuse is disabled | AC-1 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-span-export.test.ts -t "disabled"` |
| TC-3 | exportOk is true and exportError is null when real Langfuse config is present | AC-2 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-span-export.test.ts -t "configured"` |
| TC-4 | backup_heartbeat.trace_id equals emitBackupSpan.traceId when export is disabled | AC-3 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-span-export.test.ts -t "heartbeat"` |
| TC-5 | span.ts no longer hardcodes exportOk = true | AC-4 | `rg -n "const exportOk = true" services/platform/src/backup/span.ts ; test $? -eq 1` |

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/src/backup/span.ts (MODIFY)
- services/platform/src/observability/langfuse-exporter.ts (MODIFY only if status honesty requires it)
- services/platform/tests/integration/sprint27-backup-span-export.test.ts (NEW)
- .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/D04-03-configure-continuous-wal-archiving-and-scheduled-base-backups.md (MODIFY AC-3 honesty only)
- .tmp/redhat-fix-s27-13/** (NEW evidence)
writeProhibited:
- services/platform/src/backup/alerting.ts — not this finding
- services/platform/src/backup/wal-archive.ts — beyond wiring exportOk honesty
- mocking @mastra/* or Langfuse HTTP in green tests
- secrets committed into repo

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. .spec/reviews/red-hat-sprint27-20260728T054039Z.md:125-129 — F-15 Langfuse disabled / exportError fiction
2. services/platform/src/backup/span.ts:131-225 — emitBackupSpan — exportOk hardcode + exportError handling
3. services/platform/src/observability/langfuse-exporter.ts:338-461 — disabled flush path + createLangfuseExporterFromEnv
4. .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/D04-03-configure-continuous-wal-archiving-and-scheduled-base-backups.md:79-110 — AC-3 OTel via langfuse-exporter claim to honest-gate

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- `PLATFORM_IT=1 pnpm vitest run <path>` exit 0

--------------------------------------------------------------------------------
DESIGN
--------------------------------------------------------------------------------
References: F-15, D04-03 AC-3, HolocronLangfuseExporter
Interaction notes:
- Path A: set Langfuse env in gate/operator secrets for real export
- Path B: local jsonl + heartbeat.trace_id is the certified surface when exporter disabled
Pattern: let exportOk = false; ... after flush: exportOk = status.ok && !status.errorMessage; exportError = status.errorMessage
Pattern source: services/platform/src/backup/span.ts + langfuse-exporter getStatus()
Anti-pattern: const exportOk = true while every jsonl line shows exportError Langfuse exporter disabled

--------------------------------------------------------------------------------
VERIFICATION GATES
--------------------------------------------------------------------------------
- RED/GREEN span honesty suite: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-span-export.test.ts` → Exit 0; disabled mode asserts exportOk false
- No hardcoded exportOk true: `rg -n "const exportOk = true" services/platform/src/backup/span.ts ; test $? -eq 1` → rg exit 1 (no match)
- Typecheck: `pnpm tsgo --noEmit` → Exit 0
- Lint: `pnpm biome check .` → Exit 0

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------
- Implementer: mastra-implementer
- Reviewer: code-reviewer
- Rationale: Owns backup span emission and HolocronLangfuseExporter boundary; must end the exportOk=true + exportError fiction.
- Proposed by: mastra-planner

--------------------------------------------------------------------------------
CAPABILITY CHAIN
--------------------------------------------------------------------------------
- touches_capabilities: [CAP-BAK-01]
- provides: ['honest-backup-span-export-status', 'local-span-plus-trace_id-fallback-contract']
- consumes: ['holocron-langfuse-exporter', 'backup-emitBackupSpan']
- boundary_contracts: ['when-langfuse-configured-exportError-null-and-exportOk-true', 'when-langfuse-disabled-exportOk-false-and-local-span-trace_id-still-written']

--------------------------------------------------------------------------------
CODING STANDARDS
--------------------------------------------------------------------------------
- RULES.md
- services/platform/src/observability/langfuse-exporter.ts

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
- depends_on: ['REDHAT-FIX-S27-12']
- blocks: []

--------------------------------------------------------------------------------
NOTES
--------------------------------------------------------------------------------
- Finding F-15 HIGH — either enable Langfuse for real export or honest local-only AC
- Handoff: dispatch mastra-implementer; reviewer = mastra-reviewer

</details>

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-S27-13",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "langfuse_unconfigured": {
      "description": "Process env without LANGFUSE_PUBLIC_KEY/SECRET_KEY/BASE_URL",
      "seed_method": "cli",
      "records": [
        "unset LANGFUSE_PUBLIC_KEY LANGFUSE_SECRET_KEY LANGFUSE_BASE_URL LANGFUSE_HOST",
        "emitBackupSpan uses createLangfuseExporterFromEnv disabled path"
      ]
    },
    "langfuse_configured": {
      "description": "Real Langfuse credentials in env for optional GREEN path",
      "seed_method": "cli",
      "records": [
        "LANGFUSE_PUBLIC_KEY set",
        "LANGFUSE_SECRET_KEY set",
        "LANGFUSE_BASE_URL or LANGFUSE_HOST set to reachable host"
      ]
    },
    "honest_ac3_contract": {
      "description": "D04-03 AC-3 text + span.ts after honesty fix",
      "seed_method": "public_api",
      "records": [
        "AC-3 wording matches Path A or Path B",
        "exportOk derived from exporter status"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "description": "GIVEN Langfuse unconfigured WHEN emitBackupSpan runs THEN exportOk=false, exportError non-null, hex traceId present, local jsonl written",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-span-export.test.ts -t \"disabled\"",
      "primary": true,
      "flow_ref": "T-PLAT-021",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "backup-span+filesystem",
        "topology": "single-node",
        "flow_ref": "T-PLAT-021",
        "negative_control": {
          "would_fail_if": [
            "exportOk hardcoded true",
            "exportError null while disabled",
            "mocked exporter"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "langfuse_unconfigured",
            "action": {
              "actor": "system",
              "steps": [
                "clear env",
                "emitBackupSpan",
                "assert export fields"
              ]
            },
            "end_state": {
              "must_observe": [
                "exportOk false",
                "exportError non-null",
                "traceId hex len>=16"
              ],
              "must_not_observe": [
                "exportOk true with exportError set",
                "empty traceId"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN real Langfuse config WHEN emitBackupSpan flushes THEN exportOk true and exportError null (or skip with documented requirement \u2014 never fake)",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-span-export.test.ts -t \"configured\"",
      "primary": false,
      "flow_ref": "T-PLAT-021",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "Langfuse",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "fake transport",
            "green without credentials"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "langfuse_configured",
            "action": {
              "actor": "system",
              "steps": [
                "set env",
                "emitBackupSpan",
                "assert exportOk"
              ]
            },
            "end_state": {
              "must_observe": [
                "exportOk true",
                "exportError null"
              ],
              "must_not_observe": [
                "exportError disabled with valid config"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN export disabled WHEN heartbeat upsert uses span.traceId THEN DB trace_id matches and is non-null",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-span-export.test.ts -t \"heartbeat\"",
      "primary": false,
      "flow_ref": "T-PLAT-021",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "Postgres+backup-span",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "export failure blocks heartbeat",
            "trace_id null"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "langfuse_unconfigured",
            "action": {
              "actor": "system",
              "steps": [
                "emit span",
                "upsert heartbeat",
                "SELECT trace_id"
              ]
            },
            "end_state": {
              "must_observe": [
                "trace_id equals span.traceId"
              ],
              "must_not_observe": [
                "trace_id null"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "GIVEN honesty fix WHEN reading D04-03 AC-3 and span.ts THEN claims match Path A or Path B and exportOk is not const true",
      "verify": "rg -n \"const exportOk = true\" services/platform/src/backup/span.ts ; test $? -eq 1",
      "primary": false,
      "flow_ref": "T-PLAT-021",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "docs+source",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "docs still overclaim Langfuse",
            "hardcoded exportOk true"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "honest_ac3_contract",
            "action": {
              "actor": "reviewer",
              "steps": [
                "read AC-3",
                "grep exportOk"
              ]
            },
            "end_state": {
              "must_observe": [
                "honest AC-3 wording",
                "no const exportOk = true"
              ],
              "must_not_observe": [
                "unconditional langfuse-exporter success claim with disabled exporter"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "exportOk is false when Langfuse credentials are absent",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-span-export.test.ts -t \"disabled\"",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "exportError is non-null when Langfuse is disabled",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-span-export.test.ts -t \"disabled\"",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "exportOk is true and exportError is null when real Langfuse config is present",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-span-export.test.ts -t \"configured\"",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "backup_heartbeat.trace_id equals emitBackupSpan.traceId when export is disabled",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-span-export.test.ts -t \"heartbeat\"",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "span.ts no longer hardcodes exportOk = true",
      "verify": "rg -n \"const exportOk = true\" services/platform/src/backup/span.ts ; test $? -eq 1",
      "maps_to_ac": "AC-4"
    }
  ]
}
-->
