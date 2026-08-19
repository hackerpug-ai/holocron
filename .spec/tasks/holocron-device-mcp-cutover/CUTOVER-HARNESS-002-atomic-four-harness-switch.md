# CUTOVER-HARNESS-002: Atomic four-harness remote MCP switch and live mutation smoke

> Status: Backlog
> Assignee: mcp-implementer
> Reviewer: mcp-reviewer
> Priority: P0
> Type: config
> Proposed By: mcp-planner
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes
> Depends on: CUTOVER-HARNESS-001, S33-MCP-03
> Files: scripts/configure-holocron-mcp-harnesses.ts, scripts/verify-holocron-mcp-harnesses.ts, services/platform/tests/integration/four-harness-mcp-cutover.test.ts, ~/.codex/config.toml, ~/.claude.json, ~/.config/opencode/opencode.json, ~/.grok/config.toml

## Outcome

Codex, Claude, OpenCode, and Grok atomically replace their local Holocron stdio registrations with
the authenticated remote Streamable HTTP endpoint, prove the frozen 44-tool production surface and
a reversible namespaced subscription mutation independently, and leave production writes enabled.

## Target configuration

- Codex: URL `https://holocron.tail011a51.ts.net:44111/mcp`, bearer token env var `HOLO_KEY_MCP`.
- Claude: HTTP transport with header `Authorization: Bearer ${HOLO_KEY_MCP}`.
- OpenCode: remote transport with header `Authorization: Bearer {env:HOLO_KEY_MCP}`.
- Grok: explicit user-scoped HTTP entry with header `Authorization: Bearer ${HOLO_KEY_MCP}`.

## Constraints

- Require a fresh successful `S33-MCP-03`/`CUTOVER-MCP-001` receipt before editing any harness.
- Parse all four configs, make mode-0600 recoverable backups, stage all edits, validate them, and
  restore all four original bytes if any edit or smoke fails.
- Never place a literal credential value in any config, backup manifest, output, or command line.
- Effective-config and process-tree verification must prove no local SQLite MCP command or child.
- Each harness must independently discover 44 tools, read a real retained document, add and remove
  its own namespaced subscription, and finish with zero related row/job residue.

## Acceptance Criteria

- [ ] AC-1: Any staged write or validation failure restores all four original configs byte-for-byte; success commits four remote entries with secret-free backups.
- [ ] AC-2: Effective configuration and process-tree checks show exactly one remote Holocron entry per harness and no local SQLite MCP child.
- [ ] AC-3: Each harness independently discovers the identical frozen 44 tools and reads a retained document matching production Postgres.
- [ ] AC-4: Each harness creates and reverses a unique subscription; Postgres/queue evidence proves the effects and zero residue while writes remain enabled.

## Test Criteria

| ID | Statement | Maps | Verify |
|---|---|---|---|
| TC-1 | A forced target-write failure restores all four config files byte-identically. | AC-1 | `PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/four-harness-mcp-cutover.test.ts -t 'AC-1'` |
| TC-2 | Harness-effective configs and the process tree contain no Holocron stdio path or child. | AC-2 | `PLATFORM_IT=1 bun scripts/verify-holocron-mcp-harnesses.ts --configuration --process-tree --json` |
| TC-3 | All four harnesses discover 44 tools and read the same retained Postgres document. | AC-3 | `PLATFORM_IT=1 bun scripts/verify-holocron-mcp-harnesses.ts --all --discover --sentinel-read --json` |
| TC-4 | Four causal subscription writes are reversed with zero final residue and writes enabled. | AC-4 | `PLATFORM_IT=1 bun scripts/verify-holocron-mcp-harnesses.ts --all --subscription-smoke --assert-zero-residue --assert-writes-enabled --json` |

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "CUTOVER-HARNESS-002",
  "tdd_mode": "red_first",
  "verification_policy": {"requires_tests": true, "requires_red_evidence": true, "requires_seeded_evidence": true},
  "fixtures": {
    "harness_configs": {"description": "Four real backed-up local MCP configurations and fresh server receipt", "seed_method": "recorded_external", "records": ["Codex", "Claude", "OpenCode", "Grok", "final zero-residue receipt"]},
    "migrated_document": {"description": "Retained migrated document discovered through list_documents", "seed_method": "recorded_external", "records": ["document id", "Postgres title and content hash"]},
    "harness_namespaces": {"description": "Four absent harness-specific namespaces", "seed_method": "public_api", "records": ["mcp-e2e-harness-<run-id>-codex", "mcp-e2e-harness-<run-id>-claude", "mcp-e2e-harness-<run-id>-opencode", "mcp-e2e-harness-<run-id>-grok"]}
  },
  "requirements": [
    {
      "id": "AC-1", "type": "acceptance_criterion", "primary": true,
      "description": "Four config edits are staged and validated as one recoverable unit with secret-free backups.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/four-harness-mcp-cutover.test.ts -t 'AC-1'",
      "scenario": {"id": "CUTOVER-HARNESS-002/AC-1", "tier": "visible", "test_tier": "integration", "verification_service": "real Codex Claude OpenCode and Grok config files", "negative_control": {"would_fail_if": ["rollback is a no-op", "an empty receipt is accepted", "backup restoration is removed"]}, "evidence": {"artifact_type": "file_artifact", "required_capture": true}, "cases": [{"start_ref": "harness_configs", "action": {"actor": "cli_user", "steps": ["stage all remote entries", "force one target write failure", "rerun without failure"]}, "end_state": {"must_observe": ["`restored_file_count:4` and each SHA-256 equals its pre-edit hash", "`remote_entry_count:4` after success", "`backup_hash_count:4` and every backup mode is `0600`"], "must_not_observe": ["empty backup manifest", "mixed local and remote state", "literal bearer values"]}}]}
    },
    {
      "id": "AC-2", "type": "acceptance_criterion", "primary": false,
      "description": "Effective configs and process trees prove one remote entry per harness and no local SQLite MCP child.",
      "verify": "PLATFORM_IT=1 bun scripts/verify-holocron-mcp-harnesses.ts --configuration --process-tree --json",
      "scenario": {"id": "CUTOVER-HARNESS-002/AC-2", "tier": "visible", "test_tier": "e2e", "verification_service": "real harness CLIs and operating-system process table", "negative_control": {"would_fail_if": ["effective-config verification is a no-op", "a local stdio child is not removed"]}, "evidence": {"artifact_type": "stdout", "required_capture": true}, "cases": [{"start_ref": "harness_configs", "action": {"actor": "cli_user", "steps": ["query each harness effective configuration", "launch clean harness processes", "inspect descendants and network targets"]}, "end_state": {"must_observe": ["`effective_remote_url_count:4` and every URL equals `https://holocron.tail011a51.ts.net:44111/mcp`", "`remote_connection_count:4`"], "must_not_observe": ["`local_mcp_child_count > 0`", "empty effective URL", "duplicate Holocron entry"]}}]}
    },
    {
      "id": "AC-3", "type": "acceptance_criterion", "primary": false,
      "description": "Each harness discovers 44 identical tools and reads retained content independently matched to Postgres.",
      "verify": "PLATFORM_IT=1 bun scripts/verify-holocron-mcp-harnesses.ts --all --discover --sentinel-read --json",
      "scenario": {"id": "CUTOVER-HARNESS-002/AC-3", "tier": "visible", "test_tier": "e2e", "verification_service": "four real harness clients production MCP and Postgres", "negative_control": {"would_fail_if": ["tool surface is a static stub", "a harness is disconnected", "MCP output is its own oracle"]}, "evidence": {"artifact_type": "db_query", "required_capture": true}, "cases": [{"start_ref": "migrated_document", "action": {"actor": "cli_user", "steps": ["launch each harness from a clean shell", "discover tools", "call list_documents and get_document", "query Postgres independently"]}, "end_state": {"must_observe": ["each harness has `tool_count:44` with the same manifest hash", "every response has `content_byte_length > 0` and `content_sha256 == postgres_content_sha256`", "each receipt origin is `https://holocron.tail011a51.ts.net:44111` and has a 64-hex `imageDigest`"], "must_not_observe": ["empty catalog", "`local_server_process_count > 0`", "fixture-only document"]}}]}
    },
    {
      "id": "AC-4", "type": "acceptance_criterion", "primary": false,
      "description": "Each harness creates and removes one subscription with causal Postgres proof, zero residue, and writes still enabled.",
      "verify": "PLATFORM_IT=1 bun scripts/verify-holocron-mcp-harnesses.ts --all --subscription-smoke --assert-zero-residue --assert-writes-enabled --json",
      "scenario": {"id": "CUTOVER-HARNESS-002/AC-4", "tier": "visible", "test_tier": "e2e", "verification_service": "four real harness clients production MCP Postgres and queue", "negative_control": {"would_fail_if": ["a harness mutation is a no-op", "cleanup is omitted", "queue verification is removed"]}, "evidence": {"artifact_type": "db_query", "required_capture": true}, "cases": [{"start_ref": "harness_namespaces", "action": {"actor": "cli_user", "steps": ["add one namespaced subscription through each harness", "verify rows independently", "remove through the same harness", "query residue and write state"]}, "end_state": {"must_observe": ["`distinct_subscription_id_count:4`", "`postgres_rows_before_delete:4`", "`subscription_residue_count:0` and `active_job_count:0`", "`migration_read_only:false`"], "must_not_observe": ["empty harness namespace", "broad-prefix cleanup", "write fence enabled"]}}]}
    }
  ]
}
-->
