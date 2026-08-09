# D08-02 — Remove Convex code/deps, delete dead clients, archive ratatui-playground

> **Task ID:** D08-02
> **Sprint:** [Sprint 32 — Convex Decommission: Code, Deps and Cloud Deletion](./SPRINT.md)
> **Type:** MIGRATION · **Priority:** P0 · **Effort:** M · **Estimate:** 180 min
> **Agent:** integrator · **Reviewer:** convex-reviewer
> **Proposed By:** convex-planner
> **TDD Mode:** shared · **RED_GREEN_REQUIRED:** no
> **Status:** Backlog

**Capabilities:** CAP-CUT-01
**PRD refs:** UC-SYNC-05 · T-SYNC-015 · T-SYNC-016 · T-SYNC-017 · CAP-CUT-01 · removed-at-decommission

## What this does

Removes the obsolete Convex runtime, packages, generated code, dead Python/CLI clients, and repository playground while preserving React Native and MCP behavior and archiving the playground externally.

## Why

Sprint 31 moved the live product onto the replacement platform, but the checkout still contains loadable Convex code, package dependencies, migration-only clients, and an in-repo Rust playground. Until those surfaces are removed, the application can silently regress onto the retired provider and the Convex cloud cannot be deleted safely.

## How to verify

- `./bin/holo verify:no-convex --json` reports zero scoped source and dependency hits after consuming D08-01's recorded RED oracle.
- `pnpm build:ios` succeeds for the Expo/React Native application, then the built MCP stdio server returns initialize response `id=1`.
- `convex/`, `python/`, `cli/`, and `ratatui-playground/` are absent; the external ratatui archive is non-empty and contains `ratatui-playground/Cargo.toml`.
- The scoped verifier remains green while three frozen migration-history markers remain grep-positive.

## Scope

This is a repository-source and dependency decommission only. It removes runtime residue across the Expo client, platform service, obsolete scripts/tests, manifests, and lockfiles; it does not redesign UI, change MCP tools, rerun ETL, perform the fresh restore, or delete the Convex cloud deployment.

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

```text
================================================================================
TASK: D08-02 - Remove Convex code/deps, delete dead clients, archive ratatui-playground
================================================================================

TASK_TYPE:  MIGRATION
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M
AGENT:      implementer=integrator | reviewer=convex-reviewer
PROPOSED-BY: convex-planner
ESTIMATE:   180 minutes
TDD_MODE:   shared
RED_GREEN_REQUIRED: no
VERIFICATION_POLICY: tests=true | red=false | seeded=true
CAPABILITIES: CAP-CUT-01
PRD_REFS:   08-uc-sync.md UC-SYNC-05 | 11-e2e-testing-criteria.md T-SYNC-015..017 | 09-capability-chains.md CAP-CUT-01 | 06-external-dependencies.md removed-at-decommission | 01-scope.md frozen history/no UI redesign

RUNTIME_COMMANDS:
  test:      ./bin/holo verify:no-convex --json
  typecheck: pnpm typecheck
  lint:      pnpm lint

PROGRESS: 0/4 ACs complete

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------

The application and MCP build and start without Convex/Cohere while dead clients disappear, the playground is externally archived, and frozen migration history remains intact.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS
--------------------------------------------------------------------------------

- MUST capture `verify:decommission-inventory --json` with `ok=true`, `unclassified_count=0`, and `sole_implementation_count=0` before deleting any source.
- NEVER modify or delete frozen migration contracts, source catalogs, retained evidence, restore evidence, `.env`, `.env.local`, or `services/platform/config/secrets.yaml`.
- STRICTLY create and verify the external ratatui archive before removing `ratatui-playground/` from the repository.
- NEVER redesign React Native screens, navigation, hooks, or state semantics; this task removes provider residue while preserving the Expo application's Zero/platform-backed behavior.
- NEVER change MCP tool names, schemas, or behavior, and never substitute a stub start for the real `holocron-mcp` stdio initialize handshake.

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------

- [ ] The captured Sprint 31 inventory authorizes deletion and `./bin/holo verify:no-convex --json` reports zero scoped source/dependency hits — AC-1 (PRIMARY).
- [ ] `pnpm build:ios` and the real MCP build/initialize gate exit zero without Convex or Cohere packages — AC-2.
- [ ] Four retired repository roots are absent and one verified external ratatui archive exists — AC-3.
- [ ] The verifier stays green while three frozen migration-history markers remain present — AC-4.
- [ ] `pnpm test:unit && pnpm test:lanes && pnpm typecheck && pnpm lint` exit zero.
- [ ] `git diff --name-only` is contained by `SCOPE.writeAllowed` and contains no frozen/prohibited path.

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA
--------------------------------------------------------------------------------

AC-1: Authorized repository cleanup reaches zero scoped residue [PRIMARY]
  GIVEN: Sprint 31's decommission inventory is captured green and D08-01's shared acceptance oracle is RED on the pre-cleanup checkout
  WHEN:  runtime code, generated code, package dependencies, obsolete scripts/tests, and lockfile nodes are removed
  THEN:  the captured authorization is valid and the shared oracle reports zero scoped source and dependency hits

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  repository filesystem + holo decommission verifier
  TDD_STATE:             none (shared RED owned by D08-01)
  TEST_FILE:             tests/integration/s32-d08-01-no-convex-decommission.test.ts
  TEST_FUNCTION:         authorized cleanup reports zero scoped residue
  VERIFY:                jq -e '.ok == true and .unclassified_count == 0 and .sole_implementation_count == 0' .tmp/D08-02/decommission-inventory.pre-delete.json && ./bin/holo verify:no-convex --json

  SCENARIO:
    START_REF:        decommission_authorized_tree
    NEGATIVE_CONTROL: would fail if a runtime root is omitted, a static success replaces the scan, or a prohibited import remains
    EVIDENCE:         stdout
    CASES:
      - ACTION: validate the captured inventory, then run the real no-convex verifier against the cleaned checkout
        MUST_OBSERVE: authorization_ok=1, scanned_root_count=7, package_manifest_count=3, source_hit_count=0, dependency_hit_count=0
        MUST_NOT_OBSERVE: empty verifier payload or pre-cleanup source_hit_count>=1

AC-2: React Native builds and MCP starts without retired packages
  GIVEN: prohibited packages and their import closure are absent from the root, platform, and MCP workspaces
  WHEN:  the Expo iOS build runs and an initialize request is piped through the real MCP stdio entrypoint
  THEN:  the application build exits zero and MCP returns initialize response id 1 using protocol version 2025-11-25

  TEST_TIER:             e2e
  VERIFICATION_SERVICE:  Expo iOS build + holocron-mcp stdio process
  TDD_STATE:             none (shared oracle)
  TEST_FILE:             tests/integration/s32-d08-01-no-convex-decommission.test.ts
  TEST_FUNCTION:         dependency clean app and MCP runtime gate
  VERIFY:                pnpm build:ios && (cd holocron-mcp && bun run build && printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"d08-02","version":"1.0.0"}}}' | bun run start | rg -q '"id"\s*:\s*1')

  SCENARIO:
    START_REF:        dependency_clean_checkout
    NEGATIVE_CONTROL: would fail if the application build is omitted, the MCP process is mocked, or a removed package remains load-bearing
    EVIDENCE:         stdout
    CASES:
      - ACTION: run `pnpm build:ios`, build `holocron-mcp`, and send initialize request id 1 to its real stdio process
        MUST_OBSERVE: iOS exit_code=0, MCP build exit_code=0, MCP response id=1, protocolVersion="2025-11-25"
        MUST_NOT_OBSERVE: empty MCP response, mock response_count>=1, or module resolution error_count>=1

AC-3: Dead clients are removed after the playground archive is verified
  GIVEN: the authorized checkout contains the four retired roots and the ratatui playground's canonical Cargo files
  WHEN:  the playground is archived outside the repository, verified, and the four retired roots are removed
  THEN:  the archive contains `ratatui-playground/Cargo.toml` and all four repository paths are absent

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  repository filesystem + external archive filesystem
  TDD_STATE:             none (shared oracle)
  TEST_FILE:             tests/integration/s32-d08-01-no-convex-decommission.test.ts
  TEST_FUNCTION:         dead roots absent after verified archive
  VERIFY:                test -s /Users/inference1/Archives/holocron/ratatui-playground-pre-decommission.tar.gz && tar -tzf /Users/inference1/Archives/holocron/ratatui-playground-pre-decommission.tar.gz | rg -q '^ratatui-playground/Cargo.toml$' && test ! -e convex && test ! -e python && test ! -e cli && test ! -e ratatui-playground

  SCENARIO:
    START_REF:        dead_client_archive_candidate
    NEGATIVE_CONTROL: would fail if the playground is deleted before verification, an empty archive is accepted, or a retired root remains as a stub
    EVIDENCE:         file_artifact
    CASES:
      - ACTION: create and verify the external archive, then remove the four retired repository roots
        MUST_OBSERVE: archive_byte_count>0, archive_entry_count>=3, entry="ratatui-playground/Cargo.toml", retired_path_count=4
        MUST_NOT_OBSERVE: empty archive, retired_path_count<4, or repository archive copy_count>=1

AC-4: Frozen migration history remains as a negative control
  GIVEN: the migration contracts and source catalog are frozen historical evidence outside the runtime scan scope
  WHEN:  the scoped decommission verifier passes and the known historical markers are probed
  THEN:  all three historical markers remain grep-positive while scoped source_hit_count stays zero

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  holo verifier + frozen artifact filesystem
  TDD_STATE:             none (shared oracle)
  TEST_FILE:             tests/integration/s32-d08-01-no-convex-decommission.test.ts
  TEST_FUNCTION:         scoped verifier preserves frozen history controls
  VERIFY:                ./bin/holo verify:no-convex --json && rg -n 'frozen_at: S31-FE-06' .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml && rg -n 'Convex source catalog' .spec/prds/mk6-migration/10-technical-requirements/12-migration-contract-artifacts.md && rg -n 'Convex export system metadata' .spec/prds/mk6-migration/10-technical-requirements/12-convex-source-catalog.yaml

  SCENARIO:
    START_REF:        frozen_history_control
    NEGATIVE_CONTROL: would fail if historical artifacts are deleted, the verifier returns static success, or frozen evidence is wrongly included in runtime scope
    EVIDENCE:         stdout
    CASES:
      - ACTION: run the scoped verifier, then probe the three frozen marker files
        MUST_OBSERVE: verifier exit_code=0, frozen_marker_count=3, marker="frozen_at: S31-FE-06", marker="Convex source catalog", marker="Convex export system metadata"
        MUST_NOT_OBSERVE: empty marker output, deleted artifact_count>=1, or scoped source_hit_count>=1

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------

| ID | Boolean criterion | Maps to | Verify |
|----|-------------------|---------|--------|
| TC-1 | The authorized cleanup gate reports zero scoped source and prohibited dependency residue. | AC-1 | `jq -e '.ok == true and .unclassified_count == 0 and .sole_implementation_count == 0' .tmp/D08-02/decommission-inventory.pre-delete.json && ./bin/holo verify:no-convex --json` |
| TC-2 | The dependency-clean checkout passes the app-build and real-MCP-start gate. | AC-2 | `pnpm build:ios && (cd holocron-mcp && bun run build && printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"d08-02","version":"1.0.0"}}}' \| bun run start \| rg -q '"id"\s*:\s*1')` |
| TC-3 | The retirement gate proves four roots absent behind one verified external archive. | AC-3 | `test -s /Users/inference1/Archives/holocron/ratatui-playground-pre-decommission.tar.gz && tar -tzf /Users/inference1/Archives/holocron/ratatui-playground-pre-decommission.tar.gz \| rg -q '^ratatui-playground/Cargo.toml$' && test ! -e convex && test ! -e python && test ! -e cli && test ! -e ratatui-playground` |
| TC-4 | The scoped verifier stays green with three frozen history controls present. | AC-4 | `./bin/holo verify:no-convex --json && rg -n 'frozen_at: S31-FE-06' .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml && rg -n 'Convex source catalog' .spec/prds/mk6-migration/10-technical-requirements/12-migration-contract-artifacts.md && rg -n 'Convex export system metadata' .spec/prds/mk6-migration/10-technical-requirements/12-convex-source-catalog.yaml` |

--------------------------------------------------------------------------------
FIXTURES
--------------------------------------------------------------------------------

decommission_authorized_tree — real checkout after Sprint 31 inventory returns ok=true with both refusal counts at 0.

dependency_clean_checkout — post-cleanup checkout whose real Expo and MCP entrypoints remain runnable.

dead_client_archive_candidate — pre-cleanup checkout with four tracked retired roots and the playground's three canonical Cargo/source entries.

frozen_history_control — recorded frozen artifacts containing three known historical markers that intentionally remain outside runtime scan scope.

--------------------------------------------------------------------------------
SCOPE
--------------------------------------------------------------------------------

writeAllowed:
- convex/** (DELETE)
- python/** (DELETE)
- cli/** (DELETE)
- ratatui-playground/** (ARCHIVE EXTERNALLY, VERIFY, THEN DELETE)
- tests/convex/** (DELETE)
- package.json, pnpm-lock.yaml, vitest.workspace.ts (MODIFY — dependencies, scripts, lock graph, test roots)
- .env.example, services/platform/config/secrets.example.yaml (MODIFY — obsolete public configuration names only)
- services/platform/package.json (MODIFY — remove retired dependency)
- app/(drawer)/improvements.tsx, app/_layout.tsx, app/articles.tsx, app/document/[id].tsx (MODIFY — remove/neutralize retired provider residue without UI changes)
- app/zero/mutators.ts, app/zero/platform.ts, app/zero/queries.ts, app/zero/schema.ts (MODIFY — remove retired client exposure; preserve durable server history)
- hooks/use-agent-activity.ts, hooks/use-agent-activity.test.ts, hooks/use-voice-result-bridge.ts, hooks/use-voice-session-state.ts, hooks/use-voice-session.ts, hooks/useResearchSession.ts (MODIFY — remove dead provider wiring; preserve hook contracts)
- lib/extractParagraphs.ts, lib/types/chat.ts, lib/types/deep-research.ts, lib/voice/function-dispatcher.ts, lib/voice/retry-manager.ts, lib/voice/transcript-recorder.ts (MODIFY — remove dead types/runner)
- screens/settings-screen.tsx, screens/subscription-detail-screen.tsx, screens/toolbelt-screen.tsx (MODIFY — remove residue only; no visual redesign)
- tests/lib/voice/function-dispatcher.test.ts (MODIFY — retain behavioral coverage after dead runner removal)
- scripts/migrate-documents.ts, scripts/benchmark-search.ts, scripts/validate-migration.ts, scripts/investigate-doc-172.ts, scripts/migrate-all.ts, scripts/setup-youtube-oauth.ts (DELETE when solely migration/provider-bound)
- services/platform/src/cutover/convex-fence-client.ts, services/platform/src/cutover/convex-live-attestation.ts (DELETE after authorization)
- services/platform/src/cutover/ponr.ts, services/platform/src/cutover/data-plane-content.ts (MODIFY — remove SDK closure while preserving PONR/data-plane evidence)
- services/platform/src/cli/commands/__tests__/verify-decommission-inventory.test.ts (MODIFY — post-removal behavior)
- services/platform/tests/integration/write-fence-red.helpers.ts, services/platform/tests/integration/sprint30-ponr-latch.test.ts, services/platform/tests/integration/sprint29-fence-arm-order.test.ts, services/platform/tests/integration/sprint30-pinned-fallback-build.test.ts, services/platform/tests/integration/sprint29-convex-fence.test.ts, services/platform/tests/integration/sprint30-security-review.test.ts, services/platform/tests/integration/sprint29-cutover-etl.test.ts (MODIFY/DELETE only where the retired SDK is load-bearing)
- .tmp/D08-02/** (NEW — non-secret evidence)
- /Users/inference1/Archives/holocron/ratatui-playground-pre-decommission.tar.gz (NEW — external archive)

writeProhibited:
- tests/integration/s32-d08-01-no-convex-decommission.test.ts and D08-01 verifier implementation — D08-01 owns the shared oracle; D08-02 consumes it without weakening or rebaselining it
- holocron-mcp/src/** — currently dependency-clean; do not change tool names, schemas, or behavior to make the gate pass
- .spec/prds/mk6-migration/10-technical-requirements/12-convex-source-catalog.yaml
- .spec/prds/mk6-migration/10-technical-requirements/12-migration-contract-artifacts.md
- .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json
- .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml
- .spec/prds/mk6-migration/10-technical-requirements/14-mcp-compatibility-manifest.yaml
- .spec/evidence/** and .tmp/D06-04/** — retained audit/restore evidence
- .env, .env.local, services/platform/config/secrets.yaml — live operator secrets
- Any file not explicitly listed above

--------------------------------------------------------------------------------
BOUNDARIES (✅ Always / ⚠️ Ask First)
--------------------------------------------------------------------------------

✅ Always:
- Capture and validate the Sprint 31 authorization before any deletion.
- Treat the root, `holocron-mcp`, and `services/platform` manifests plus `pnpm-lock.yaml` as one dependency-removal boundary.
- Preserve React Native navigation, rendering, hook interfaces, and Zero/platform behavior while subtracting provider-specific identifiers.
- Exercise the built MCP stdio process with a real initialize request; build-only or import-only evidence is insufficient.
- Verify the external archive before removing the in-repo playground.

⚠️ Ask First:
- Any deletion outside the explicit writeAllowed list.
- Any removal or mutation of PONR, restore, source-catalog, or client-contract evidence.
- Any user-visible React Native change or MCP tool-contract change.
- Any new dependency or compatibility shim introduced to replace a removed package.

--------------------------------------------------------------------------------
DELIVERABLE
--------------------------------------------------------------------------------

- .tmp/D08-02/decommission-inventory.pre-delete.json (NEW): captured authorization proving source destruction was permitted.
- package.json, services/platform/package.json, pnpm-lock.yaml, vitest.workspace.ts (MODIFY): prohibited packages, scripts, lock nodes, and Convex test roots removed.
- Expo/React Native source and tests listed in SCOPE (MODIFY): provider residue removed without UI or public-hook changes.
- services/platform cutover SDK closure and obsolete scripts/tests listed in SCOPE (MODIFY/DELETE): retired provider cannot be loaded from maintained runtime code.
- convex/**, python/**, cli/**, tests/convex/**, ratatui-playground/** (DELETE): dead source and clients absent from the repository.
- /Users/inference1/Archives/holocron/ratatui-playground-pre-decommission.tar.gz (NEW): verified external playground archive.
- Captured verifier, Expo build, MCP initialize, archive, and frozen-history outputs: reviewable completion evidence.

--------------------------------------------------------------------------------
AGENT INSTRUCTIONS (shared-oracle flow)
--------------------------------------------------------------------------------

1. Consume D08-01's failing test/verifier and recorded RED evidence. Do not author a competing oracle, change its scan scope, or rebaseline its expected zero counts.
2. Before destructive work, create `.tmp/D08-02/decommission-inventory.pre-delete.json` through the real inventory CLI and fail closed unless all three authorization predicates pass.
3. Create and verify the external ratatui archive before deleting any playground path.
4. Remove dependency/import closures in small batches; after each batch run `./bin/holo verify:no-convex --json`, `pnpm typecheck`, and the relevant shared tests.
5. Preserve React Native and MCP public behavior, then capture the real Expo build and MCP initialize evidence. No new RED evidence is required because `tdd_mode=shared`; tests and seeded runtime evidence remain required.

--------------------------------------------------------------------------------
READING LIST (max 5 files — canonical pattern first)
--------------------------------------------------------------------------------

1. services/platform/src/cli/commands/verify-no-convex-client.ts [PRIMARY PATTERN]
   - Lines: 1-190
   - Focus: real `rg`, explicit roots, fail-closed subprocess status, structured hit counts, and no mock scanner.

2. services/platform/src/mission/verify-decommission-inventory.ts
   - Lines: 1-360
   - Focus: deletion authorization and refusal when an unclassified or sole implementation remains.

3. package.json + services/platform/package.json
   - Lines: dependency and scripts objects
   - Focus: root/platform dependency closure, obsolete commands, and repository-native app/test gates.

4. holocron-mcp/src/mastra/stdio.ts + holocron-mcp/package.json
   - Lines: complete entrypoint and scripts objects
   - Focus: MCP enrichment — preserve the real stdio entrypoint and prove initialize through `bun run start` after build.

5. .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml
   - Lines: frozen metadata and superseded_by authority
   - Focus: React Native migration-history negative control; read-only and never rebaseline.

--------------------------------------------------------------------------------
DESIGN / CODE PATTERN
--------------------------------------------------------------------------------

References:
- .spec/prds/mk6-migration/tasks/sprint-32-convex-decommission-code-deps-and-cloud-deletion/SPRINT.md
- .spec/prds/mk6-migration/08-uc-sync.md#UC-SYNC-05
- .spec/prds/mk6-migration/01-scope.md

Pattern:
- Follow `verify-no-convex-client.ts`: a fail-closed operator command delegates to a real repository scan, enumerates its scope, distinguishes zero hits from scanner failure, and emits structured counts.

Pattern source:
- services/platform/src/cli/commands/verify-no-convex-client.ts:1-190
- services/platform/src/mission/verify-decommission-inventory.ts:1-360

React Native enrichment:
- Treat old provider names in Expo screens, hooks, types, voice dispatch, and Zero client schema as removable implementation residue, not a reason to change navigation, screen composition, loading/error states, or public hook return values.
- Build the real iOS target with `pnpm build:ios`; typecheck-only evidence cannot prove Metro/native module resolution survives package removal.

MCP enrichment:
- Preserve the existing Mastra stdio entrypoint and all tool contracts. The acceptance boundary is a JSON-RPC initialize response from the built process, not a mocked server or static source assertion.
- `holocron-mcp/src` is already clean at planning time; source edits there require escalation rather than opportunistic redesign.

Anti-patterns:
- Deleting frozen historical files to manufacture a whole-repository zero match.
- Removing manifest lines while retaining runtime imports, generated files, test-only SDK users, or lockfile nodes.
- Replacing React Native behavior with an unavailable placeholder or replacing MCP startup with a stub.
- Leaving dead directories as renamed copies, compatibility re-exports, commented code, or an archive inside the repository.

--------------------------------------------------------------------------------
EVIDENCE GATES (fast/cheap first)
--------------------------------------------------------------------------------

Gate 1: Pre-deletion authorization
  Command: mkdir -p .tmp/D08-02 && bun services/platform/src/cli/holo.ts verify:decommission-inventory --json | tee .tmp/D08-02/decommission-inventory.pre-delete.json && jq -e '.ok == true and .unclassified_count == 0 and .sole_implementation_count == 0' .tmp/D08-02/decommission-inventory.pre-delete.json
  Expected: exit 0 before any deletion; captured JSON contains all three green predicates.

Gate 2: Shared zero-residue oracle
  Command: ./bin/holo verify:no-convex --json
  Expected: exit 0 after scanning all declared runtime roots, three package manifests, and lockfile dependency closure with zero prohibited hits.

Gate 3: React Native + MCP reality gate
  Command: pnpm build:ios && (cd holocron-mcp && bun run build && printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"d08-02","version":"1.0.0"}}}' | bun run start | rg -q '"id"\s*:\s*1')
  Expected: Expo iOS build exit 0, MCP build exit 0, and initialize response id 1 from the real stdio process.

Gate 4: Archive and retired-root gate
  Command: test -s /Users/inference1/Archives/holocron/ratatui-playground-pre-decommission.tar.gz && tar -tzf /Users/inference1/Archives/holocron/ratatui-playground-pre-decommission.tar.gz | rg -q '^ratatui-playground/Cargo.toml$' && test ! -e convex && test ! -e python && test ! -e cli && test ! -e ratatui-playground
  Expected: archive is non-empty with the canonical Cargo entry and all four repository roots are absent.

Gate 5: Frozen-history negative control
  Command: ./bin/holo verify:no-convex --json && rg -n 'frozen_at: S31-FE-06' .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml && rg -n 'Convex source catalog' .spec/prds/mk6-migration/10-technical-requirements/12-migration-contract-artifacts.md && rg -n 'Convex export system metadata' .spec/prds/mk6-migration/10-technical-requirements/12-convex-source-catalog.yaml
  Expected: verifier exit 0 and exactly three required historical controls remain present.

Gate 6: Regression and scope gate
  Command: pnpm test:unit && pnpm test:lanes && pnpm typecheck && pnpm lint && git diff --name-only
  Expected: all commands exit 0 and the diff is contained by SCOPE.writeAllowed.

Gate 7: Scenario contract
  Command: python3 /Users/inference1/Projects/brain/tools/validate-scenario/validate_scenario.py .tmp/D08-02/requirement-contract.json
  Expected: exit 0 with scenario_count=4 and violations=[].

--------------------------------------------------------------------------------
OUT OF SCOPE
--------------------------------------------------------------------------------

- Convex cloud deletion — D08-05 owns the irreversible external action.
- Fresh-hardware restore execution — D08-03 owns the final recovery proof.
- Decommission runbook authoring — D08-04 owns operator documentation.
- ETL replay, database-history rewriting, frozen-contract rebaselining, or source-catalog renaming.
- UI redesign, new product features, MCP tool-schema changes, or cleanup of live operator secret files.

--------------------------------------------------------------------------------
CONTEXT
--------------------------------------------------------------------------------

Current state:
- `convex/`, `python/`, `cli/`, and `ratatui-playground/` remain tracked.
- The root manifest retains Convex/Cohere packages and scripts; the active `services/platform` workspace also retains a Convex dependency.
- Expo screens/hooks/types and migration-only platform scripts/tests still contain provider-specific residue, while `holocron-mcp/src` is already clean.

Gap:
- Source destruction is not authorized until Sprint 31's inventory is green, and the repository cannot prove React Native/MCP independence until the D08-01 oracle, real app build, real MCP start, archive check, and frozen-history negative control all pass together.

--------------------------------------------------------------------------------
REVIEW (for convex-reviewer, with MCP + React Native lenses)
--------------------------------------------------------------------------------

Must pass:
- The captured inventory predates deletion and proves `ok=true`, `unclassified_count=0`, and `sole_implementation_count=0`.
- All four AC/TC gates pass without changing D08-01's shared oracle or scan scope.
- Root, platform, MCP manifests, runtime imports, generated files, tests, and lockfiles contain no prohibited dependency closure.
- The real Expo build and MCP stdio initialize handshake pass; no mock, static shell, unavailable placeholder, or UI/tool contract change substitutes for runtime proof.
- The external archive is valid, four roots are absent, frozen historical evidence is intact, and the diff stays within SCOPE.

Should verify:
- React Native hooks retain their public return shapes and screens retain navigation/loading/error behavior after provider-specific fields are removed.
- MCP tool names, schemas, handlers, and stdio lifecycle are byte-equivalent unless a separately approved residue edit is necessary.
- Platform PONR and restore evidence remain usable after SDK-loading helpers are retired.
- No secret values appear in stdout, evidence files, tracked examples, or review artifacts.
- Deleted clients do not survive as renamed copies, compatibility shims, commented blocks, or repository-local archives.

Verdict: [APPROVED | NEEDS_FIXES]

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------

Depends on: D08-01 (shared RED oracle and verifier); Sprint 31 decommission inventory (authorization)
Blocks:     D08-03 (post-cleanup restore) and D08-05 (cloud deletion)
Parallel:   D08-04 (runbook drafting, provided it consumes this task's final commands)

--------------------------------------------------------------------------------
CODING STANDARDS
--------------------------------------------------------------------------------

- RULES.md
- /Users/inference1/Projects/brain/docs/kanban/TASK-TEMPLATE.md
- /Users/inference1/Projects/brain/docs/kanban/REQUIREMENT-CONTRACT-V1.md
- /Users/inference1/Projects/brain/docs/kanban/SCENARIO-CONTRACT-V1.md
- /Users/inference1/Projects/brain/docs/RED-FIRST-TEST-GATE.md
- /Users/inference1/Projects/brain/docs/CAPABILITY-CHAIN-PLANNING.md

--------------------------------------------------------------------------------
CAPABILITY CHAIN CONTRACT
--------------------------------------------------------------------------------

Touches: CAP-CUT-01
Consumes: D08-01.no-convex-acceptance-oracle; Sprint31.decommission-inventory-green; Sprint31.post-PONR-client-state
Provides: D08-02.repo-source-decommissioned; D08-02.dependency-clean-runtime-proof; D08-02.external-playground-archive; D08-02.frozen-history-negative-control
Boundary contracts:
- Sprint 31 inventory JSON -> authorized source deletion.
- Runtime source/manifests/lockfile -> fail-closed zero-residue verifier.
- Expo and MCP build artifacts -> real client/MCP startup proof.
- Tracked playground tree -> verified external archive -> absent repository path.
- Scoped runtime cleanup -> preserved frozen migration history.

--------------------------------------------------------------------------------
REQUIREMENT-CONTRACT v1 (machine-readable)
--------------------------------------------------------------------------------
```

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "D08-02",
  "tdd_mode": "shared",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": false,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "decommission_authorized_tree": {
      "description": "Real checkout after the Sprint 31 inventory authorizes decommission and before D08-02 deletes source",
      "seed_method": "cli",
      "records": [
        "inventory ok=true",
        "unclassified_count=0",
        "sole_implementation_count=0"
      ]
    },
    "dependency_clean_checkout": {
      "description": "Post-cleanup checkout exercised through the real Expo build and MCP stdio entrypoints",
      "seed_method": "cli",
      "records": [
        "D08-01 oracle scans 7 runtime roots",
        "D08-01 oracle scans 3 package manifests",
        "real app and MCP entrypoints available"
      ]
    },
    "dead_client_archive_candidate": {
      "description": "Authorized pre-cleanup checkout containing the four retired roots and canonical ratatui files",
      "seed_method": "migration_fixture",
      "records": [
        "retired root count=4",
        "ratatui-playground/Cargo.toml",
        "ratatui-playground/Cargo.lock",
        "ratatui-playground/src/main.rs"
      ]
    },
    "frozen_history_control": {
      "description": "Recorded frozen migration artifacts intentionally outside the runtime verifier scope",
      "seed_method": "recorded_external",
      "records": [
        "13-client-data-contract.yaml contains frozen_at: S31-FE-06",
        "12-migration-contract-artifacts.md contains Convex source catalog",
        "12-convex-source-catalog.yaml contains Convex export system metadata"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "maps_to_ac": null,
      "description": "GIVEN Sprint 31 authorizes decommission and D08-01 supplies the oracle WHEN cleanup completes THEN all declared runtime, manifest, and lockfile scopes report zero prohibited source and dependency hits",
      "verify": "jq -e '.ok == true and .unclassified_count == 0 and .sole_implementation_count == 0' .tmp/D08-02/decommission-inventory.pre-delete.json && ./bin/holo verify:no-convex --json",
      "test_tier": "integration",
      "verification_service": "repository filesystem + holo decommission verifier",
      "flow_ref": "UC-SYNC-05/T-SYNC-015/CAP-CUT-01",
      "scenario": {
        "id": "D08-02-AC-1",
        "primary": true,
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "repository filesystem + holo decommission verifier",
        "topology": "single-node",
        "flow_ref": "UC-SYNC-05/T-SYNC-015/CAP-CUT-01",
        "cases": [
          {
            "start_ref": "decommission_authorized_tree",
            "action": {
              "actor": "cli_user",
              "steps": [
                "validate captured inventory",
                "run ./bin/holo verify:no-convex --json against the cleaned checkout"
              ]
            },
            "end_state": {
              "must_observe": [
                "authorization_ok=1",
                "scanned_root_count=7",
                "package_manifest_count=3",
                "source_hit_count=0",
                "dependency_hit_count=0"
              ],
              "must_not_observe": [
                "empty verifier payload",
                "pre-cleanup source_hit_count>=1"
              ]
            }
          }
        ],
        "negative_control": {
          "would_fail_if": [
            "a runtime root is omitted",
            "a static success response replaces the scan",
            "a prohibited import is not removed"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true,
          "capture": [
            "inventory JSON",
            "verifier JSON"
          ]
        }
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "primary": false,
      "maps_to_ac": null,
      "description": "GIVEN prohibited packages and imports are absent WHEN the repository-native app build and real MCP stdio startup run THEN the iOS build exits zero and MCP returns initialize response id 1",
      "verify": "pnpm build:ios && (cd holocron-mcp && bun run build && printf '%s\\n' '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":{\"protocolVersion\":\"2025-11-25\",\"capabilities\":{},\"clientInfo\":{\"name\":\"d08-02\",\"version\":\"1.0.0\"}}}' | bun run start | rg -q '\"id\"\\s*:\\s*1')",
      "test_tier": "e2e",
      "verification_service": "Expo iOS build + holocron-mcp stdio process",
      "flow_ref": "UC-SYNC-05/T-SYNC-016",
      "scenario": {
        "id": "D08-02-AC-2",
        "primary": false,
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "Expo iOS build + holocron-mcp stdio process",
        "topology": "single-node",
        "flow_ref": "UC-SYNC-05/T-SYNC-016",
        "cases": [
          {
            "start_ref": "dependency_clean_checkout",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run pnpm build:ios",
                "build holocron-mcp",
                "send initialize request id 1 to the real stdio process"
              ]
            },
            "end_state": {
              "must_observe": [
                "iOS exit_code=0",
                "MCP build exit_code=0",
                "MCP response id=1",
                "protocolVersion=\"2025-11-25\""
              ],
              "must_not_observe": [
                "empty MCP response",
                "mock response_count>=1",
                "module resolution error_count>=1"
              ]
            }
          }
        ],
        "negative_control": {
          "would_fail_if": [
            "the MCP process is mocked",
            "the app build is omitted",
            "a removed package remains load-bearing"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true,
          "capture": [
            "build statuses",
            "initialize response"
          ]
        }
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "primary": false,
      "maps_to_ac": null,
      "description": "GIVEN the authorized dead roots and intact playground WHEN retirement runs THEN convex, python, cli, and ratatui-playground are absent and the external archive retains Cargo.toml",
      "verify": "test -s /Users/inference1/Archives/holocron/ratatui-playground-pre-decommission.tar.gz && tar -tzf /Users/inference1/Archives/holocron/ratatui-playground-pre-decommission.tar.gz | rg -q '^ratatui-playground/Cargo.toml$' && test ! -e convex && test ! -e python && test ! -e cli && test ! -e ratatui-playground",
      "test_tier": "integration",
      "verification_service": "repository filesystem + external archive filesystem",
      "flow_ref": "UC-SYNC-05/T-SYNC-017",
      "scenario": {
        "id": "D08-02-AC-3",
        "primary": false,
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "repository filesystem + external archive filesystem",
        "topology": "single-node",
        "flow_ref": "UC-SYNC-05/T-SYNC-017",
        "cases": [
          {
            "start_ref": "dead_client_archive_candidate",
            "action": {
              "actor": "cli_user",
              "steps": [
                "create and verify the external archive",
                "remove the four retired repository roots"
              ]
            },
            "end_state": {
              "must_observe": [
                "archive_byte_count>0",
                "archive_entry_count>=3",
                "entry=\"ratatui-playground/Cargo.toml\"",
                "retired_path_count=4"
              ],
              "must_not_observe": [
                "empty archive",
                "retired_path_count<4",
                "repository archive copy_count>=1"
              ]
            }
          }
        ],
        "negative_control": {
          "would_fail_if": [
            "the playground is deleted before archive verification",
            "an empty archive is accepted",
            "a retired root remains as a stub"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true,
          "capture": [
            "external tar.gz",
            "archive listing",
            "four absence checks"
          ]
        }
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "primary": false,
      "maps_to_ac": null,
      "description": "GIVEN migration contracts are frozen history WHEN the scoped verifier passes THEN three historical markers remain grep-positive, proving cleanup preserved evidence",
      "verify": "./bin/holo verify:no-convex --json && rg -n 'frozen_at: S31-FE-06' .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml && rg -n 'Convex source catalog' .spec/prds/mk6-migration/10-technical-requirements/12-migration-contract-artifacts.md && rg -n 'Convex export system metadata' .spec/prds/mk6-migration/10-technical-requirements/12-convex-source-catalog.yaml",
      "test_tier": "integration",
      "verification_service": "holo verifier + frozen artifact filesystem",
      "flow_ref": "CAP-CUT-01/UC-SYNC-05",
      "scenario": {
        "id": "D08-02-AC-4",
        "primary": false,
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "holo verifier + frozen artifact filesystem",
        "topology": "single-node",
        "flow_ref": "CAP-CUT-01/UC-SYNC-05",
        "cases": [
          {
            "start_ref": "frozen_history_control",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run the scoped decommission verifier",
                "probe the three frozen marker files"
              ]
            },
            "end_state": {
              "must_observe": [
                "verifier exit_code=0",
                "frozen_marker_count=3",
                "marker=\"frozen_at: S31-FE-06\"",
                "marker=\"Convex source catalog\"",
                "marker=\"Convex export system metadata\""
              ],
              "must_not_observe": [
                "empty marker output",
                "deleted artifact_count>=1",
                "scoped source_hit_count>=1"
              ]
            }
          }
        ],
        "negative_control": {
          "would_fail_if": [
            "historical artifacts are deleted",
            "the verifier returns static success",
            "frozen evidence is wrongly included in runtime scope"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true,
          "capture": [
            "verifier JSON",
            "three marker lines"
          ]
        }
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "primary": false,
      "maps_to_ac": "AC-1",
      "description": "The authorized cleanup gate reports zero scoped source and prohibited dependency residue.",
      "verify": "jq -e '.ok == true and .unclassified_count == 0 and .sole_implementation_count == 0' .tmp/D08-02/decommission-inventory.pre-delete.json && ./bin/holo verify:no-convex --json",
      "test_tier": "integration",
      "verification_service": "repository filesystem + holo decommission verifier",
      "flow_ref": "UC-SYNC-05/T-SYNC-015/CAP-CUT-01"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "primary": false,
      "maps_to_ac": "AC-2",
      "description": "The dependency-clean checkout passes the app-build and real-MCP-start gate.",
      "verify": "pnpm build:ios && (cd holocron-mcp && bun run build && printf '%s\\n' '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":{\"protocolVersion\":\"2025-11-25\",\"capabilities\":{},\"clientInfo\":{\"name\":\"d08-02\",\"version\":\"1.0.0\"}}}' | bun run start | rg -q '\"id\"\\s*:\\s*1')",
      "test_tier": "e2e",
      "verification_service": "Expo iOS build + holocron-mcp stdio process",
      "flow_ref": "UC-SYNC-05/T-SYNC-016"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "primary": false,
      "maps_to_ac": "AC-3",
      "description": "The retirement gate proves four roots absent behind one verified external archive.",
      "verify": "test -s /Users/inference1/Archives/holocron/ratatui-playground-pre-decommission.tar.gz && tar -tzf /Users/inference1/Archives/holocron/ratatui-playground-pre-decommission.tar.gz | rg -q '^ratatui-playground/Cargo.toml$' && test ! -e convex && test ! -e python && test ! -e cli && test ! -e ratatui-playground",
      "test_tier": "integration",
      "verification_service": "repository filesystem + external archive filesystem",
      "flow_ref": "UC-SYNC-05/T-SYNC-017"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "primary": false,
      "maps_to_ac": "AC-4",
      "description": "The scoped verifier stays green with three frozen history controls present.",
      "verify": "./bin/holo verify:no-convex --json && rg -n 'frozen_at: S31-FE-06' .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml && rg -n 'Convex source catalog' .spec/prds/mk6-migration/10-technical-requirements/12-migration-contract-artifacts.md && rg -n 'Convex export system metadata' .spec/prds/mk6-migration/10-technical-requirements/12-convex-source-catalog.yaml",
      "test_tier": "integration",
      "verification_service": "holo verifier + frozen artifact filesystem",
      "flow_ref": "CAP-CUT-01/UC-SYNC-05"
    }
  ]
}
-->
</details>
