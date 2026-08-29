# FUL-PLAT-011 — Publish and embed the dossier idempotently

> **Sprint:** [sprint-01-produce-one-trustworthy-candidate-dossier-on-self-owned-inference](./SPRINT.md) · **Wave:** H
> **Assignee:** mastra-implementer · **Reviewer:** mastra-reviewer
> **Priority:** P0 · **Points:** 3 · **Type:** FEATURE
> **Proposed by:** mastra-planner
> **TDD mode:** `red_first` · **RED_GREEN_REQUIRED:** yes
> Status: Backlog

## What this does

Put the committed dossier into holocron's own searchable corpus exactly once, embedded locally at 1024 dimensions and tagged so the loop cannot cite itself as independent evidence.

## Why

After publishing a Fulcrum run's dossier, documents holds exactly one row for that source_run_id with category fulcrum, its passages carry 1024-length embeddings, hybrid search returns it, a second publish returns created false with the same documentId, and a later retrieval of that document is marked self_sourced.

## How to verify

Primary acceptance criterion **AC-1** (integration tier, service: real Postgres holocron_nonprod documents/passages tables + live embed role behind the image-local LiteLLM router):

```
PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-dossier-publish.test.ts -t "AC-1"
```

Full gate set: 5 acceptance criteria, 6 test criteria, 5 verification gates.

## Scope

- packages/platform/src/mission/fulcrum/dossier-publish.ts (NEW)
- packages/platform/src/mission/fulcrum/self-sourced.ts (NEW)
- packages/platform/src/mission/document-publish.ts (MODIFY)
- packages/platform/tests/integration/fulcrum-dossier-publish.test.ts (NEW)

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

```
================================================================================
TASK: FUL-PLAT-011 - Publish and embed the dossier idempotently
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
POINTS:     3
AGENT:      implementer=mastra-implementer | reviewer=mastra-reviewer
SPRINT:     sprint-01-produce-one-trustworthy-candidate-dossier-on-self-owned-inference (wave H)
PROPOSED_BY:mastra-planner
TDD_MODE:   red_first
RED_GREEN_REQUIRED: yes

RUNTIME_COMMANDS:
  test:      pnpm test:integration
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error

PROGRESS: 0/5 ACs complete

--------------------------------------------------------------------------------
OUTCOME (observable success)
--------------------------------------------------------------------------------

After publishing a Fulcrum run's dossier, documents holds exactly one row for that source_run_id with category fulcrum, its passages carry 1024-length embeddings, hybrid search returns it, a second publish returns created false with the same documentId, and a later retrieval of that document is marked self_sourced.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier — read before acting)
--------------------------------------------------------------------------------

- MUST: Publish through the inherited publishDocumentForRun with category `fulcrum` and idempotencyKey derived from the run id.
- MUST: Embed the published body through the embed role and store passages with a 1024-length vector.
- MUST: Mark the published source self-sourced so provenance independence cannot count it as corroboration.
- NEVER: Never create a second documents row for a run that already has one.
- NEVER: Never store a null, all-zero, or wrong-dimension embedding, and never fall back to a cloud embedder.
- NEVER: Never send an embedding request to a chat role or a chat request to the embed role.
- NEVER: Never publish a dossier body that the renderer refused to produce.
- STRICTLY: Publish and embed are one logical step: a failed embed leaves no published row behind.
- STRICTLY: No mocked embedder and no recorded vectors — the embedding lane runs against the live embed role.

--------------------------------------------------------------------------------
CAPABILITY CHAIN
--------------------------------------------------------------------------------

touches_capabilities: CAP-PUBLISH-01
provides:             one documents row per Fulcrum run, idempotent on source_run_id, category fulcrum, 1024-dim local Qwen3 passage embeddings for the published dossier body, self-sourced tagging so a later SENSE retrieval grants the published dossier no independence credit
consumes:             deterministic candidate dossier Markdown (FUL-PLAT-010), single-transaction cycle commit and its runId (FUL-PLAT-009), provenance independence rules (FUL-PLAT-003), embed role attestation at 1024 dimensions (FUL-PLAT-007)
boundary_contracts:
  - Re-publishing a run updates the existing documents row rather than creating a duplicate — uniqueness is on source_run_id
  - The dossier body is embedded through the embed role at 1024 dimensions; an unavailable embedder fails the publish closed with no partial documents row
  - Published Fulcrum documents are tagged self-sourced so a later retrieval of them cannot corroborate a claim
  - The embed role receives only embedding calls; no chat role is asked to embed and the embedder is never used as a chat model

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------

- [ ] AC-1 (PRIMARY): Dossier publishes once and embeds at 1024 dimensions
- [ ] AC-2: Re-publishing the same run does not duplicate the document
- [ ] AC-3: Published dossiers are self-sourced and grant no independence credit
- [ ] AC-4: An unreachable embed role fails the publish closed
- [ ] AC-5: Only the embed role receives embedding calls
- [ ] pnpm test:integration passes + pnpm tsgo --noEmit clean
- [ ] Only writeAllowed files modified (git diff --name-only)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD Beads — ordered happy-path first)
--------------------------------------------------------------------------------

AC-1: Dossier publishes once and embeds at 1024 dimensions [PRIMARY]
  GIVEN: a rendered dossier exists for a committed run and the embed role is live
  WHEN:  the dossier is published for that run id
  THEN:  one documents row exists with category fulcrum and its passages carry 1024-length embeddings that hybrid search returns

  TEST_TIER:            integration
  VERIFICATION_SERVICE: real Postgres holocron_nonprod documents/passages tables + live embed role behind the image-local LiteLLM router
  FLOW_REF:             CAP-PUBLISH-01 hop: Markdown generator -> publishDocumentForRun -> documents insert -> hybrid/vector index on passages
  TDD_STATE:            none
  VERIFY:               PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-dossier-publish.test.ts -t "AC-1"

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             visible
    TOPOLOGY:         single-node
    SERVICE:          real Postgres holocron_nonprod + live embed role behind the image-local LiteLLM router
    NEGATIVE_CONTROL: would fail if the publish is a no-op that returns a documentId without writing a row; the embedding is an all-zero vector or a hardcoded 1024-length array; the embedder is disconnected and the publish still reports success; the document body is an empty string
    EVIDENCE:         db_query (required_capture=True)
    CASES:
      - START_REF: rendered_dossier_unpublished
        ACTOR:     cli_user
        STEP:      publish the rendered dossier for the committed runId through the Fulcrum publish path
        STEP:      query documents and passages for that source_run_id
        STEP:      run `holo search 'usage-based AI support automation gross margin' --json`
        MUST_OBSERVE:     1 documents row for that `source_run_id`
        MUST_OBSERVE:     `documents.category` = `fulcrum`
        MUST_OBSERVE:     the document body contains `Belief score: 0.62`
        MUST_OBSERVE:     every passage for that document has an `embedding` of length `1024`
        MUST_OBSERVE:     the `holo search` result set contains 1 hit whose `documentId` equals the published documentId
        MUST_OBSERVE:     at least 1 non-zero component in the stored embedding vector
        MUST_NOT_OBSERVE: 0 documents rows for that `source_run_id`
        MUST_NOT_OBSERVE: a passage with a null `embedding`
        MUST_NOT_OBSERVE: an embedding vector whose components are all `0`
        MUST_NOT_OBSERVE: an empty document body

AC-2: Re-publishing the same run does not duplicate the document
  GIVEN: the run's dossier has already been published once
  WHEN:  the same run is published a second time
  THEN:  the result reports created false with the same documentId and documents still holds one row for that run

  TEST_TIER:            integration
  VERIFICATION_SERVICE: real Postgres holocron_nonprod documents table
  FLOW_REF:             CAP-PUBLISH-01 boundary contract: re-publish updates rather than duplicates
  TDD_STATE:            none
  VERIFY:               PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-dossier-publish.test.ts -t "AC-2"

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             visible
    TOPOLOGY:         single-node
    SERVICE:          real Postgres holocron_nonprod documents table
    NEGATIVE_CONTROL: would fail if the source_run_id uniqueness is removed and a second row is written; the second publish returns created true because the read-back branch is a no-op; the second publish deletes and re-creates the row so the documentId changes
    EVIDENCE:         db_query (required_capture=True)
    CASES:
      - START_REF: dossier_already_published_once
        ACTOR:     cli_user
        STEP:      publish the same rendered dossier for the same runId a second time
        STEP:      count documents rows for that source_run_id and compare documentIds
        MUST_OBSERVE:     1 documents row for that `source_run_id`
        MUST_OBSERVE:     the second publish returns `created` = false
        MUST_OBSERVE:     the second `documentId` equals the first `documentId`
        MUST_NOT_OBSERVE: 2 documents rows for that `source_run_id`
        MUST_NOT_OBSERVE: the second publish returning `created` = true
        MUST_NOT_OBSERVE: 0 documents rows for that `source_run_id`

AC-3: Published dossiers are self-sourced and grant no independence credit
  GIVEN: a Fulcrum dossier has been published into the corpus
  WHEN:  a later SENSE retrieval returns that document and provenance independence is evaluated
  THEN:  the bound source is marked self_sourced and contributes no corroborating provenance group

  TEST_TIER:            integration
  VERIFICATION_SERVICE: real Postgres holocron_nonprod documents/sources/claim_evidence_bindings + real hybrid search
  FLOW_REF:             CAP-PUBLISH-01 failure mode: self-citation laundering prevented by the self-sourced tag
  TDD_STATE:            none
  VERIFY:               PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-dossier-publish.test.ts -t "AC-3"

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             holdout
    TOPOLOGY:         single-node
    SERVICE:          real Postgres holocron_nonprod + real hybrid search over the published document
    NEGATIVE_CONTROL: would fail if the self_sourced flag is absent so the published dossier corroborates its own claim; the tagging is a no-op that leaves the column null; the independence sweep is disconnected from the self_sourced column
    EVIDENCE:         db_query (required_capture=True)
    CASES:
      - START_REF: dossier_already_published_once
        ACTOR:     cli_user
        STEP:      run `holo search 'usage-based AI support automation gross margin' --json` and take the published document hit
        STEP:      register it as a source and bind it to the candidate's existing claim
        STEP:      evaluate provenance independence for that claim
        MUST_OBSERVE:     the registered source carries `self_sourced` = 1
        MUST_OBSERVE:     the independent provenance group count stays at 1
        MUST_OBSERVE:     the claim's `qualifying_grade` is unchanged at its pre-binding value
        MUST_NOT_OBSERVE: the registered source carrying `self_sourced` = 0
        MUST_NOT_OBSERVE: an independent provenance group count of 2
        MUST_NOT_OBSERVE: a null `self_sourced` value on the registered source

AC-4: An unreachable embed role fails the publish closed
  GIVEN: the embed role has no reachable backend
  WHEN:  the dossier publish runs
  THEN:  it fails with a named role-unavailable error and leaves no documents row

  TEST_TIER:            integration
  VERIFICATION_SERVICE: real Postgres holocron_nonprod + a real oMLX embedder stopped on both nodes
  FLOW_REF:             UC-LIS-04 degrade per role, never substitute — publish fails closed rather than storing a placeholder vector
  TDD_STATE:            none
  VERIFY:               PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-dossier-publish.test.ts -t "AC-4"

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             visible
    TOPOLOGY:         single-node
    SERVICE:          real Postgres holocron_nonprod + a real oMLX embedder stopped on both nodes
    NEGATIVE_CONTROL: would fail if an unreachable embedder yields an all-zero vector that is stored anyway; the publish writes the documents row first and the embed failure leaves it behind; the failure path is a no-op that substitutes a chat role for the disconnected embedder; a cloud embedder is used as a hardcoded fallback
    EVIDENCE:         stdout (required_capture=True)
    CASES:
      - START_REF: embed_role_unreachable
        ACTOR:     cli_user
        STEP:      stop the oMLX embedder on both nodes
        STEP:      publish the rendered dossier for the committed runId
        STEP:      query documents for that source_run_id
        MUST_OBSERVE:     error code `ROLE_UNAVAILABLE` naming role `embed`
        MUST_OBSERVE:     0 documents rows for that `source_run_id`
        MUST_OBSERVE:     the error message names the fleet endpoint `http://127.0.0.1:4545/v1` that refused the call
        MUST_NOT_OBSERVE: 1 documents row for that `source_run_id`
        MUST_NOT_OBSERVE: a stored embedding whose components are all `0`
        MUST_NOT_OBSERVE: a telemetry row naming a cloud embedder host

AC-5: Only the embed role receives embedding calls
  GIVEN: a publish plus a chat-bearing cycle have both run
  WHEN:  the durable telemetry rows are grouped by role and call kind
  THEN:  every embedding call carries role embed and no chat role carries an embedding call

  TEST_TIER:            integration
  VERIFICATION_SERVICE: real Postgres holocron_nonprod inference_telemetry rows + live image-local LiteLLM router
  FLOW_REF:             T-LIS-008: the embedder is used only for embedding, never as a chat role
  TDD_STATE:            none
  VERIFY:               PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-dossier-publish.test.ts -t "AC-5"

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             holdout
    TOPOLOGY:         single-node
    SERVICE:          real Postgres holocron_nonprod inference_telemetry rows + live image-local LiteLLM router
    NEGATIVE_CONTROL: would fail if the role-vs-callKind check is a no-op returning an empty violation list; an embedding call is issued on a chat role and the grouping is disconnected from the durable rows; the embed role is asked for a chat completion and nothing records it
    EVIDENCE:         db_query (required_capture=True)
    CASES:
      - START_REF: dossier_already_published_once
        ACTOR:     cli_user
        STEP:      run `holo telemetry:tail --run-id <runId> --json` for the published run
        STEP:      group the rows by `role` and by recorded call kind
        MUST_OBSERVE:     every row with a recorded embedding dimension carries `role` = `embed`
        MUST_OBSERVE:     at least 1 row with `role` = `embed` and dimension `1024`
        MUST_OBSERVE:     2 chat rows carrying `role` values `divergent` and `convergent`
        MUST_OBSERVE:     0 rows pairing `role` = `divergent` with an embedding dimension
        MUST_NOT_OBSERVE: a row pairing `role` = `embed` with a chat completion
        MUST_NOT_OBSERVE: 0 rows with `role` = `embed`
        MUST_NOT_OBSERVE: a row with `role` = `judge`

--------------------------------------------------------------------------------
TEST CRITERIA (boolean — each maps to an AC)
--------------------------------------------------------------------------------

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 |  | AC-1 | `PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-dossier-publish.test.ts -t "TC-1"` |
| TC-2 |  | AC-1 | `PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-dossier-publish.test.ts -t "TC-2"` |
| TC-3 |  | AC-2 | `PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-dossier-publish.test.ts -t "TC-3"` |
| TC-4 |  | AC-3 | `PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-dossier-publish.test.ts -t "TC-4"` |
| TC-5 |  | AC-4 | `PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-dossier-publish.test.ts -t "TC-5"` |
| TC-6 |  | AC-5 | `PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-dossier-publish.test.ts -t "TC-6"` |

--------------------------------------------------------------------------------
SCOPE (file-level write permissions)
--------------------------------------------------------------------------------

writeAllowed:
- packages/platform/src/mission/fulcrum/dossier-publish.ts (NEW)
- packages/platform/src/mission/fulcrum/self-sourced.ts (NEW)
- packages/platform/src/mission/document-publish.ts (MODIFY)
- packages/platform/tests/integration/fulcrum-dossier-publish.test.ts (NEW)

writeProhibited:
- packages/platform/src/mission/fulcrum/dossier-render.ts — owned by FUL-PLAT-010; this task consumes its output
- packages/platform/src/inference/** and packages/platform/src/fleet/** — owned by FUL-PLAT-007
- packages/platform/src/db/schema/** — owned by FUL-PLAT-001
- packages/platform/src/cli/holo.ts — owned by FUL-PLAT-012
- Any file not listed in write_allowed
- Any file not explicitly listed above

--------------------------------------------------------------------------------
CODE PATTERN
--------------------------------------------------------------------------------

Source: packages/platform/src/mission/document-publish.ts:60-128 + packages/platform/src/inference/embed.ts:88-130

Embed-then-publish inside one logical step, with the conflict/read-back publish providing idempotency and the RoleUnavailableError from embed() providing the fail-closed edge.

ANTI-PATTERN: Writing the documents row first and embedding afterwards — an embedder outage then leaves a published, unsearchable document that later reads as success.

References:
- .spec/prds/fulcrum/09-technical-requirements/08-capability-chains.md#CAP-PUBLISH-01 — real-service proof: two cycles on one candidate against real Postgres, one documents row, updated, 1024-dim embedded, searchable, later retrieval tagged self-sourced
- .spec/prds/fulcrum/09-technical-requirements/03-data-schema.md#d-publish — publishDocumentForRun with category 'fulcrum', idempotent on source_run_id, no Convex hop

Notes:
- P
- u
- b
- l
- i
- s
- h
-  
- i
- s
-  
- t
- h
- e
-  
- o
- n
- e
-  
- h
- o
- p
-  
- t
- h
- a
- t
-  
- m
- a
- k
- e
- s
-  
- t
- h
- e
-  
- l
- o
- o
- p
-  
- f
- e
- e
- d
-  
- t
- h
- e
-  
- a
- r
- c
- h
- i
- v
- e
-  
- i
- t
-  
- r
- e
- a
- d
- s
- .
-  
- E
- m
- b
- e
- d
- d
- i
- n
- g
-  
- r
- u
- n
- s
-  
- b
- e
- f
- o
- r
- e
-  
- t
- h
- e
-  
- d
- o
- c
- u
- m
- e
- n
- t
- s
-  
- r
- o
- w
-  
- i
- s
-  
- c
- o
- m
- m
- i
- t
- t
- e
- d
-  
- s
- o
-  
- a
- n
-  
- e
- m
- b
- e
- d
- d
- e
- r
-  
- o
- u
- t
- a
- g
- e
-  
- c
- a
- n
- n
- o
- t
-  
- l
- e
- a
- v
- e
-  
- a
- n
-  
- u
- n
- e
- m
- b
- e
- d
- d
- e
- d
-  
- p
- u
- b
- l
- i
- s
- h
- e
- d
-  
- d
- o
- c
- u
- m
- e
- n
- t
-  
- b
- e
- h
- i
- n
- d
- .

--------------------------------------------------------------------------------
READING LIST (max 5 — canonical pattern first)
--------------------------------------------------------------------------------

1. packages/platform/src/mission/document-publish.ts
   - Lines: 36-128
   - Focus: [PRIMARY PATTERN] publishDocumentForRun — INSERT … ON CONFLICT (source_run_id) DO NOTHING plus read-back, empty-content refusal, soak fence. Fulcrum passes category 'fulcrum' and the run-derived idempotency key
2. packages/platform/src/inference/embed.ts
   - Lines: 80-130
   - Focus: embed(text, mode) through runFleetModelCall with callKind embedding — refuses empty/null vectors and raises RoleUnavailableError; never returns a zero vector
3. packages/platform/src/inference/embed-run.ts
   - Lines: 1-120
   - Focus: Idempotent re-embed pattern (WHERE embedding IS NULL … SKIP LOCKED) and the 1024-dimension expectation
4. packages/platform/src/db/schema/evidence.ts
   - Lines: 55-90
   - Focus: passages.embedding vector(1024) with the HNSW cosine index the published body must populate
5. packages/platform/tests/integration/embed-helper.test.ts
   - Lines: 1-120
   - Focus: Integration-lane pattern for asserting real 1024-dim vectors from the live embed role

--------------------------------------------------------------------------------
AGENT INSTRUCTIONS (TDD Flow)
--------------------------------------------------------------------------------

FOR EACH ACCEPTANCE CRITERION, in order:

  RED    — write ONE test exercising GIVEN-WHEN-THEN against the REAL service named in
           VERIFICATION_SERVICE. Run it. It must FAIL (fail, not error) against the
           start state. Capture the failure output. Write NO implementation code.
  GREEN  — write the MINIMAL code that turns that test green. Nothing beyond the AC.
  REFACTOR — improve without introducing new behavior. Tests stay green.

  The RED proof must be observed against the scenario's start state — a test that
  passes without the seeded behavior present is a FAIL, not a pass.

--------------------------------------------------------------------------------
VERIFICATION GATES
--------------------------------------------------------------------------------

Gate 1:
  Command:  PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-dossier-publish.test.ts
  Expected: Exit 0

Gate 2:
  Command:  pnpm test:integration
  Expected: Exit 0

Gate 3:
  Command:  pnpm tsgo --noEmit
  Expected: Exit 0

Gate 4:
  Command:  pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error packages/platform/src/mission packages/platform/tests/integration/fulcrum-dossier-publish.test.ts
  Expected: Exit 0

Gate 5:
  Command:  pnpm test:lanes
  Expected: Exit 0

Gate S: Scenario is un-fakeable (PRIMARY) — supersedes 'Exit 0' as the bar for done.
  Verify: validate_scenario.py passes on the PRIMARY AC scenario (exit 0).
  Verify: RED-against-start observed and recorded before green.
  Verify: captured evidence shows the seeded MUST_OBSERVE value, not merely 'tests passed'.

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------

Implementer: mastra-implementer
Rationale:   Wires the rendered dossier into the inherited publishDocumentForRun path and the local 1024-dim embed role, with idempotency proven on real Postgres and embedding proven against the live fleet. Reviewer: mastra-reviewer (idempotency, self-sourced tagging, no zero-vector fallback).
Reviewer:    mastra-reviewer

--------------------------------------------------------------------------------
CODING STANDARDS
--------------------------------------------------------------------------------

- Reuse publishDocumentForRun — do not write a second publish path
- Never accept a null, empty, or all-zero embedding; propagate RoleUnavailableError
- Idempotency key is derived from the run id, never from wall-clock entropy
- Tag self-sourced at write time so independence evaluation needs no special case later

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------

Depends on: FUL-PLAT-003, FUL-PLAT-007, FUL-PLAT-009, FUL-PLAT-010
Blocks:     FUL-PLAT-012
Wave:       H

--------------------------------------------------------------------------------
REVIEW
--------------------------------------------------------------------------------

Must pass:
- One test per AC; tests verify behavior, not implementation
- RED evidence present for every AC before its GREEN
- PRIMARY AC scenario passes validate_scenario (exit 0), evidence artifact captured
- Minimal implementation; no gold-plating
- SCOPE respected (git diff --name-only ⊆ writeAllowed)

Verdict: [APPROVED | NEEDS_FIXES]

================================================================================
```

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "FUL-PLAT-011",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "rendered_dossier_unpublished": {
      "description": "One Fulcrum cycle has committed and its dossier Markdown has been rendered to disk, but nothing has been published for that run id yet",
      "seed_method": "cli",
      "records": [
        "`holo fulcrum '<goal>' --idempotency-key fulcrum-human-gate-01 --json` has committed and returned runId and candidateId",
        "`.holocron/fulcrum/dossiers/{candidateId}.md` exists and contains `Belief score: 0.62`",
        "documents holds 0 rows for that `source_run_id`",
        "the live embed role answers `holo probe:capabilities --json` with 1024-dim coverage"
      ]
    },
    "dossier_already_published_once": {
      "description": "The same run's dossier has already been published once, leaving one documents row and its embedded passages",
      "seed_method": "cli",
      "records": [
        "documents holds 1 row for that `source_run_id` with `category` = `fulcrum`",
        "passages holds at least 1 row for that document with a 1024-length `embedding`",
        "the first publish returned `created` = true and a documentId"
      ]
    },
    "embed_role_unreachable": {
      "description": "The same rendered dossier is ready to publish but the embed role has no reachable backend behind the image-local router",
      "seed_method": "cli",
      "records": [
        "`.holocron/fulcrum/dossiers/{candidateId}.md` exists and contains `Belief score: 0.62`",
        "the oMLX process serving the embedder is stopped on both nodes",
        "documents holds 0 rows for that `source_run_id`"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN a rendered dossier exists for a committed run and the embed role is live WHEN the dossier is published for that run id THEN one documents row exists with category fulcrum and its passages carry 1024-length embeddings that hybrid search returns",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-dossier-publish.test.ts -t \"AC-1\"",
      "maps_to_ac": null,
      "test_tier": "integration",
      "verification_service": "real Postgres holocron_nonprod documents/passages tables + live embed role behind the image-local LiteLLM router",
      "unit_test_justified": null,
      "scenario": {
        "id": "SC-FUL-PLAT-011-1",
        "primary": true,
        "tier": "visible",
        "test_tier": "integration",
        "topology": "single-node",
        "verification_service": "real Postgres holocron_nonprod + live embed role behind the image-local LiteLLM router",
        "negative_control": {
          "would_fail_if": [
            "the publish is a no-op that returns a documentId without writing a row",
            "the embedding is an all-zero vector or a hardcoded 1024-length array",
            "the embedder is disconnected and the publish still reports success",
            "the document body is an empty string"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "rendered_dossier_unpublished",
            "action": {
              "actor": "cli_user",
              "steps": [
                "publish the rendered dossier for the committed runId through the Fulcrum publish path",
                "query documents and passages for that source_run_id",
                "run `holo search 'usage-based AI support automation gross margin' --json`"
              ]
            },
            "end_state": {
              "must_observe": [
                "1 documents row for that `source_run_id`",
                "`documents.category` = `fulcrum`",
                "the document body contains `Belief score: 0.62`",
                "every passage for that document has an `embedding` of length `1024`",
                "the `holo search` result set contains 1 hit whose `documentId` equals the published documentId",
                "at least 1 non-zero component in the stored embedding vector"
              ],
              "must_not_observe": [
                "0 documents rows for that `source_run_id`",
                "a passage with a null `embedding`",
                "an embedding vector whose components are all `0`",
                "an empty document body"
              ]
            }
          }
        ]
      },
      "satisfied": null,
      "evidence": null,
      "remediation": null,
      "last_evaluated_cycle": null,
      "last_evaluated_commit": null
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN the run's dossier has already been published once WHEN the same run is published a second time THEN the result reports created false with the same documentId and documents still holds one row for that run",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-dossier-publish.test.ts -t \"AC-2\"",
      "maps_to_ac": null,
      "test_tier": "integration",
      "verification_service": "real Postgres holocron_nonprod documents table",
      "unit_test_justified": null,
      "scenario": {
        "id": "SC-FUL-PLAT-011-2",
        "primary": false,
        "tier": "visible",
        "test_tier": "integration",
        "topology": "single-node",
        "verification_service": "real Postgres holocron_nonprod documents table",
        "negative_control": {
          "would_fail_if": [
            "the source_run_id uniqueness is removed and a second row is written",
            "the second publish returns created true because the read-back branch is a no-op",
            "the second publish deletes and re-creates the row so the documentId changes"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "dossier_already_published_once",
            "action": {
              "actor": "cli_user",
              "steps": [
                "publish the same rendered dossier for the same runId a second time",
                "count documents rows for that source_run_id and compare documentIds"
              ]
            },
            "end_state": {
              "must_observe": [
                "1 documents row for that `source_run_id`",
                "the second publish returns `created` = false",
                "the second `documentId` equals the first `documentId`"
              ],
              "must_not_observe": [
                "2 documents rows for that `source_run_id`",
                "the second publish returning `created` = true",
                "0 documents rows for that `source_run_id`"
              ]
            }
          }
        ]
      },
      "satisfied": null,
      "evidence": null,
      "remediation": null,
      "last_evaluated_cycle": null,
      "last_evaluated_commit": null
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN a Fulcrum dossier has been published into the corpus WHEN a later SENSE retrieval returns that document and provenance independence is evaluated THEN the bound source is marked self_sourced and contributes no corroborating provenance group",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-dossier-publish.test.ts -t \"AC-3\"",
      "maps_to_ac": null,
      "test_tier": "integration",
      "verification_service": "real Postgres holocron_nonprod documents/sources/claim_evidence_bindings + real hybrid search",
      "unit_test_justified": null,
      "scenario": {
        "id": "SC-FUL-PLAT-011-3",
        "primary": false,
        "tier": "holdout",
        "test_tier": "integration",
        "topology": "single-node",
        "verification_service": "real Postgres holocron_nonprod + real hybrid search over the published document",
        "negative_control": {
          "would_fail_if": [
            "the self_sourced flag is absent so the published dossier corroborates its own claim",
            "the tagging is a no-op that leaves the column null",
            "the independence sweep is disconnected from the self_sourced column"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "dossier_already_published_once",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run `holo search 'usage-based AI support automation gross margin' --json` and take the published document hit",
                "register it as a source and bind it to the candidate's existing claim",
                "evaluate provenance independence for that claim"
              ]
            },
            "end_state": {
              "must_observe": [
                "the registered source carries `self_sourced` = 1",
                "the independent provenance group count stays at 1",
                "the claim's `qualifying_grade` is unchanged at its pre-binding value"
              ],
              "must_not_observe": [
                "the registered source carrying `self_sourced` = 0",
                "an independent provenance group count of 2",
                "a null `self_sourced` value on the registered source"
              ]
            }
          }
        ]
      },
      "satisfied": null,
      "evidence": null,
      "remediation": null,
      "last_evaluated_cycle": null,
      "last_evaluated_commit": null
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN the embed role has no reachable backend WHEN the dossier publish runs THEN it fails with a named role-unavailable error and leaves no documents row",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-dossier-publish.test.ts -t \"AC-4\"",
      "maps_to_ac": null,
      "test_tier": "integration",
      "verification_service": "real Postgres holocron_nonprod + a real oMLX embedder stopped on both nodes",
      "unit_test_justified": null,
      "scenario": {
        "id": "SC-FUL-PLAT-011-4",
        "primary": false,
        "tier": "visible",
        "test_tier": "integration",
        "topology": "single-node",
        "verification_service": "real Postgres holocron_nonprod + a real oMLX embedder stopped on both nodes",
        "negative_control": {
          "would_fail_if": [
            "an unreachable embedder yields an all-zero vector that is stored anyway",
            "the publish writes the documents row first and the embed failure leaves it behind",
            "the failure path is a no-op that substitutes a chat role for the disconnected embedder",
            "a cloud embedder is used as a hardcoded fallback"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "embed_role_unreachable",
            "action": {
              "actor": "cli_user",
              "steps": [
                "stop the oMLX embedder on both nodes",
                "publish the rendered dossier for the committed runId",
                "query documents for that source_run_id"
              ]
            },
            "end_state": {
              "must_observe": [
                "error code `ROLE_UNAVAILABLE` naming role `embed`",
                "0 documents rows for that `source_run_id`",
                "the error message names the fleet endpoint `http://127.0.0.1:4545/v1` that refused the call"
              ],
              "must_not_observe": [
                "1 documents row for that `source_run_id`",
                "a stored embedding whose components are all `0`",
                "a telemetry row naming a cloud embedder host"
              ]
            }
          }
        ]
      },
      "satisfied": null,
      "evidence": null,
      "remediation": null,
      "last_evaluated_cycle": null,
      "last_evaluated_commit": null
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN a publish plus a chat-bearing cycle have both run WHEN the durable telemetry rows are grouped by role and call kind THEN every embedding call carries role embed and no chat role carries an embedding call",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-dossier-publish.test.ts -t \"AC-5\"",
      "maps_to_ac": null,
      "test_tier": "integration",
      "verification_service": "real Postgres holocron_nonprod inference_telemetry rows + live image-local LiteLLM router",
      "unit_test_justified": null,
      "scenario": {
        "id": "SC-FUL-PLAT-011-5",
        "primary": false,
        "tier": "holdout",
        "test_tier": "integration",
        "topology": "single-node",
        "verification_service": "real Postgres holocron_nonprod inference_telemetry rows + live image-local LiteLLM router",
        "negative_control": {
          "would_fail_if": [
            "the role-vs-callKind check is a no-op returning an empty violation list",
            "an embedding call is issued on a chat role and the grouping is disconnected from the durable rows",
            "the embed role is asked for a chat completion and nothing records it"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "dossier_already_published_once",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run `holo telemetry:tail --run-id <runId> --json` for the published run",
                "group the rows by `role` and by recorded call kind"
              ]
            },
            "end_state": {
              "must_observe": [
                "every row with a recorded embedding dimension carries `role` = `embed`",
                "at least 1 row with `role` = `embed` and dimension `1024`",
                "2 chat rows carrying `role` values `divergent` and `convergent`",
                "0 rows pairing `role` = `divergent` with an embedding dimension"
              ],
              "must_not_observe": [
                "a row pairing `role` = `embed` with a chat completion",
                "0 rows with `role` = `embed`",
                "a row with `role` = `judge`"
              ]
            }
          }
        ]
      },
      "satisfied": null,
      "evidence": null,
      "remediation": null,
      "last_evaluated_cycle": null,
      "last_evaluated_commit": null
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "primary": false,
      "description": "The documents row count for the source_run_id equals one after the first publish",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-dossier-publish.test.ts -t \"TC-1\"",
      "maps_to_ac": "AC-1",
      "satisfied": null,
      "evidence": null,
      "remediation": null,
      "last_evaluated_cycle": null,
      "last_evaluated_commit": null
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "primary": false,
      "description": "Every stored passage embedding for the published document has length 1024",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-dossier-publish.test.ts -t \"TC-2\"",
      "maps_to_ac": "AC-1",
      "satisfied": null,
      "evidence": null,
      "remediation": null,
      "last_evaluated_cycle": null,
      "last_evaluated_commit": null
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "primary": false,
      "description": "The second publish returns created false when the run already has a published document",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-dossier-publish.test.ts -t \"TC-3\"",
      "maps_to_ac": "AC-2",
      "satisfied": null,
      "evidence": null,
      "remediation": null,
      "last_evaluated_cycle": null,
      "last_evaluated_commit": null
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "primary": false,
      "description": "The independent provenance group count is unchanged when a published Fulcrum document is bound to its own claim",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-dossier-publish.test.ts -t \"TC-4\"",
      "maps_to_ac": "AC-3",
      "satisfied": null,
      "evidence": null,
      "remediation": null,
      "last_evaluated_cycle": null,
      "last_evaluated_commit": null
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "primary": false,
      "description": "The documents row count stays zero when the embed role is unreachable during publish",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-dossier-publish.test.ts -t \"TC-5\"",
      "maps_to_ac": "AC-4",
      "satisfied": null,
      "evidence": null,
      "remediation": null,
      "last_evaluated_cycle": null,
      "last_evaluated_commit": null
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "primary": false,
      "description": "No telemetry row pairs a chat role with a recorded embedding dimension after a publish and a cycle",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-dossier-publish.test.ts -t \"TC-6\"",
      "maps_to_ac": "AC-5",
      "satisfied": null,
      "evidence": null,
      "remediation": null,
      "last_evaluated_cycle": null,
      "last_evaluated_commit": null
    }
  ]
}
-->

</details>

## Acceptance Criteria

- [ ] AC-1 (PRIMARY): Dossier publishes once and embeds at 1024 dimensions
- [ ] AC-2: Re-publishing the same run does not duplicate the document
- [ ] AC-3: Published dossiers are self-sourced and grant no independence credit
- [ ] AC-4: An unreachable embed role fails the publish closed
- [ ] AC-5: Only the embed role receives embedding calls
