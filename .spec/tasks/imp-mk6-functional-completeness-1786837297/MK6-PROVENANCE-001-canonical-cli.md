# MK6-PROVENANCE-001: Establish canonical CLI and immutable runtime provenance

> Status: Backlog
> Assignee: devops-engineer
> Reviewer: integration-validator
> Priority: P0
> Type: bugfix
> Wave: 2
> Proposed by: mastra-planner
> Files: bin/holo, services/platform/src/cli/holo.ts, services/platform/src/cli/commands/build-info.ts, services/platform/src/cli/commands/verify-installed-cli.ts, services/platform/src/cli/commands/verify-decommission-inventory.ts, services/platform/src/cli/commands/__tests__/build-info.test.ts, services/platform/src/cli/commands/__tests__/verify-decommission-inventory.test.ts, scripts/verify-mk6-cli-provenance.sh, .gate-evidence/mk6-provenance/**
> Depends on: MK6-HOST-001

## Outcome

`./bin/holo` and the versioned installed CLI expose one exact release identity, fail on old PATH resolution, and preserve a pre-delete inventory usable after source removal.

## Acceptance Criteria

- [ ] AC-1: `PLATFORM_IT=1 bash scripts/verify-mk6-cli-provenance.sh --source-and-host --json` proves `./bin/holo build-info --json` and installed `holo build-info --json` match source SHA, version, image digest, generation, and host identity.
- [ ] AC-2: A planted old PATH binary or unexpected executable path fails before any gate or operator action with `OLD_CLI_PATH`.
- [ ] AC-3: The immutable redacted pre-delete inventory is hashed and release-bound; after a disposable source-copy deletion, `./bin/holo verify:decommission-inventory --json` uses retained inventory plus current no-residue scan and passes without walking the removed source.

## Test Criteria

| ID | Binary statement | Maps | Verify |
|---|---|---|---|
| TC-1 | Source and installed CLI identities match exactly. | AC-1 | `PLATFORM_IT=1 bash scripts/verify-mk6-cli-provenance.sh --source-and-host --json` |
| TC-2 | An old PATH binary fails before work begins. | AC-2 | `PLATFORM_IT=1 MK6_PROVENANCE_NEGATIVE=old-path bash scripts/verify-mk6-cli-provenance.sh --json` |
| TC-3 | Retained inventory verifies after disposable source deletion. | AC-3 | `PLATFORM_IT=1 bash scripts/verify-mk6-cli-provenance.sh --pre-delete-inventory-roundtrip --json` |

This task is the sole owner of `services/platform/src/cli/holo.ts`; the ledger task consumes its CLI surface but does not edit it.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{"version":"1","task_id":"MK6-PROVENANCE-001","tdd_mode":"red_first","verification_policy":{"requires_tests":true,"requires_red_evidence":true,"requires_seeded_evidence":true},"fixtures":{"cli_pair":{"seed_method":"cli","description":"source wrapper and installed CLI for one release","records":["expectedIdentityCount: 1"]},"old_path":{"seed_method":"cli","description":"PATH prefixed by a planted older disposable CLI","records":["oldCliCount: 1"]},"predelete_inventory":{"seed_method":"cli","description":"hashed pre-delete inventory and disposable source copy","records":["inventoryCount: 1"]}},"requirements":[{"id":"AC-1","type":"acceptance_criterion","primary":true,"description":"GIVEN source and installed CLI WHEN build-info runs THEN both report one exact release identity","verify":"PLATFORM_IT=1 bash scripts/verify-mk6-cli-provenance.sh --source-and-host --json","maps_to_ac":null,"scenario":{"id":"cli-identity","test_tier":"integration","tier":"visible","verification_service":"source-installed-cli","negative_control":{"would_fail_if":["installed build-info is hardcoded or identities differ"]},"evidence":{"artifact_type":"stdout","required_capture":true},"cases":[{"start_ref":"cli_pair","action":{"steps":["run build-info through source wrapper and installed CLI"]},"end_state":{"must_observe":["matchingCliCount: 2","releaseIdentityCount: 1"],"must_not_observe":["matchingCliCount: 0","empty build identity"]}}]}},{"id":"AC-2","type":"acceptance_criterion","description":"GIVEN an old PATH binary WHEN preflight runs THEN OLD_CLI_PATH blocks all work","verify":"PLATFORM_IT=1 MK6_PROVENANCE_NEGATIVE=old-path bash scripts/verify-mk6-cli-provenance.sh --json","maps_to_ac":null,"scenario":{"id":"cli-old-path","test_tier":"integration","tier":"visible","verification_service":"cli-path-preflight","negative_control":{"would_fail_if":["the old executable is accepted or PATH validation is removed"]},"evidence":{"artifact_type":"stdout","required_capture":true},"cases":[{"start_ref":"old_path","action":{"steps":["prepend the disposable old CLI and run preflight"]},"end_state":{"must_observe":["failureClass: OLD_CLI_PATH"],"must_not_observe":["failureCount: 0","empty failure class"]}}]}},{"id":"AC-3","type":"acceptance_criterion","description":"GIVEN retained inventory WHEN disposable source is deleted THEN current no-residue verification still passes","verify":"PLATFORM_IT=1 bash scripts/verify-mk6-cli-provenance.sh --pre-delete-inventory-roundtrip --json","maps_to_ac":null,"scenario":{"id":"cli-predelete-inventory","test_tier":"integration","tier":"visible","verification_service":"filesystem-cli-inventory","negative_control":{"would_fail_if":["the retained inventory is deleted or verifier requires removed source"]},"evidence":{"artifact_type":"file_artifact","required_capture":true},"cases":[{"start_ref":"predelete_inventory","action":{"steps":["hash inventory, delete only the disposable source copy, and verify current no-residue state"]},"end_state":{"must_observe":["retainedInventoryPassCount: 1"],"must_not_observe":["retainedInventoryPassCount: 0","empty inventory digest"]}}]}},{"id":"TC-1","type":"test_criterion","description":"Two CLI surfaces match one identity","verify":"PLATFORM_IT=1 bash scripts/verify-mk6-cli-provenance.sh --source-and-host --json","maps_to_ac":"AC-1"},{"id":"TC-2","type":"test_criterion","description":"Old PATH fails closed","verify":"PLATFORM_IT=1 MK6_PROVENANCE_NEGATIVE=old-path bash scripts/verify-mk6-cli-provenance.sh --json","maps_to_ac":"AC-2"},{"id":"TC-3","type":"test_criterion","description":"Pre-delete inventory survives source removal","verify":"PLATFORM_IT=1 bash scripts/verify-mk6-cli-provenance.sh --pre-delete-inventory-roundtrip --json","maps_to_ac":"AC-3"}]}
-->
