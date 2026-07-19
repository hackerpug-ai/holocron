# S-COLDBOOT-01 — Remove ConvexProvider from app/_layout.tsx cold-boot path; boot the reference build with the Zero provider and no EXPO_PUBLIC_CONVEX_URL
> Status: ✅ Completed
> Completed: 2026-07-19T09:02:50Z
> Sprint: [Sprint 20 — E2E Maestro Harness and Cold-Boot Reference Flow](./SPRINT.md)
> Agent: react-native-ui-implementer
> Estimate: 120 min
> Type: FEATURE
> Priority: P0
> Proposed by: react-native-ui-planner
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes · SEEDED_EVIDENCE_REQUIRED: yes

## Outcome

Detach ConvexProvider/ConvexReactClient/convex-react from the app/_layout.tsx cold-boot reference path so the Expo app boots on the Zero provider alone, proving the thin client-flip vertical (CAP-CUT-01) with EXPO_PUBLIC_CONVEX_URL unset.

**Success state:** An operator launches the reference Expo build on a named iOS Simulator with EXPO_PUBLIC_CONVEX_URL unset; the app cold-boots to a visible chat-screen with no red-box, and app/_layout.tsx contains zero convex/react imports on the boot path.

## Background

- **Specialist rationale:** Edits the Expo root layout provider tree (app/_layout.tsx) and the Maestro boot flow — RN client provider/state-and-network wiring, the react-native-ui-implementer's domain. No backend logic changes.
- **Planning rationale:** Per the Sprint 20 audit (specialist Read of the current repo state), `app/_layout.tsx:146` still wraps the tree in `<ConvexProvider>` and constructs `ConvexReactClient` (line 39), importing `convex/react` (line 7) — `ZeroProvider` is already the outer wrapper, so this is a removal of the inner Convex layer, not a from-scratch provider swap. 44 other files still use `convex/react`; this task's scope is the cold-boot reference path ONLY.
- **How to verify (human):** Launch the reference Expo dev build on the named iOS Simulator with `EXPO_PUBLIC_CONVEX_URL` unset via `scripts/e2e/run-maestro-reference-flow.sh --run`; confirm the app reaches the `chat-screen` testID with no crash, and `grep -Ec "convex/react|ConvexReactClient|ConvexProvider" app/_layout.tsx` returns 0.
- **Scope:** `app/_layout.tsx` provider tree only, plus the Maestro flow/boot assertion if one is needed. Does NOT touch the 44 other Convex-hook call sites (deferred to later UC-SYNC-01 work in Sprint 24) or any backend route.
- **PRD refs:** UC-SYNC-01, T-SYNC-003, CAP-CUT-01

## Critical Constraints

### MUST
- MUST prove cold boot via a real Maestro launch on a named iOS Simulator against a running fleet — never a jest/vitest mock of the provider or a local dev shortcut
- MUST succeed with `EXPO_PUBLIC_CONVEX_URL` absent from the build environment
- MUST keep `ZeroProvider` as the mounted data plane wrapping the reference route

### NEVER
- NEVER migrate or delete the 44 remaining `convex/react` hook call-sites in other screens — only the cold-boot reference path is in scope
- NEVER reintroduce a Convex URL fallback (e.g. `ConvexReactClient(url ?? 'http://...')`) on the boot path
- NEVER paint the boot-success proof from a static shell — the app must reach the real `chat-screen` testID

### STRICTLY
- STRICTLY keep the diff to `app/_layout.tsx` (and the Maestro flow only if a boot-env assertion step is added); do not touch `chat-runs.ts` or the Zero schema

## Specification

**Objective:** Detach ConvexProvider/ConvexReactClient/convex-react from the app/_layout.tsx cold-boot reference path so the Expo app boots on the Zero provider alone, proving the thin client-flip vertical (CAP-CUT-01) with EXPO_PUBLIC_CONVEX_URL unset.

**Success state:** An operator launches the reference Expo build on a named iOS Simulator with EXPO_PUBLIC_CONVEX_URL unset; the app cold-boots to a visible chat-screen with no red-box, and app/_layout.tsx contains zero convex/react imports on the boot path.

## Acceptance Criteria

### AC-1: Cold-boot to chat-screen without CONVEX_URL [PRIMARY]
**GIVEN:** the reference Expo build on a named iOS Simulator with EXPO_PUBLIC_CONVEX_URL unset and Zero/platform env pointed at the live fleet
**WHEN:** the operator launches the app via the Maestro reference flow
**THEN:** the app cold-boots to a visible chat-screen within 60s with no red-box and no missing-CONVEX_URL crash
**VERIFY:** `MAESTRO_APP_ID=$MAESTRO_APP_ID env -u EXPO_PUBLIC_CONVEX_URL maestro test --format junit --output .tmp/maestro-reference-flow/coldboot-01.xml .e2e/maestro/reference-flow.yaml`
**TEST_TIER:** e2e
**VERIFICATION_SERVICE:** maestro+expo+zero
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "e2e",
  "verification_service": "maestro+expo+zero",
  "negative_control": {
    "would_fail_if": [
      "ConvexProvider remains on the boot path and throws when no Convex URL is present",
      "app red-boxes on cold boot",
      "chat-screen never becomes visible (disconnect)",
      "boot depends on a stubbed/mock provider"
    ]
  },
  "evidence": { "artifact_type": "screenshot", "required_capture": true },
  "cases": [
    {
      "start_ref": "coldboot_build",
      "action": { "actor": "user", "steps": ["launchApp with EXPO_PUBLIC_CONVEX_URL unset"] },
      "end_state": {
        "must_observe": ["testID \"chat-screen\" visible within 60000ms", "screenshot file `reference-chat-scaffold.png` captured with file size > 0 bytes"],
        "must_not_observe": ["red-box error", "console/red-box text \"EXPO_PUBLIC_CONVEX_URL\"", "blank/never-mounts (0 visible screens)"]
      }
    }
  ]
}
```

### AC-2: Boot module free of convex/react, Zero provider retained
**GIVEN:** the edited app/_layout.tsx boot module
**WHEN:** the source is grepped for the Convex boot symbols and the Zero provider
**THEN:** there are zero convex/react imports and zero ConvexReactClient constructions, and ZeroProvider is still present
**VERIFY:** `! grep -Eq "convex/react|ConvexReactClient|ConvexProvider" app/_layout.tsx && grep -q "ZeroProvider" app/_layout.tsx`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** static-source-grep
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "static-source-grep",
  "negative_control": {
    "would_fail_if": [
      "ConvexProvider/ConvexReactClient still imported on the boot path",
      "ZeroProvider was removed instead of Convex (disconnect)"
    ]
  },
  "evidence": { "artifact_type": "stdout", "required_capture": true },
  "cases": [
    {
      "start_ref": "coldboot_build",
      "action": { "actor": "cli_user", "steps": ["grep -Ec \"convex/react|ConvexReactClient|ConvexProvider\" app/_layout.tsx", "grep -c \"ZeroProvider\" app/_layout.tsx"] },
      "end_state": {
        "must_observe": ["convex match count 0", "\"ZeroProvider\" present (count >= 1)"],
        "must_not_observe": ["any convex/react import line", "ZeroProvider count 0"]
      }
    }
  ]
}
```

### AC-3: Type-clean after Convex boot removal
**GIVEN:** the app with ConvexProvider removed from the cold-boot path
**WHEN:** the TypeScript project is type-checked
**THEN:** tsgo reports no errors introduced by the removal (no dangling convex/react boot import, no unused-symbol break)
**VERIFY:** `pnpm tsgo --noEmit`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** tsgo
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "tsgo",
  "negative_control": {
    "would_fail_if": [
      "a dangling convex import remains and fails resolution",
      "boot path references a removed ConvexReactClient symbol"
    ]
  },
  "evidence": { "artifact_type": "stdout", "required_capture": true },
  "cases": [
    {
      "start_ref": "coldboot_build",
      "action": { "actor": "cli_user", "steps": ["pnpm tsgo --noEmit"] },
      "end_state": {
        "must_observe": ["exit code 0", "0 TypeScript errors reported for app/_layout.tsx"],
        "must_not_observe": ["Cannot find module 'convex/react'", "TS error count >= 1 in app/_layout.tsx", "empty/start signature: 0 providers mounted"]
      }
    }
  ]
}
```

## Test Criteria

| ID | Statement | Maps to | Verify | Type |
|----|-----------|---------|--------|------|
| TC-1 | Maestro cold-boot with EXPO_PUBLIC_CONVEX_URL unset reaches a visible chat-screen and emits a passing JUnit result | AC-1 | `MAESTRO_APP_ID=$MAESTRO_APP_ID env -u EXPO_PUBLIC_CONVEX_URL maestro test --format junit --output .tmp/maestro-reference-flow/coldboot-01.xml .e2e/maestro/reference-flow.yaml` | happy_path |
| TC-2 | app/_layout.tsx has zero convex/react\|ConvexReactClient\|ConvexProvider matches and retains ZeroProvider | AC-2 | `! grep -Eq "convex/react\|ConvexReactClient\|ConvexProvider" app/_layout.tsx && grep -q "ZeroProvider" app/_layout.tsx` | structural |
| TC-3 | pnpm tsgo --noEmit exits 0 after the Convex boot removal | AC-3 | `pnpm tsgo --noEmit` | typecheck |

## Reading List

- `app/_layout.tsx` (1-19, 37-49, 137-171) — current provider tree: ZeroProvider already wraps ConvexProvider; remove the ConvexProvider/ConvexReactClient/convex-react layer while keeping ZeroProvider, SafeAreaProvider, QueryClientProvider, ThemeSync, and the Stack intact
- `.e2e/maestro/reference-flow.yaml` (1-18) — the cold-boot flow that must still pass; do not weaken the stable testIDs
- `.spec/prds/mk6-migration/08-uc-sync.md` (20-31) — UC-SYNC-01 AC for cold-start with the Zero provider replacing ConvexProvider
- `brain/docs/TESTING-HIERARCHY.md` — why PRIMARY is e2e against a real simulator, not a mocked provider
- `brain/docs/kanban/SCENARIO-CONTRACT-V1.md` — Mobile (Maestro) adapter conventions

## Guardrails

### WRITE-ALLOWED
- app/_layout.tsx (MODIFY)
- .e2e/maestro/reference-flow.yaml (MODIFY — only if a boot-env assertion step is needed)
- .tmp/maestro-reference-flow/** (NEW — JUnit + screenshot output)

### WRITE-PROHIBITED
- app/(drawer)/**/* except the reference chat route — the 44 remaining convex-hook screens are deferred to later UC-SYNC-01 tasks
- convex/** — decommission is a later sprint (UC-SYNC-05)
- services/platform/src/** — no backend change belongs in a provider-swap task

### Boundaries
- **always:** Prove the boot via a real Maestro run against the real fleet, Keep ZeroProvider/SafeAreaProvider/QueryClientProvider intact
- **ask_first:** Touching any of the 44 other convex/react call sites
- **never:** Adding a Convex URL fallback, Removing ZeroProvider

## Design

- **references:** (none — no design refs found for this PRD; provider-tree edit, not new visual UI)
- **pattern:** Provider composition edit — drop one wrapper layer, preserve sibling providers and child order
- **pattern_source:** app/_layout.tsx:137-171
- **anti_pattern:** Removing ZeroProvider or SafeAreaProvider by accident; adding a Convex URL fallback; globally deleting convex hooks in unrelated screens

## Agent Assignment

- **implementer:** react-native-ui-implementer — owns app/_layout.tsx provider tree and Expo boot flow
- **reviewer:** react-native-ui-reviewer — verifies provider composition, theme/testID compliance, and TDD evidence (RED cold-boot failure before GREEN)

## Verification Gates

- **AC-1 cold-boot e2e:** RED against boot-with-Convex first (watch the flow fail while ConvexProvider is still on the path), then `MAESTRO_APP_ID=$MAESTRO_APP_ID env -u EXPO_PUBLIC_CONVEX_URL maestro test .e2e/maestro/reference-flow.yaml` → Exit 0
- **AC-2 no-Convex-on-boot:** `! grep -Eq "convex/react|ConvexReactClient|ConvexProvider" app/_layout.tsx && grep -q "ZeroProvider" app/_layout.tsx` → Exit 0
- **AC-3 typecheck:** `pnpm tsgo --noEmit` → Exit 0
- **Lint:** `pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error app/_layout.tsx` → Exit 0
- **Scope compliance:** `git diff --name-only` → Subset of guardrails.write_allowed

## Coding Standards

- brain/docs/TESTING-HIERARCHY.md
- brain/docs/RED-FIRST-TEST-GATE.md
- brain/docs/kanban/SCENARIO-CONTRACT-V1.md
- RULES.md#react--react-native-rules

## Dependencies

- **depends_on:** —
- **blocks:** S-COLDBOOT-02

## Notes

Audit finding at planning time: `app/_layout.tsx:146` still wraps the tree in `<ConvexProvider>`/`ConvexReactClient` (line 39, import at line 7); `ZeroProvider` is already the outer wrapper. This is a removal, not a from-scratch swap. Do not touch the 44 other `convex/react` call sites elsewhere in the app.

<!-- REQUIREMENT-CONTRACT v1
-->
<!--
{
  "version": "1",
  "task_id": "S-COLDBOOT-01",
  "proposed_by": "react-native-ui-planner",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "coldboot_build": {
      "description": "Reference Expo build installed on a named iOS Simulator with EXPO_PUBLIC_CONVEX_URL UNSET and the Zero/platform env pointed at the running fleet (EXPO_PUBLIC_PLATFORM_URL, EXPO_PUBLIC_ZERO_CACHE_URL, EXPO_PUBLIC_ZERO_USER_ID, EXPO_PUBLIC_REFERENCE_CONVERSATION_ID set)",
      "seed_method": "cli",
      "records": [
        "iOS Simulator booted and named (MAESTRO_APP_ID resolvable)",
        "reference build installed with EXPO_PUBLIC_CONVEX_URL absent from the build env",
        "EXPO_PUBLIC_ZERO_CACHE_URL and EXPO_PUBLIC_PLATFORM_URL point at the live fleet"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN the reference Expo build on a named iOS Simulator with EXPO_PUBLIC_CONVEX_URL unset WHEN the operator launches via the Maestro reference flow THEN the app cold-boots to a visible chat-screen within 60s with no red-box",
      "verify": "MAESTRO_APP_ID=$MAESTRO_APP_ID env -u EXPO_PUBLIC_CONVEX_URL maestro test --format junit --output .tmp/maestro-reference-flow/coldboot-01.xml .e2e/maestro/reference-flow.yaml",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "maestro+expo+zero",
        "negative_control": {
          "would_fail_if": [
            "ConvexProvider remains on the boot path and throws when no Convex URL is present",
            "app red-boxes on cold boot",
            "chat-screen never becomes visible (disconnect)",
            "boot depends on a stubbed/mock provider"
          ]
        },
        "evidence": {
          "artifact_type": "screenshot",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "coldboot_build",
            "action": {
              "actor": "user",
              "steps": [
                "launchApp with EXPO_PUBLIC_CONVEX_URL unset"
              ]
            },
            "end_state": {
              "must_observe": [
                "testID \"chat-screen\" visible within 60000ms",
                "screenshot file `reference-chat-scaffold.png` captured with file size > 0 bytes"
              ],
              "must_not_observe": [
                "red-box error",
                "console/red-box text \"EXPO_PUBLIC_CONVEX_URL\"",
                "blank/never-mounts (0 visible screens)"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN the edited app/_layout.tsx WHEN grepped THEN zero convex/react|ConvexReactClient|ConvexProvider and ZeroProvider still present",
      "verify": "! grep -Eq \"convex/react|ConvexReactClient|ConvexProvider\" app/_layout.tsx && grep -q \"ZeroProvider\" app/_layout.tsx",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "static-source-grep",
        "negative_control": {
          "would_fail_if": [
            "ConvexProvider/ConvexReactClient still imported on the boot path",
            "ZeroProvider was removed instead of Convex (disconnect)"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "coldboot_build",
            "action": {
              "actor": "cli_user",
              "steps": [
                "grep -Ec \"convex/react|ConvexReactClient|ConvexProvider\" app/_layout.tsx",
                "grep -c \"ZeroProvider\" app/_layout.tsx"
              ]
            },
            "end_state": {
              "must_observe": [
                "convex match count 0",
                "\"ZeroProvider\" present (count >= 1)"
              ],
              "must_not_observe": [
                "any convex/react import line",
                "ZeroProvider count 0"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN ConvexProvider removed from boot WHEN type-checked THEN tsgo reports no new errors",
      "verify": "pnpm tsgo --noEmit",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "tsgo",
        "negative_control": {
          "would_fail_if": [
            "a dangling convex import remains and fails resolution",
            "boot path references a removed ConvexReactClient symbol"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "coldboot_build",
            "action": {
              "actor": "cli_user",
              "steps": [
                "pnpm tsgo --noEmit"
              ]
            },
            "end_state": {
              "must_observe": [
                "exit code 0",
                "0 TypeScript errors reported for app/_layout.tsx"
              ],
              "must_not_observe": [
                "Cannot find module 'convex/react'",
                "TS error count >= 1 in app/_layout.tsx",
                "empty/start signature: 0 providers mounted"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Maestro cold-boot without CONVEX_URL reaches chat-screen and passes JUnit",
      "verify": "MAESTRO_APP_ID=$MAESTRO_APP_ID env -u EXPO_PUBLIC_CONVEX_URL maestro test --format junit --output .tmp/maestro-reference-flow/coldboot-01.xml .e2e/maestro/reference-flow.yaml",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Boot module free of Convex symbols, ZeroProvider retained",
      "verify": "! grep -Eq \"convex/react|ConvexReactClient|ConvexProvider\" app/_layout.tsx && grep -q \"ZeroProvider\" app/_layout.tsx",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "tsgo clean after removal",
      "verify": "pnpm tsgo --noEmit",
      "maps_to_ac": "AC-3"
    }
  ]
}
-->
