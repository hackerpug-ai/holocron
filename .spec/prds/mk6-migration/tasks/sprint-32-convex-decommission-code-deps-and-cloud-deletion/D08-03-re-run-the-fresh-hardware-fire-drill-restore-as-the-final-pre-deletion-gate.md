# D08-03 — Re-run the fresh-hardware fire-drill restore as the final pre-deletion gate

> **Task ID:** D08-03
> **Sprint:** [Sprint 32 — Convex Decommission — Code, Deps and Cloud Deletion](./SPRINT.md)
> **Agent:** `devops-engineer`
> **Reviewer:** `security-reviewer`
> **Estimate:** 90 min
> **Type:** INFRA
> **Priority:** P0 · **Effort:** M
> **Proposed By:** `devops-engineer`
> **TDD_MODE:** `skipped` · **RED_GREEN_REQUIRED:** no
> **Verification policy:** tests=false · red=false · seeded=true
> Status: Done

**Capabilities:** CAP-CUT-01 · CAP-BAK-01
**PRD refs:** UC-SYNC-05 · T-SYNC-018 · CAP-CUT-01 · CAP-BAK-01

## Operator outcome

Run the real Sprint 28 fresh-target restore after the Postgres point of no return. Use the distinct R2_RESTORE_ACCESS_KEY_ID and R2_RESTORE_SECRET_ACCESS_KEY tuple, a new isolated target, the immutable recovery baseline, and real Postgres/blob/app/MCP verification. This task never deletes Convex.

Success state: deletion-gate.json is schema-valid, all checks pass with concrete SHA-256 evidence, deletion_eligible=true, and convex_deletion_performed=false.

## Scope and guardrails

WRITE-ALLOWED: scripts/run-s32-d08-03-deletion-gate.sh, scripts/assert-s32-d08-03-deletion-gate.sh, services/platform/tests/integration/sprint32-d08-03-deletion-gate.test.ts, the D08-03 evidence directory, and .tmp/REDHAT-FIX-S32-D08-03/$GATE_RUN_ID/**.

WRITE-PROHIBITED: Convex/cloud deletion; source mini PGDATA/blob roots; writer R2 credentials; placeholders, mocks, recorders, synthetic parity; secrets in logs/artifacts; product source or package changes.

## Exact verification

    set -euo pipefail; set -a; source .env; set +a; export HOLO_SECRETS_PATH="$HOLO_SECRETS_PATH"; /bin/bash scripts/assert-gate-run-id.sh; REQUIRE_LIVE_R2_RO=1 /bin/bash scripts/prove-r2-readonly.sh; HOST="$(/bin/bash scripts/derive-s28-fresh-host.sh)"; REQUIRE_LIVE_R2_RO=1 /bin/bash scripts/provision-fresh-restore-target.sh --host "$HOST"; REQUIRE_LIVE_R2_RO=1 /bin/bash scripts/run-fire-drill-on-fresh-target.sh --host "$HOST" --target-timestamp "$PITR_TIMESTAMP" --attestation ".tmp/REDHAT-FIX-S32-D08-03/$GATE_RUN_ID/attestation.json" --report ".tmp/REDHAT-FIX-S32-D08-03/$GATE_RUN_ID/parity-report.json"; /bin/bash scripts/assert-fire-drill-report.sh ".tmp/REDHAT-FIX-S32-D08-03/$GATE_RUN_ID/parity-report.json"
    PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint32-d08-03-deletion-gate.test.ts
    pnpm tsgo --noEmit

<details>
<summary>Full agent specification</summary>

TASK: D08-03 — Re-run the fresh-hardware fire-drill restore as the final pre-deletion gate
TASK_TYPE: INFRA
STATUS: Done
PRIORITY: P0
EFFORT: M (90 min)
AGENT: devops-engineer
REVIEWER: security-reviewer
PROPOSED-BY: devops-engineer
TDD_MODE: skipped
RED_GREEN_REQUIRED: no
CAPABILITY: CAP-CUT-01, CAP-BAK-01

## Outcome

Restore Postgres and blobs on fresh hardware from the immutable R2 baseline; prove post-PONR rows, FK integrity, ledger SHA-256, blob hashes, and representative React Native/Zero and MCP journeys; emit one secret-free machine gate. No Convex deletion is permitted.

## Critical constraints

- MUST use the distinct restore tuple, REQUIRE_LIVE_R2_RO=1, new named volumes, and the existing Sprint 28 scripts.
- MUST prove data_plane_ponr, post_export_write_audit, domain rows, FK edges/orphans, row parity, 64-hex ledger SHA-256, and non-zero blob matches.
- MUST run .maestro/reactive/run-cross-surface-sync-slo.sh with SKIP_SEED=1 and the Sprint 31 real MCP HTTP/stdio integration against restored Postgres.
- MUST fail closed on missing, stale, malformed, empty, contradictory, or secret-bearing evidence.
- NEVER delete, deactivate, or mutate Convex/cloud state.

## Acceptance criteria

- [x] AC-1 [PRIMARY] Fresh isolated restore: GIVEN a new GATE_RUN_ID, PITR_TIMESTAMP, immutable baseline, and distinct tuple, WHEN the R2 proof, fresh-target provisioner, and volume-bound fire drill run, THEN the restore exits 0 and emits valid attestation/parity evidence. TEST_TIER=e2e; VERIFICATION_SERVICE=R2+pgBackRest+restic+Postgres+fresh-target; FLOW_REF=T-SYNC-018. **PASS** — attestation `holo.fresh-target.fire-drill-attestation.v1` ok=true host `s28r3-gate-s32d0803-20260812T170510Z`; parity POSTGRES/BLOB pass matched_objects=11; gate_run `s32d0803-20260812T175411Z` (AC-1 bound/resumed from 170510Z live target).

- [x] AC-2 Post-PONR integrity: GIVEN AC-1 evidence, WHEN FK, SQL, and parity checks run, THEN PONR/write/domain rows, FK integrity, ledger SHA-256, row parity, and blob parity pass with non-zero values. TEST_TIER=e2e; VERIFICATION_SERVICE=Postgres+FK+baseline+blob-parity; FLOW_REF=T-SYNC-018. **PASS** — real `etl:fk-audit` on restored DB: edgeCount=80 orphans=0 unenforcedEdges=0; ponr=1 post_export=2 domain=88; ledger 64-hex; not `enforced_postgres_fk_sql`.

- [x] AC-3 Real app/MCP journeys: GIVEN restored platform, Zero, app, HTTP MCP, and stdio MCP surfaces, WHEN the cross-surface flow and Sprint 31 MCP integration run without reset/reseed, THEN real non-empty payload/event evidence is observed. TEST_TIER=e2e; VERIFICATION_SERVICE=Postgres+Zero+Maestro+HTTP-MCP+stdio-MCP; FLOW_REF=T-SYNC-018. **PASS** — maestro_mode=required maestro_exit_code=0 (full cross-surface COMPLETED + p95); HTTP MCP `tools/call` update_document http=200 title read-back; stdio MCP integration exit 0.

- [x] AC-4 Machine gate: GIVEN AC-1 through AC-3 evidence, WHEN the artifact is validated, THEN all checks pass, evidence is hash-bound, deletion_eligible=true, and convex_deletion_performed=false. TEST_TIER=integration; VERIFICATION_SERVICE=jq+evidence-manifest+operator-gate; FLOW_REF=T-SYNC-018. **PASS** — `deletion-gate.json` schema v1 status=pass deletion_eligible=true convex_deletion_performed=false; 12 manifest digests recompute OK; secret_scan_hits=0; no soft-pass markers; assert script PASS.

## Scope

Write only the listed orchestration/evidence consumer/test files and run-scoped evidence. Do not modify restore, backup, app, MCP, Zero, schema, or package implementation.

## Reading list

1. .spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/gate-plan.json
2. .spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/HUMAN-GATE.md
3. scripts/run-fire-drill-on-fresh-target.sh
4. services/platform/src/backup/parity-report.ts
5. .maestro/reactive/run-cross-surface-sync-slo.sh

## Evidence gates

- Fresh target: attestation schema holo.fresh-target.fire-drill-attestation.v1, ok=true, fresh volume/path identity.
- Restore: POSTGRES_PARITY_PASS=true, LEDGER_CHECKSUM_MATCH=true, BLOB_PARITY_PASS=true.
- SQL/FK: ponr_rows=1, post_export_rows>=1, domain_rows>=1, edgeCount>0, orphans=0, unenforcedEdges=0.
- Journeys: Maestro and MCP integration exit 0 with non-empty payload/event evidence.
- Artifact: all-pass schema, evidence manifest, 64-hex digests, no deletion receipt.

## Design and anti-pattern

Pattern: prove credentials/isolation -> restore on named fresh volumes -> consume concrete parity/FK/SQL/journey evidence -> emit one fail-closed artifact.

Anti-pattern: source-mini baseline, empty/fake restore, summary-only parity, skipped app/MCP path, or any deletion side effect.

Source references: Sprint 28 gate-plan.json and HUMAN-GATE.md; scripts/run-fire-drill-on-fresh-target.sh; services/platform/src/backup/parity-report.ts; .maestro/reactive/run-cross-surface-sync-slo.sh; and services/platform/tests/integration/sprint31-legacy-mcp-repoint.test.ts.

## Dependencies

Depends on D08-01, D08-02, Sprint 28 restore evidence, Sprint 30 PONR evidence, and Sprint 31 readiness. Blocks D08-04 and D08-05.

## Test criteria

- TC-1 maps to AC-1: the distinct restore tuple, R2 read-only proof, fresh host, named target, attestation, and parity report all come from the real Sprint 28 scripts and exit successfully.
- TC-2 maps to AC-2: the report, FK audit, PONR/write/domain queries, ledger SHA-256, row parity, and blob parity contain non-zero, all-pass observations.
- TC-3 maps to AC-3: the cross-surface flow runs with SKIP_SEED=1 and the real Sprint 31 HTTP/stdio MCP integration returns non-empty evidence.
- TC-4 maps to AC-4: the machine artifact is schema-valid, hash-bound, all-pass, deletion_eligible=true, and convex_deletion_performed=false.

## Agent rationale and pairing

devops-engineer owns the restore orchestration, target isolation, evidence binding, and operator gate because the work crosses R2, backup/restore, Postgres, and deployment boundaries. security-reviewer pairs on credential separation, secret-safe artifacts, fail-closed checks, and the prohibition on deletion.

## Agent instructions

1. Read the Sprint 28 scripts and schemas before changing any orchestration or evidence consumer.
2. Load the operator environment explicitly; use only R2_RESTORE_ACCESS_KEY_ID and R2_RESTORE_SECRET_ACCESS_KEY for the live read-only restore path, and never print values.
3. Generate a new GATE_RUN_ID and fresh target identity; retain the exact script stdout/stderr paths and SHA-256 manifest.
4. Run every AC command against real services. Do not reset, reseed, mock, or replace app/MCP journeys with fixtures.
5. Stop on the first failed, missing, stale, contradictory, empty, or secret-bearing observation. Do not emit a pass artifact after a failure.
6. Do not delete or deactivate Convex, mutate the source restore, or hand D08-05 an artifact with convex_deletion_performed=true.

## Orchestrator verification protocol

The orchestrator must execute the following per-AC commands in order, with the same GATE_RUN_ID and evidence directory. A command that exits non-zero is a failed gate and blocks all later gates.

AC-1:

    set -euo pipefail; /bin/bash scripts/assert-gate-run-id.sh; REQUIRE_LIVE_R2_RO=1 /bin/bash scripts/prove-r2-readonly.sh; HOST="$(/bin/bash scripts/derive-s28-fresh-host.sh)"; REQUIRE_LIVE_R2_RO=1 /bin/bash scripts/provision-fresh-restore-target.sh --host "$HOST"; REQUIRE_LIVE_R2_RO=1 /bin/bash scripts/run-fire-drill-on-fresh-target.sh --host "$HOST" --target-timestamp "$PITR_TIMESTAMP" --attestation ".tmp/REDHAT-FIX-S32-D08-03/$GATE_RUN_ID/attestation.json" --report ".tmp/REDHAT-FIX-S32-D08-03/$GATE_RUN_ID/parity-report.json"; /bin/bash scripts/assert-fire-drill-report.sh ".tmp/REDHAT-FIX-S32-D08-03/$GATE_RUN_ID/parity-report.json"

AC-2:

    set -euo pipefail; EVID=".tmp/REDHAT-FIX-S32-D08-03/$GATE_RUN_ID"; /bin/bash scripts/assert-fire-drill-report.sh "$EVID/parity-report.json"; DATABASE_URL="$RESTORED_DATABASE_URL" bun services/platform/src/cli/holo.ts etl:fk-audit --json --export "$CONVEX_EXPORT_DIR" --catalog "$CATALOG_PATH" >"$EVID/fk-audit.json"; /usr/bin/jq -e '.ok == true and .edgeCount > 0 and .orphans == 0 and (.unenforcedEdges|length)==0' "$EVID/fk-audit.json"; /usr/bin/psql "$RESTORED_DATABASE_URL" -XAtc "SELECT count(*) FROM data_plane_ponr"

AC-3:

    set -euo pipefail; EVID=".tmp/REDHAT-FIX-S32-D08-03/$GATE_RUN_ID"; SKIP_SEED=1 DATABASE_URL="$RESTORED_DATABASE_URL" PLATFORM_URL="$RESTORED_PLATFORM_URL" EVIDENCE_DIR="$EVID/cross-surface" /bin/bash .maestro/reactive/run-cross-surface-sync-slo.sh; PLATFORM_IT=1 DATABASE_URL="$RESTORED_DATABASE_URL" pnpm vitest run --project integration services/platform/tests/integration/sprint31-legacy-mcp-repoint.test.ts -t 'AC-4 legacy package serves Postgres over stdio with no Convex references'

AC-4:

    set -euo pipefail; ART=".spec/prds/mk6-migration/tasks/sprint-32-convex-decommission-code-deps-and-cloud-deletion/evidence/D08-03/deletion-gate.json"; test -s "$ART"; /usr/bin/jq -e '.schema == "holo.decommission.deletion-gate.v1" and .status == "pass" and .deletion_eligible == true and .convex_deletion_performed == false and ([.checks[]|.status]|all(. == "pass")) and (.evidence_manifest|length > 0)' "$ART"; test ! -e ".tmp/REDHAT-FIX-S32-D08-03/$GATE_RUN_ID/convex-deletion-receipt.json"

## Coding standards and source paths

Follow the repository's task and evidence contracts in /Users/inference1/Projects/brain/docs/kanban/TASK-TEMPLATE.md, REQUIREMENT-CONTRACT-V1.md, SCENARIO-CONTRACT-V1.md, REQUIREMENT-TRACKING.md, CAPABILITY-CHAIN-PLANNING.md, TESTING-HIERARCHY.md, and RED-FIRST-TEST-GATE.md. Use the credential names and secret-safe handling rules in AGENTS.md. Preserve the existing shell style and command paths in scripts/assert-gate-run-id.sh, scripts/prove-r2-readonly.sh, scripts/provision-fresh-restore-target.sh, scripts/run-fire-drill-on-fresh-target.sh, scripts/assert-fire-drill-report.sh, .maestro/reactive/run-cross-surface-sync-slo.sh, and services/platform/tests/integration/sprint31-legacy-mcp-repoint.test.ts.

## Review criteria

The reviewer must confirm exact fixed metadata, all four GWT ACs and one-to-one TCs, visible/e2e or integration tier labels, resolvable fixtures, concrete positive and negative observations, distinct restore credentials, fresh-target isolation, real React Native/Zero and HTTP/stdio MCP evidence, hash-bound machine output, no secret values, and no deletion side effect. Review must reject any invented command, mock journey, source-volume restore, writer credential use, or pass artifact with missing evidence.

## Out of scope and notes

Out of scope: deleting Convex; editing D08-01, D08-02, D08-04, or D08-05; changing source backup data; rotating credentials; modifying application, MCP, Zero, schema, or package code; and claiming provider deletion from restore success. The D08-03 artifact is eligibility evidence only and must be handed to D08-04/D08-05 without mutation.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version":"1",
  "task_id":"D08-03",
  "proposed_by":"devops-engineer",
  "tdd_mode":"skipped",
  "verification_policy":{"requires_tests":false,"requires_red_evidence":false,"requires_seeded_evidence":true},
  "fixtures":{
    "r2":{"description":"Fresh isolated target with distinct restore tuple and real R2 proof.","seed_method":"recorded_external","records":["GATE_RUN_ID target","R2_RESTORE tuple distinct","attestation schema holo.fresh-target.fire-drill-attestation.v1","R2 read-only proof"]},
    "integrity":{"description":"Baseline-bound restored Postgres and blobs.","seed_method":"recorded_external","records":["PONR rows","FK edge set","64-hex ledger","non-zero blobs"]},
    "journeys":{"description":"Real restored platform, app, Zero, HTTP MCP, and stdio MCP.","seed_method":"recorded_external","records":["RESTORED_DATABASE_URL","Zero keepalive","MCP gateway","non-empty payload"]},
    "evidence":{"description":"Complete secret-free D08-03 evidence bundle.","seed_method":"recorded_external","records":["attestation","parity","FK","PONR","journey","manifest"]}
  },
  "requirements":[
    {
      "id":"AC-1","type":"acceptance_criterion","primary":true,
      "description":"Fresh isolated restore uses the distinct R2 tuple and real baseline-bound fire-drill path.",
      "verify":"set -euo pipefail; /bin/bash scripts/assert-gate-run-id.sh; REQUIRE_LIVE_R2_RO=1 /bin/bash scripts/prove-r2-readonly.sh; HOST=\"$(/bin/bash scripts/derive-s28-fresh-host.sh)\"; REQUIRE_LIVE_R2_RO=1 /bin/bash scripts/provision-fresh-restore-target.sh --host \"$HOST\"; REQUIRE_LIVE_R2_RO=1 /bin/bash scripts/run-fire-drill-on-fresh-target.sh --host \"$HOST\" --target-timestamp \"$PITR_TIMESTAMP\" --attestation \".tmp/REDHAT-FIX-S32-D08-03/$GATE_RUN_ID/attestation.json\" --report \".tmp/REDHAT-FIX-S32-D08-03/$GATE_RUN_ID/parity-report.json\"; /bin/bash scripts/assert-fire-drill-report.sh \".tmp/REDHAT-FIX-S32-D08-03/$GATE_RUN_ID/parity-report.json\"",
      "maps_to_ac":null,
      "scenario":{
        "id":"AC-1","tier":"visible","test_tier":"e2e","topology":"multi-node","verification_service":"R2+pgBackRest+restic+Postgres+fresh-target","flow_ref":"T-SYNC-018","start_ref":"r2",
        "action":{"actor":"operator","steps":["prove R2 read-only tuple","provision fresh target","run volume-bound fire-drill"]},
        "evidence":{"artifact_type":"file_artifact","required_capture":true,"paths":["evidence/AC-1.json"]},
        "negative_control":{"would_fail_if":["restore is stubbed","writer credential fallback occurs","isolation is skipped","fake or empty volumes are used"]},
        "cases":[{"start_ref":"r2","action":{"actor":"operator","steps":["prove R2 read-only tuple","provision fresh target","run volume-bound fire-drill"]},"end_state":{"must_observe":["restore_exit_code=0","attestation_schema='holo.fresh-target.fire-drill-attestation.v1'","POSTGRES_PARITY_PASS='true'","matched_objects>=1"],"must_not_observe":["restore_exit_code=1","empty parity report","placeholder credential","source mini mount"]}}]
      }
    },
    {
      "id":"AC-2","type":"acceptance_criterion","primary":false,
      "description":"Restored post-PONR rows, FK edges, ledger SHA-256, and blob parity pass.",
      "verify":"set -euo pipefail; EVID=\".tmp/REDHAT-FIX-S32-D08-03/$GATE_RUN_ID\"; /bin/bash scripts/assert-fire-drill-report.sh \"$EVID/parity-report.json\"; DATABASE_URL=\"$RESTORED_DATABASE_URL\" bun services/platform/src/cli/holo.ts etl:fk-audit --json --export \"$CONVEX_EXPORT_DIR\" --catalog \"$CATALOG_PATH\" >\"$EVID/fk-audit.json\"; /usr/bin/jq -e '.ok == true and .edgeCount > 0 and .orphans == 0 and (.unenforcedEdges|length)==0' \"$EVID/fk-audit.json\"; /usr/bin/psql \"$RESTORED_DATABASE_URL\" -XAtc \"SELECT count(*) FROM data_plane_ponr\"",
      "maps_to_ac":null,
      "scenario":{
        "id":"AC-2","tier":"visible","test_tier":"e2e","topology":"multi-node","verification_service":"Postgres+FK+baseline+blob-parity","flow_ref":"T-SYNC-018","start_ref":"integrity",
        "action":{"actor":"operator","steps":["assert parity","run etl:fk-audit","query PONR/write/domain tables","compare ledger/blob hashes"]},
        "evidence":{"artifact_type":"file_artifact","required_capture":true,"paths":["evidence/AC-2.json"]},
        "negative_control":{"would_fail_if":["empty FK edge set is accepted","parity is skipped","MD5-only digest is used","PONR rows are omitted"]},
        "cases":[{"start_ref":"integrity","action":{"actor":"operator","steps":["assert parity","run etl:fk-audit","query PONR/write/domain tables","compare ledger/blob hashes"]},"end_state":{"must_observe":["ponr_rows=1","post_export_rows>=1","edgeCount>0","orphans=0","ledger_sha256 is 64-hex","matched_objects>=1"],"must_not_observe":["ponr_rows=0","post_export_rows=0","edgeCount=0","orphans>0","empty ledger","matched_objects=0"]}}]
      }
    },
    {
      "id":"AC-3","type":"acceptance_criterion","primary":false,
      "description":"Real app, Zero, HTTP MCP, and stdio MCP journeys pass against restored services.",
      "verify":"set -euo pipefail; EVID=\".tmp/REDHAT-FIX-S32-D08-03/$GATE_RUN_ID\"; SKIP_SEED=1 DATABASE_URL=\"$RESTORED_DATABASE_URL\" PLATFORM_URL=\"$RESTORED_PLATFORM_URL\" EVIDENCE_DIR=\"$EVID/cross-surface\" /bin/bash .maestro/reactive/run-cross-surface-sync-slo.sh; PLATFORM_IT=1 DATABASE_URL=\"$RESTORED_DATABASE_URL\" pnpm vitest run --project integration services/platform/tests/integration/sprint31-legacy-mcp-repoint.test.ts -t 'AC-4 legacy package serves Postgres over stdio with no Convex references'",
      "maps_to_ac":null,
      "scenario":{
        "id":"AC-3","tier":"visible","test_tier":"e2e","topology":"multi-node","verification_service":"Postgres+Zero+Maestro+HTTP-MCP+stdio-MCP","flow_ref":"T-SYNC-018","start_ref":"journeys",
        "action":{"actor":"operator","steps":["run cross-surface flow with SKIP_SEED=1","run real Sprint 31 MCP integration"]},
        "evidence":{"artifact_type":"file_artifact","required_capture":true,"paths":["evidence/AC-3.json"]},
        "negative_control":{"would_fail_if":["restore is reset/reseeded","MCP transport is mocked","source mini URL is used","journey succeeds without payload"]},
        "cases":[{"start_ref":"journeys","action":{"actor":"operator","steps":["run cross-surface flow with SKIP_SEED=1","run real Sprint 31 MCP integration"]},"end_state":{"must_observe":["Maestro_exit_code=0","MCP_test_exit_code=0","Zero_event_count>=1","documents_payload_count>=1"],"must_not_observe":["Maestro_exit_code=1","MCP_test_exit_code=1","empty payload","mock MCP"]}}]
      }
    },
    {
      "id":"AC-4","type":"acceptance_criterion","primary":false,
      "description":"Machine artifact is fail-closed, hash-bound, and records no Convex deletion.",
      "verify":"set -euo pipefail; ART=\".spec/prds/mk6-migration/tasks/sprint-32-convex-decommission-code-deps-and-cloud-deletion/evidence/D08-03/deletion-gate.json\"; test -s \"$ART\"; /usr/bin/jq -e '.schema == \"holo.decommission.deletion-gate.v1\" and .status == \"pass\" and .deletion_eligible == true and .convex_deletion_performed == false and ([.checks[]|.status]|all(. == \"pass\")) and (.evidence_manifest|length > 0)' \"$ART\"; test ! -e \".tmp/REDHAT-FIX-S32-D08-03/$GATE_RUN_ID/convex-deletion-receipt.json\"",
      "maps_to_ac":null,
      "scenario":{
        "id":"AC-4","tier":"visible","test_tier":"integration","topology":"multi-node","verification_service":"jq+evidence-manifest+operator-gate","flow_ref":"T-SYNC-018","start_ref":"evidence",
        "action":{"actor":"operator","steps":["validate gate JSON","recompute SHA-256 manifest","check no deletion receipt"]},
        "evidence":{"artifact_type":"file_artifact","required_capture":true,"paths":["evidence/AC-4.json"]},
        "negative_control":{"would_fail_if":["prose artifact is accepted","failed journey is marked pass","missing digest is ignored","empty or static artifact passes","deletion receipt is emitted"]},
        "cases":[{"start_ref":"evidence","action":{"actor":"operator","steps":["validate gate JSON","recompute SHA-256 manifest","check no deletion receipt"]},"end_state":{"must_observe":["schema='holo.decommission.deletion-gate.v1'","status='pass'","deletion_eligible='true'","convex_deletion_performed='false'","manifest_count>=1"],"must_not_observe":["status='fail'","deletion_eligible='false'","empty evidence manifest","missing digest","raw secret","receipt_count=1"]}}]
      }
    },
    {"id":"TC-1","type":"test_criterion","description":"Fresh restore and parity use distinct credentials and a new isolated target.","verify":"set -euo pipefail; /bin/bash scripts/assert-gate-run-id.sh; REQUIRE_LIVE_R2_RO=1 /bin/bash scripts/prove-r2-readonly.sh; HOST=\"$(/bin/bash scripts/derive-s28-fresh-host.sh)\"; REQUIRE_LIVE_R2_RO=1 /bin/bash scripts/provision-fresh-restore-target.sh --host \"$HOST\"; REQUIRE_LIVE_R2_RO=1 /bin/bash scripts/run-fire-drill-on-fresh-target.sh --host \"$HOST\" --target-timestamp \"$PITR_TIMESTAMP\" --attestation \".tmp/REDHAT-FIX-S32-D08-03/$GATE_RUN_ID/attestation.json\" --report \".tmp/REDHAT-FIX-S32-D08-03/$GATE_RUN_ID/parity-report.json\"; /bin/bash scripts/assert-fire-drill-report.sh \".tmp/REDHAT-FIX-S32-D08-03/$GATE_RUN_ID/parity-report.json\"","maps_to_ac":"AC-1"},
    {"id":"TC-2","type":"test_criterion","description":"Rows, FK, ledger, and blob parity pass on the restored target.","verify":"set -euo pipefail; EVID=\".tmp/REDHAT-FIX-S32-D08-03/$GATE_RUN_ID\"; /bin/bash scripts/assert-fire-drill-report.sh \"$EVID/parity-report.json\"; DATABASE_URL=\"$RESTORED_DATABASE_URL\" bun services/platform/src/cli/holo.ts etl:fk-audit --json --export \"$CONVEX_EXPORT_DIR\" --catalog \"$CATALOG_PATH\" >\"$EVID/fk-audit.json\"; /usr/bin/jq -e '.ok == true and .edgeCount > 0 and .orphans == 0 and (.unenforcedEdges|length)==0' \"$EVID/fk-audit.json\"; /usr/bin/psql \"$RESTORED_DATABASE_URL\" -XAtc \"SELECT count(*) FROM data_plane_ponr\"","maps_to_ac":"AC-2"},
    {"id":"TC-3","type":"test_criterion","description":"Real app and MCP journeys pass against restored services.","verify":"set -euo pipefail; EVID=\".tmp/REDHAT-FIX-S32-D08-03/$GATE_RUN_ID\"; SKIP_SEED=1 DATABASE_URL=\"$RESTORED_DATABASE_URL\" PLATFORM_URL=\"$RESTORED_PLATFORM_URL\" EVIDENCE_DIR=\"$EVID/cross-surface\" /bin/bash .maestro/reactive/run-cross-surface-sync-slo.sh; PLATFORM_IT=1 DATABASE_URL=\"$RESTORED_DATABASE_URL\" pnpm vitest run --project integration services/platform/tests/integration/sprint31-legacy-mcp-repoint.test.ts -t 'AC-4 legacy package serves Postgres over stdio with no Convex references'","maps_to_ac":"AC-3"},
    {"id":"TC-4","type":"test_criterion","description":"Deletion-gate artifact is pass, hash-bound, and records no deletion.","verify":"set -euo pipefail; ART=\".spec/prds/mk6-migration/tasks/sprint-32-convex-decommission-code-deps-and-cloud-deletion/evidence/D08-03/deletion-gate.json\"; test -s \"$ART\"; /usr/bin/jq -e '.schema == \"holo.decommission.deletion-gate.v1\" and .status == \"pass\" and .deletion_eligible == true and .convex_deletion_performed == false and (.evidence_manifest|length > 0)' \"$ART\"","maps_to_ac":"AC-4"}
  ]
}
-->
</details>
