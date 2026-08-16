# S33-PLAT-04: Flip the data plane convex-to-postgres behind a fail-closed corpus-truth precondition (410 becomes a real document, never a silent wrong answer)

> Status: Backlog
> Assignee: mastra-implementer
> Priority: P0
> Type: FEATURE
> Effort: M · 195 min
> Sprint: sprint-33-fleet-routing-and-deployed-service-restoration
> Proposed By: mastra-planner
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes
> Depends on: MK6-DATA-001
> Blocks: S33-MCP-*:get_document behavior across the data-plane flip

## Outcome

The deployed runtime reports data_plane convex from the durable secrets file while convex/ was deleted from the repo in e02104c9 — an ancestor of the running image. data-plane-content.ts:38-48 fails closed with HTTP 410 without ever querying Postgres, so GET /api/documents/:id (hono-app.ts:383) and the MCP get_document tool both return that 410. Provide a forward flip to postgres gated on proof the migrated corpus is real, so the 410 becomes a correct answer rather than a confident wrong one.

**Success state:** A holo cutover:flip-data-plane invocation runs the MK6-DATA-001 corpus proof and, on success, writes HOLO_DATA_PLANE=postgres + HOLO_ROLLBACK_TARGET=postgres durably. GET /api/documents/{real-id} against the deployed service then returns 200 with a title differing from the pre-captured value in exactly 0 bytes. With the corpus proof failing, the same command exits non-zero with DATA_PLANE_CORPUS_UNPROVEN and leaves the plane at convex, where the same GET still returns 410.

## Critical Constraints

**MUST**

- The forward flip must refuse to write HOLO_DATA_PLANE=postgres unless the MK6-DATA-001 corpus proof passes at flip time, exiting with a named code (DATA_PLANE_CORPUS_UNPROVEN).
- The flip must write the durable control plane through the existing writeDurableDataPlane() path so the change is picked up by the fresh per-request re-read — not by a restart.
- After the flip, GET /api/documents/:id for a real migrated document must return HTTP 200 with that document's real title from Postgres.
- The flip must be idempotent: re-running when the plane is already postgres exits 0 with already_flipped:true and does not rewrite the control plane.

**NEVER**

- Never weaken or delete the plane==='convex' -> HTTP 410 retired_cloud_plane_removed_d08_02 branch in data-plane-content.ts. That branch IS the negative control that proves the flip happened; removing it makes a 200 unfalsifiable.
- Never flip by deleting the HOLO_DATA_PLANE key so the null path falls through to Postgres — the plane must be explicitly postgres, because an absent value cannot be audited or rolled back.
- Never flip onto a Postgres that has not passed the corpus proof. A wrong 200 is strictly worse than the current honest 410.
- Never fabricate, seed, or hand-write the real migrated document used as evidence — it must be a row that already exists in the deployed corpus. Do NOT replace the byte-comparison oracle with a hardcoded title; that would destroy the discovered-not-seeded property that makes this task honest.

**STRICTLY**

- Business logic lives in services/platform/src/cutover/data-plane-flip.ts. The holo.ts change is a thin dispatch only — no flip logic in the CLI switch.
- If MK6-DATA-001 has not landed and scripts/verify-mk6-data-plane-truth.sh does not exist, this task is BLOCKED. Record the blocker; do NOT write a placeholder verifier and do NOT flip.

## Acceptance Criteria

### AC-1 — The flip refuses when the migrated corpus is not proven

- **GIVEN** The durable control plane is at convex and the MK6-DATA-001 corpus proof does not pass
- **WHEN** The forward-flip command runs
- **THEN** It exits non-zero with DATA_PLANE_CORPUS_UNPROVEN, the durable control plane is still convex, and the document GET still returns 410
- **Verify:** `PLATFORM_IT=1 S33_FLIP_NEGATIVE=corpus-unproven bash scripts/verify-s33-data-plane-flip.sh --json`
- **Tier:** integration · **Service:** postgres-hono · **Flow:** UC-SYNC-04
- **Scenario:** topology `single-node` · evidence `stdout` · negative control: stub, static, mock, empty

### AC-2 — With the corpus proven, the flip lands and the document read returns real Postgres content

- **GIVEN** The MK6-DATA-001 corpus proof passes and a real migrated document id and title were captured before the flip
- **WHEN** The forward-flip command runs and then GET /api/documents/{document_id} is issued against the deployed service
- **THEN** The control plane reads postgres, the response is HTTP 200 with source postgres, and the returned title differs from the pre-captured title in exactly 0 bytes
- **Verify:** `PLATFORM_IT=1 bash scripts/verify-s33-data-plane-flip.sh --json`
- **Tier:** e2e · **Service:** deployed-holocron-documents · **Flow:** UC-SYNC-03
- **Scenario:** topology `single-node` · evidence `api_response` · negative control: disconnect, stub, empty, static

### AC-3 — The flip is idempotent and the convex-to-410 branch survives untouched

- **GIVEN** The control plane is already at postgres
- **WHEN** The forward-flip command is run a second time, and separately the control plane is re-pointed to convex via the existing rollback CLI
- **THEN** The re-run exits 0 with already_flipped true and does not rewrite the control plane; and after re-pointing to convex the document read returns 410 again
- **Verify:** `PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-04-data-plane-flip.test.ts`
- **Tier:** integration · **Service:** postgres-hono · **Flow:** UC-SYNC-04
- **Scenario:** topology `single-node` · evidence `db_query` · negative control: stub, static, mock

## Test Criteria

| ID | Statement | Maps | Verify |
|---|---|---|---|
| TC-1 | An unproven corpus makes the flip exit non-zero with DATA_PLANE_CORPUS_UNPROVEN and leaves the plane at convex. | AC-1 | `PLATFORM_IT=1 S33_FLIP_NEGATIVE=corpus-unproven bash scripts/verify-s33-data-plane-flip.sh --json` |
| TC-2 | Before the flip, the document GET returns 410 — the start state is proven, not assumed. | AC-2 | `PLATFORM_IT=1 bash scripts/verify-s33-data-plane-flip.sh --json` |
| TC-3 | After the flip, the document GET returns 200 with 0 differing bytes against the pre-captured title. | AC-2 | `PLATFORM_IT=1 bash scripts/verify-s33-data-plane-flip.sh --json` |
| TC-4 | A second flip run is a no-op reporting already_flipped true with an unchanged control plane. | AC-3 | `PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-04-data-plane-flip.test.ts` |
| TC-5 | Re-pointing to convex restores the 410, proving the fail-closed branch still exists. | AC-3 | `PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-04-data-plane-flip.test.ts` |

## Fixtures

**`migrated_corpus_document`** — One real row that already exists in the deployed holocron Postgres documents table, discovered rather than seeded. Its id and title are captured to evidence BEFORE the flip so the post-flip 200 can be compared against a value the test did not author. _(seed: cli)_

- SELECT id::text, title FROM documents ORDER BY date DESC NULLS LAST LIMIT 1 against the deployed database
- captured: document_id as a UUID, document_title as a string of length >= 1
- row is part of the migrated corpus proven by MK6-DATA-001; 0 rows inserted by this task

**`plane_convex_control`** — The durable control-plane state as it exists on the deployed host today, used as the pre-flip start state and re-established for the negative case via the real rollback-repoint CLI. _(seed: cli)_

- HOLO_DATA_PLANE: convex
- HOLO_ROLLBACK_TARGET: convex-frozen
- written via the existing cutover:rollback-repoint command; 0 hand edits to the secrets file

**`plane_postgres_control`** — The post-flip durable control-plane state produced by the new forward-flip command. _(seed: cli)_

- HOLO_DATA_PLANE: postgres
- HOLO_ROLLBACK_TARGET: postgres
- HOLO_ROLLBACK_ENGAGED_AT: ISO-8601 timestamp written at flip time

## Reading List

- `services/platform/src/cutover/data-plane-content.ts` (33-108) — The plane==='convex' -> 410 branch and the Postgres read that follows it. This branch must survive unchanged — it is the negative control.
- `services/platform/src/cutover/soak-fence.ts` (164-260) — readDurableDataPlane / resolveObservedDataPlane precedence (secrets -> env -> null) and writeDurableDataPlane — the forward flip writes through the latter.
- `services/platform/src/cutover/rollback-repoint.ts` (720-760) — The existing REVERSE repoint (postgres -> convex) — mirror its fail-closed shape, error-code style and report JSON for the forward direction.
- `services/platform/src/http/hono-app.ts` (378-400) — GET /api/documents/:id — the read path whose status flips from 410 to 200. No change expected; read it to confirm the status passthrough.
- `.spec/tasks/imp-mk6-functional-completeness-1786837297/MK6-DATA-001-data-plane-truth.md` (1-30) — The corpus-truth verifier contract and its negative mode — the precondition this flip executes. Note the file overlap on data-plane-content.ts and soak-fence.ts.

## Guardrails

**WRITE-ALLOWED**

- services/platform/src/cutover/data-plane-flip.ts (NEW)
- scripts/verify-s33-data-plane-flip.sh (NEW)
- services/platform/tests/integration/s33-plat-04-data-plane-flip.test.ts (NEW)
- services/platform/src/cli/holo.ts (MODIFY — thin command dispatch + help text only, no flip logic)

**WRITE-PROHIBITED**

- services/platform/src/cutover/data-plane-content.ts - the 410 branch is the negative control; MK6-DATA-001 also owns this file
- services/platform/src/cutover/soak-fence.ts - MK6-DATA-001 owns concurrent edits here; consume its exported API, do not modify it
- scripts/verify-mk6-data-plane-truth.sh - MK6-DATA-001 owns the corpus verifier; invoke it, never reimplement or stub it
- services/platform/src/mcp/** - mcp lane owns the get_document call site
- services/platform/deploy/** - devops lane

## Design

**References**

- services/platform/src/cutover/soak-fence.ts:236-249
- services/platform/src/cutover/rollback-repoint.ts:736
- services/platform/src/cutover/data-plane-content.ts:40-49

**Interaction notes**

- writeDurableDataPlane() already overlays process.env after writing the secrets file, and resolveObservedDataPlane() re-reads durably on every request — so the flip takes effect without a service restart. Verify that rather than assuming it.
- The corpus precondition must be EXECUTED at flip time (spawn scripts/verify-mk6-data-plane-truth.sh --json, parse exit code + JSON), not read from a stale artifact.
- Idempotency: read the observed plane first; if already postgres, return already_flipped:true without calling writeDurableDataPlane, so engaged_at is not clobbered.
- The title oracle compares against a value captured from the live database BEFORE the run. Record both the pre-captured title and the response title verbatim in evidence, plus their byte lengths and the differing-byte count, so the comparison is auditable after the fact.

**Pattern** — Gated state transition: execute the proof, write the durable control plane, then verify the observable effect through the real serving path — with the pre-transition failure mode preserved so the transition is falsifiable.

_Source:_ `services/platform/src/cutover/rollback-repoint.ts:700-760`

**Anti-pattern** — Flipping first and validating later. A 410 is a loud, correct refusal; a 200 backed by an unverified database is a silent wrong answer that will be believed. Equally wrong: fixing the 410 by deleting the convex branch — that removes the only evidence the flip did anything.

## Verification Gates

| Gate | Command | Expected |
|---|---|---|
| lint | `pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error services/platform/src/cutover/data-plane-flip.ts services/platform/src/cli/holo.ts services/platform/tests/integration/s33-plat-04-data-plane-flip.test.ts` | Exit 0 |
| typecheck | `pnpm tsgo --noEmit` | Exit 0 |
| unit | `pnpm test:unit` | Exit 0 |
| integration | `PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-04-data-plane-flip.test.ts` | Exit 0 |
| corpus-precondition | `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --json` | Exit 0 |
| flip-e2e | `PLATFORM_IT=1 bash scripts/verify-s33-data-plane-flip.sh --json` | Exit 0 |

## Agent Assignment

**mastra-implementer** — Adds a forward-flip module under src/cutover/ (this lane) plus a thin CLI dispatch, verified through the real deployed document read path. Needs real Postgres and the real deployed service — mastra-implementer TDD-against-real-services workflow.

## Coding Standards

- No z.any(); the flip report is a typed, Zod-validated JSON record.
- Error codes are stable greppable literals (DATA_PLANE_CORPUS_UNPROVEN, DATA_PLANE_ALREADY_POSTGRES) matching the existing cutover error-code style.
- Never write secrets or connection strings into the flip report or evidence — plane, target, timestamp and credential-free identity only.
- The CLI dispatch stays thin; all logic and all tests target the cutover module.

## Boundary Contracts

- HARD SEQUENCING SEAM: the flip may only succeed when the deployed Postgres corpus has been proven by MK6-DATA-001's verifier (PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --json). The precondition is EXECUTED at flip time — the flip command spawns the verifier and refuses on any non-zero exit. A cached green from a previous run is not proof about today's database.
- FILE OVERLAP: MK6-DATA-001 also edits services/platform/src/cutover/data-plane-content.ts and soak-fence.ts. These two tasks must not be in flight on those files simultaneously. MK6-DATA-001 lands first.
- DOWNSTREAM: the MCP get_document tool shares readDocumentFromObservedPlane (mcp/executor.ts:993), so it inherits this flip automatically. The mcp lane owns proving that behavior across both transports.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "S33-PLAT-04",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "migrated_corpus_document": {
      "description": "One real row that already exists in the deployed holocron Postgres documents table, discovered rather than seeded. Its id and title are captured to evidence BEFORE the flip so the post-flip 200 can be compared against a value the test did not author.",
      "seed_method": "cli",
      "records": [
        "SELECT id::text, title FROM documents ORDER BY date DESC NULLS LAST LIMIT 1 against the deployed database",
        "captured: document_id as a UUID, document_title as a string of length >= 1",
        "row is part of the migrated corpus proven by MK6-DATA-001; 0 rows inserted by this task"
      ]
    },
    "plane_convex_control": {
      "description": "The durable control-plane state as it exists on the deployed host today, used as the pre-flip start state and re-established for the negative case via the real rollback-repoint CLI.",
      "seed_method": "cli",
      "records": [
        "HOLO_DATA_PLANE: convex",
        "HOLO_ROLLBACK_TARGET: convex-frozen",
        "written via the existing cutover:rollback-repoint command; 0 hand edits to the secrets file"
      ]
    },
    "plane_postgres_control": {
      "description": "The post-flip durable control-plane state produced by the new forward-flip command.",
      "seed_method": "cli",
      "records": [
        "HOLO_DATA_PLANE: postgres",
        "HOLO_ROLLBACK_TARGET: postgres",
        "HOLO_ROLLBACK_ENGAGED_AT: ISO-8601 timestamp written at flip time"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN the plane at convex and a failing corpus proof WHEN the forward-flip runs THEN it exits non-zero with DATA_PLANE_CORPUS_UNPROVEN, the plane stays convex, and the document GET still returns 410.",
      "verify": "PLATFORM_IT=1 S33_FLIP_NEGATIVE=corpus-unproven bash scripts/verify-s33-data-plane-flip.sh --json",
      "scenario": {
        "id": "S33-PLAT-04/AC-1",
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres-hono",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub",
            "static",
            "mock",
            "empty"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "plane_convex_control",
            "action": {
              "actor": "operator",
              "steps": [
                "Confirm the durable control plane reads convex via the real resolveObservedDataPlane path.",
                "Point the flip command corpus proof at the MK6-DATA-001 negative target using the count-equal content-corrupt mode.",
                "Run the forward-flip command and capture exit code, stdout JSON, and the post-attempt control-plane state.",
                "Issue GET /api/documents/{document_id} against the real service and capture status and body."
              ]
            },
            "end_state": {
              "must_observe": [
                "exit code !== 0",
                "stdout JSON contains the literal error code `DATA_PLANE_CORPUS_UNPROVEN`",
                "resolveObservedDataPlane().data_plane === `convex` after the refused attempt",
                "GET /api/documents/{document_id} returns HTTP 410 with error === `retired_cloud_plane_removed_d08_02`"
              ],
              "must_not_observe": [
                "exit code 0 from the refused flip",
                "HOLO_DATA_PLANE written as `postgres`",
                "HTTP 200 from the document endpoint, or an empty error field on the flip report"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN a passing corpus proof and a pre-captured real document WHEN the flip runs and the document is requested THEN HTTP 200 with source postgres and a title byte-identical to the pre-captured value.",
      "verify": "PLATFORM_IT=1 bash scripts/verify-s33-data-plane-flip.sh --json",
      "scenario": {
        "id": "S33-PLAT-04/AC-2",
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "deployed-holocron-documents",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "disconnect",
            "stub",
            "empty",
            "static"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "migrated_corpus_document",
            "action": {
              "actor": "operator",
              "steps": [
                "Capture document_id and document_title directly from the deployed Postgres BEFORE the flip and write both to evidence.",
                "Confirm the pre-flip GET /api/documents/{document_id} returns HTTP 410 as the start-state proof.",
                "Run the forward-flip command with the real corpus proof enabled and capture its JSON.",
                "Re-issue GET /api/documents/{document_id} with the MCP bearer key and capture status and body.",
                "Compare the returned title against the pre-captured title."
              ]
            },
            "end_state": {
              "must_observe": [
                "pre-flip GET returned HTTP 410, establishing the start state rather than assuming it",
                "flip JSON reports data_plane === `postgres` and target === `postgres` with an engaged_at timestamp of length >= 20",
                "post-flip GET returns HTTP 200 with response.source === `postgres` and response.data_plane === `postgres`",
                "count of differing bytes between response.document.title and the pre-captured document_title === 0",
                "response.document.title byte length === the pre-captured title byte length, both recorded verbatim in evidence",
                "response.document.title length > 0",
                "response.document.id === the pre-captured document_id"
              ],
              "must_not_observe": [
                "HTTP 410 or the error `retired_cloud_plane_removed_d08_02` after the flip",
                "response.source === `convex`",
                "a HTTP 200 whose document body is null or whose title is an empty string",
                "a returned title differing from the pre-captured value"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN the plane already at postgres WHEN the flip re-runs THEN already_flipped true with no control-plane rewrite; and re-pointing to convex restores the 410 fail-closed branch.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-04-data-plane-flip.test.ts",
      "scenario": {
        "id": "S33-PLAT-04/AC-3",
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres-hono",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub",
            "static",
            "mock"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "plane_postgres_control",
            "action": {
              "actor": "mastra-implementer",
              "steps": [
                "With the plane at postgres, record the control-plane file mtime and contents.",
                "Re-run the forward-flip command, capture exit code and JSON, then re-read the file.",
                "Re-point to convex with the existing cutover:rollback-repoint CLI.",
                "Call readDocumentFromObservedPlane(document_id) through the real module and capture the result."
              ]
            },
            "end_state": {
              "must_observe": [
                "second run exit code === 0 with already_flipped === `true`",
                "control-plane contents unchanged byte-for-byte after the second run, with exactly 0 new engaged_at timestamps written",
                "after re-pointing to convex the read result has status === 410, ok === `false`, and error === `retired_cloud_plane_removed_d08_02`",
                "after re-pointing to convex, source === `convex` and document === null"
              ],
              "must_not_observe": [
                "control-plane contents differing in 1 or more bytes after the second run",
                "a second engaged_at timestamp overwriting the first",
                "an HTTP 200 result while the plane reads convex",
                "the convex branch returning a non-empty Postgres document"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "An unproven corpus makes the flip exit non-zero with DATA_PLANE_CORPUS_UNPROVEN and leaves the plane at convex.",
      "maps_to_ac": "AC-1",
      "verify": "PLATFORM_IT=1 S33_FLIP_NEGATIVE=corpus-unproven bash scripts/verify-s33-data-plane-flip.sh --json"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Before the flip, the document GET returns 410 \u2014 the start state is proven, not assumed.",
      "maps_to_ac": "AC-2",
      "verify": "PLATFORM_IT=1 bash scripts/verify-s33-data-plane-flip.sh --json"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "After the flip, the document GET returns 200 with 0 differing bytes against the pre-captured title.",
      "maps_to_ac": "AC-2",
      "verify": "PLATFORM_IT=1 bash scripts/verify-s33-data-plane-flip.sh --json"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "A second flip run is a no-op reporting already_flipped true with an unchanged control plane.",
      "maps_to_ac": "AC-3",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-04-data-plane-flip.test.ts"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "Re-pointing to convex restores the 410, proving the fail-closed branch still exists.",
      "maps_to_ac": "AC-3",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-04-data-plane-flip.test.ts"
    }
  ]
}
-->
