# CUTOVER-HARNESS-001: Non-secret zsh and cmux bearer bootstrap

> Status: Backlog
> Assignee: mcp-implementer
> Reviewer: mcp-reviewer
> Priority: P0
> Type: config
> Proposed By: mcp-planner
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes
> Depends on: S33-MCP-03
> Files: scripts/holocron-harness-env.ts, scripts/holocron-harness-env.zsh, services/platform/tests/integration/harness-secret-bootstrap.test.ts, ~/.zshrc, cmux shell-launch configuration

## Outcome

New zsh and cmux-launched harness processes resolve `HOLO_KEY_MCP` from the canonical ignored
`secrets.yaml` through the existing parser without duplicating, displaying, or persisting the value.

## Constraints

- Reuse `services/platform/src/config/secrets.ts`; do not write a second YAML parser or secret store.
- Resolve only `HOLO_KEY_MCP` from the canonical file or explicit `HOLOCRON_SECRETS_PATH` /
  `HOLO_SECRETS_PATH`.
- Shell integration contains only non-secret loader code. Credential bytes must not appear in
  stdout, stderr, argv, logs, tracked files, cmux config, or shell history.
- Missing, malformed, unreadable, or absent-key configuration fails closed before a harness launch.

## Acceptance Criteria

- [ ] AC-1: The bootstrap uses the existing secrets parser and leaks zero credential bytes through output, argv, logs, or artifacts.
- [ ] AC-2: Fresh interactive and noninteractive zsh processes inherit the key and authenticate to production, while a bootstrap-disabled control receives 401.
- [ ] AC-3: A fresh cmux pane inherits the same key without a manual export and initializes the remote MCP.
- [ ] AC-4: Missing, malformed, unreadable, and absent-key inputs fail closed before child execution.

## Test Criteria

| ID | Statement | Maps | Verify |
|---|---|---|---|
| TC-1 | The real parser resolves a sentinel while all captured surfaces remain secret-free. | AC-1 | `PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/harness-secret-bootstrap.test.ts -t 'AC-1'` |
| TC-2 | Clean zsh sessions authenticate only when the bootstrap is active. | AC-2 | `PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/harness-secret-bootstrap.test.ts -t 'AC-2'` |
| TC-3 | A newly created cmux pane authenticates with no manual export. | AC-3 | `PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/harness-secret-bootstrap.test.ts -t 'AC-3'` |
| TC-4 | Invalid secret-source matrices exit nonzero before child exec. | AC-4 | `PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/harness-secret-bootstrap.test.ts -t 'AC-4'` |

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "CUTOVER-HARNESS-001",
  "tdd_mode": "red_first",
  "verification_policy": {"requires_tests": true, "requires_red_evidence": true, "requires_seeded_evidence": true},
  "fixtures": {
    "canonical_secret": {"description": "Canonical ignored secret file with a task-known sentinel value", "seed_method": "recorded_external", "records": ["services/platform/config/secrets.yaml", "HOLO_KEY_MCP"]},
    "fresh_shell": {"description": "New zsh and cmux shell processes", "seed_method": "cli", "records": ["interactive zsh", "noninteractive zsh", "new cmux pane"]},
    "invalid_sources": {"description": "Real temporary secret files for failure modes", "seed_method": "migration_fixture", "records": ["missing key", "malformed YAML", "unreadable path"]}
  },
  "requirements": [
    {
      "id": "AC-1", "type": "acceptance_criterion", "primary": true,
      "description": "The existing consolidated parser resolves only HOLO_KEY_MCP and no captured surface contains its bytes.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/harness-secret-bootstrap.test.ts -t 'AC-1'",
      "scenario": {"id": "CUTOVER-HARNESS-001/AC-1", "tier": "visible", "test_tier": "integration", "verification_service": "real filesystem zsh and consolidated secrets parser", "negative_control": {"would_fail_if": ["the bootstrap is a no-op", "the parser is bypassed", "an empty key is accepted"]}, "evidence": {"artifact_type": "stdout", "required_capture": true}, "cases": [{"start_ref": "canonical_secret", "action": {"actor": "cli_user", "steps": ["launch under captured output and process inspection", "report only presence and a non-reversible fingerprint"]}, "end_state": {"must_observe": ["`key_present:true`", "`secret_byte_occurrences:0` in stdout stderr argv logs and artifacts"], "must_not_observe": ["`key_present:false` or empty HOLO_KEY_MCP accepted", "credential value in generated files"]}}]}
    },
    {
      "id": "AC-2", "type": "acceptance_criterion", "primary": false,
      "description": "Clean zsh sessions inherit the key and authenticate while a bootstrap-disabled control receives 401.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/harness-secret-bootstrap.test.ts -t 'AC-2'",
      "scenario": {"id": "CUTOVER-HARNESS-001/AC-2", "tier": "visible", "test_tier": "e2e", "verification_service": "real zsh and deployed MCP", "negative_control": {"would_fail_if": ["startup bootstrap is a no-op", "the production auth boundary is removed"]}, "evidence": {"artifact_type": "api_response", "required_capture": true}, "cases": [{"start_ref": "fresh_shell", "action": {"actor": "cli_user", "steps": ["initialize MCP through bootstrapped shells", "initialize through a bootstrap-disabled control"]}, "end_state": {"must_observe": ["`bootstrapped_status:200` or `bootstrapped_status:202`", "`control_status:401`"], "must_not_observe": ["empty bearer accepted with status 200", "literal token in command or response"]}}]}
    },
    {
      "id": "AC-3", "type": "acceptance_criterion", "primary": false,
      "description": "A newly created cmux pane inherits the bootstrap and initializes MCP without manual export.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/harness-secret-bootstrap.test.ts -t 'AC-3'",
      "scenario": {"id": "CUTOVER-HARNESS-001/AC-3", "tier": "visible", "test_tier": "e2e", "verification_service": "real cmux pane zsh and deployed MCP", "negative_control": {"would_fail_if": ["cmux shell bootstrap is a no-op", "the local MCP child is not removed"]}, "evidence": {"artifact_type": "stdout", "required_capture": true}, "cases": [{"start_ref": "fresh_shell", "action": {"actor": "cli_user", "steps": ["create a fresh cmux pane", "initialize the remote MCP"]}, "end_state": {"must_observe": ["`key_present:true` in the fresh pane", "`initialize_status:200` or `initialize_status:202`"], "must_not_observe": ["empty credential accepted", "credential in cmux config or scrollback"]}}]}
    },
    {
      "id": "AC-4", "type": "acceptance_criterion", "primary": false,
      "description": "Invalid secret sources fail closed before any harness child executes.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/harness-secret-bootstrap.test.ts -t 'AC-4'",
      "scenario": {"id": "CUTOVER-HARNESS-001/AC-4", "tier": "visible", "test_tier": "integration", "verification_service": "real filesystem and zsh", "negative_control": {"would_fail_if": ["an absent key is accepted", "parse errors are ignored as an empty value"]}, "evidence": {"artifact_type": "stdout", "required_capture": true}, "cases": [{"start_ref": "invalid_sources", "action": {"actor": "cli_user", "steps": ["invoke bootstrap for each invalid source", "inspect child process count"]}, "end_state": {"must_observe": ["`exit_code != 0`", "`diagnostic_key:\"HOLO_KEY_MCP\"` or an explicit invalid path", "`child_exec_count:0`"], "must_not_observe": ["empty bearer header", "credential fallback", "secret file contents"]}}]}
    }
  ]
}
-->
