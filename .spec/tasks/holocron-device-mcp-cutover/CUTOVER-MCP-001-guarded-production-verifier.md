# CUTOVER-MCP-001: Guarded production MCP verifier with ordered resume and cleanup ledger

> Status: Backlog
> Assignee: mcp-implementer
> Reviewer: mcp-reviewer
> Priority: P0
> Type: feature
> Proposed By: mcp-planner
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes
> Depends on: CUTOVER-PLAT-002
> Files: services/platform/src/cutover/soak-fence.ts, services/platform/src/cutover/mcp-production-verifier.ts, services/platform/src/cutover/mcp-verification-ledger.ts, services/platform/src/cli/holo.ts, services/platform/src/db/schema/cutover.ts, services/platform/src/db/schema/index.ts, services/platform/src/db/migrations/0039_mcp_verification_ledger.sql, services/platform/tests/integration/cutover-mcp-production-verifier.test.ts

## Outcome

The existing verifier exercises the frozen 44-tool surface against the real production service,
including enabled mutations, while enforcing exact host/release/rollback gates, manifest-ordered
stop/retry/resume, independently verified effects, and identifier-scoped zero-residue cleanup.

## Constraints

- Keep all frozen tool names and schemas byte-compatible.
- Add `--tool <id>`, `--run-id <id>`, and explicit `--production-write` CLI behavior.
- Production-write mode requires the expected tailnet origin, exact deployed SHA and image,
  Postgres health identity, bearer credential, enabled writes, a fresh rollback checkpoint, and a
  unique `mcp-e2e-<run-id>` namespace before the first `tools/call`.
- Consume the compatibility manifest in order and stop at the first failure. A resume cannot skip
  the failed ordinal and requires a linked green retry receipt.
- Record created rows, objects, and dependent jobs before continuing. Prove effects independently
  through Postgres/blob/queue or real external-service evidence.
- Cleanup only recorded identifiers in scoped transactions. Any residual row, active job, object,
  or cleanup error blocks success.
- Never print credentials or connection URLs, weaken a correct oracle, or use MCP self-report as
  its own persistence oracle.

## Acceptance Criteria

- [ ] AC-1: Production-write mode exits before `tools/call` unless host, SHA/image, Postgres health, enabled-write state, bearer credential, and fresh rollback checkpoint all agree.
- [ ] AC-2: The manifest-ordered sweep stops on the first failed tool, rejects ordinal skipping, retries that tool and family, and resumes only after a linked green repair receipt.
- [ ] AC-3: Every mutation is namespaced and ledgered, and its response is proven through an independent Postgres/blob/queue or external-service read.
- [ ] AC-4: Cleanup removes only ledger-recorded identifiers, preserves unrelated controls, reaches zero rows/jobs/objects, and leaves production writes enabled.

## Test Criteria

| ID | Statement | Maps | Verify |
|---|---|---|---|
| TC-1 | A wrong host, SHA, image, plane, credential, write state, or checkpoint prevents the first production tool call. | AC-1 | `PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/cutover-mcp-production-verifier.test.ts -t 'AC-1'` |
| TC-2 | A real failure stops the ordered sweep and cannot be skipped. | AC-2 | `PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/cutover-mcp-production-verifier.test.ts -t 'AC-2'` |
| TC-3 | Mutation results equal independent durable-state observations. | AC-3 | `PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/cutover-mcp-production-verifier.test.ts -t 'AC-3'` |
| TC-4 | Ledgered cleanup reaches zero residue without deleting an unrelated control row. | AC-4 | `PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/cutover-mcp-production-verifier.test.ts -t 'AC-4'` |

## Verification gates

- `pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error services/platform/src/cutover/soak-fence.ts services/platform/src/cutover/mcp-production-verifier.ts services/platform/src/cutover/mcp-verification-ledger.ts services/platform/src/cli/holo.ts services/platform/tests/integration/cutover-mcp-production-verifier.test.ts`
- `pnpm tsc --noEmit`
- `pnpm test`
- `PLATFORM_IT=1 bun services/platform/src/cli/holo.ts cutover:verify-tools --production-write --run-id <fresh-id> --base-url https://holocron.tail011a51.ts.net:44111 --json`

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "CUTOVER-MCP-001",
  "tdd_mode": "red_first",
  "verification_policy": {"requires_tests": true, "requires_red_evidence": true, "requires_seeded_evidence": true},
  "fixtures": {
    "production_identity": {"description": "Fresh external health, release, database and rollback identities", "seed_method": "recorded_external", "records": ["expected tailnet origin", "deployed SHA and image digest", "fresh rollback checkpoint"]},
    "mcp_run": {"description": "Unique absent production namespace", "seed_method": "public_api", "records": ["mcp-e2e-<run-id>", "unrelated control row"]}
  },
  "requirements": [
    {
      "id": "AC-1", "type": "acceptance_criterion", "primary": true,
      "description": "Production writes start only after every target, provenance, auth, write-state, and rollback guard agrees.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/cutover-mcp-production-verifier.test.ts -t 'AC-1'",
      "scenario": {"id": "CUTOVER-MCP-001/AC-1", "tier": "visible", "test_tier": "e2e", "verification_service": "deployed Holocron health release Postgres and MCP", "negative_control": {"would_fail_if": ["host validation is removed", "caller text substitutes for deployed identity", "missing credentials are accepted"]}, "evidence": {"artifact_type": "file_artifact", "required_capture": true}, "cases": [{"start_ref": "production_identity", "action": {"actor": "cli_user", "steps": ["run with one mismatched identity", "run with all independently observed gates matching"]}, "end_state": {"must_observe": ["mismatch `exit_code != 0` with `tools_call_count:0`", "matching receipt contains `origin`, `sourceRevision`, `imageDigest`, `databaseFingerprint`, and `checkpointId`"], "must_not_observe": ["empty or missing guard accepted", "production mutation before all gates pass", "credential bytes in evidence"]}}]}
    },
    {
      "id": "AC-2", "type": "acceptance_criterion", "primary": false,
      "description": "Manifest order, first-failure stop, linked retry, and resume ordinal are durable and fail closed.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/cutover-mcp-production-verifier.test.ts -t 'AC-2'",
      "scenario": {"id": "CUTOVER-MCP-001/AC-2", "tier": "visible", "test_tier": "integration", "verification_service": "real MCP server and Postgres ledger", "negative_control": {"would_fail_if": ["the stop gate is a no-op", "resume trusts a caller ordinal", "manifest order is removed"]}, "evidence": {"artifact_type": "db_query", "required_capture": true}, "cases": [{"start_ref": "mcp_run", "action": {"actor": "cli_user", "steps": ["cause a real non-first tool failure", "attempt to skip", "repair and retry the failed family", "resume"]}, "end_state": {"must_observe": ["`green_prefix_count == failed_ordinal - 1`", "skip attempt has `exit_code != 0`", "retry row has nonempty `failure_attempt_id`", "`resume_ordinal == failed_ordinal + 1`"], "must_not_observe": ["empty failure checkpoint", "later ordinal called before repair", "parallel calls with `in_flight_count > 1`"]}}]}
    },
    {
      "id": "AC-3", "type": "acceptance_criterion", "primary": false,
      "description": "Every namespaced mutation is ledgered and independently proven in its real durable dependency.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/cutover-mcp-production-verifier.test.ts -t 'AC-3'",
      "scenario": {"id": "CUTOVER-MCP-001/AC-3", "tier": "visible", "test_tier": "e2e", "verification_service": "production MCP Postgres blob queue and external services", "negative_control": {"would_fail_if": ["tool output is its own oracle", "a mutation is a no-op", "dependent verification is removed"]}, "evidence": {"artifact_type": "db_query", "required_capture": true}, "cases": [{"start_ref": "mcp_run", "action": {"actor": "api_client", "steps": ["invoke each mutation with run-scoped inputs", "read rows objects jobs and external effects independently"]}, "end_state": {"must_observe": ["`attempt_ledger_count == mutation_call_count`", "each successful mutation has `created_id_count >= 1` or an explicit reversible state-change record", "`independent_oracle_match:true` for every successful mutation"], "must_not_observe": ["empty created-identifier ledger", "unnamespaced state", "isError credited as success"]}}]}
    },
    {
      "id": "AC-4", "type": "acceptance_criterion", "primary": false,
      "description": "Identifier-scoped cleanup reaches zero residue while preserving unrelated state and enabled writes.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/cutover-mcp-production-verifier.test.ts -t 'AC-4'",
      "scenario": {"id": "CUTOVER-MCP-001/AC-4", "tier": "visible", "test_tier": "e2e", "verification_service": "production Postgres queue and blob storage", "negative_control": {"would_fail_if": ["cleanup scans a broad prefix", "jobs are not awaited", "residue queries are omitted"]}, "evidence": {"artifact_type": "db_query", "required_capture": true}, "cases": [{"start_ref": "mcp_run", "action": {"actor": "cli_user", "steps": ["run ledgered cleanup", "query every affected store and the unrelated control"]}, "end_state": {"must_observe": ["`residue_count:0`", "`active_job_count:0` and `blob_residue_count:0`", "`unrelated_control_count:1`", "`migration_read_only:false`"], "must_not_observe": ["nonempty cleanup-error list", "table-wide deletion", "write fence enabled"]}}]}
    }
  ]
}
-->
