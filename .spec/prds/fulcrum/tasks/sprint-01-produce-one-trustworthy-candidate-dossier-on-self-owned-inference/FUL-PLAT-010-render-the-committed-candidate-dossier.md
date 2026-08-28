# FUL-PLAT-010 — Render the committed candidate dossier

> **Sprint:** [sprint-01-produce-one-trustworthy-candidate-dossier-on-self-owned-inference](./SPRINT.md) · **Wave:** G
> **Assignee:** mastra-implementer · **Reviewer:** mastra-reviewer
> **Priority:** P0 · **Points:** 3 · **Type:** FEATURE
> **Proposed by:** mastra-planner
> **TDD mode:** `red_first` · **RED_GREEN_REQUIRED:** yes
> Status: Backlog

## What this does

Turn one committed Fulcrum cycle into an operator-readable Markdown dossier that carries the full evidence chain and the router-truthful inference identity, deterministically and with no model in the path.

## Why

For a candidate with a committed belief score, .holocron/fulcrum/dossiers/{candidateId}.md contains `Admission: admitted`, `Verified quote: true`, a numeric `Belief score`, a numeric `Domain tier version`, the verbatim quote and its source URL, the requested roles `divergent` and `convergent`, two distinct resolved model identities, a serving backend of `inference1` or `inference2` for every chat stage, and `Embedding dimensions: 1024`.

## How to verify

Primary acceptance criterion **AC-1** (integration tier, service: real Postgres holocron_nonprod committed rows + real filesystem under .holocron/fulcrum/dossiers):

```
PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-dossier-render.test.ts -t "AC-1"
```

Full gate set: 5 acceptance criteria, 7 test criteria, 5 verification gates.

## Scope

- services/platform/src/mission/fulcrum/dossier-render.ts (NEW)
- services/platform/src/mission/fulcrum/dossier-sections.ts (NEW)
- services/platform/src/mission/fulcrum/dossier-schema.ts (NEW)
- services/platform/tests/integration/fulcrum-dossier-render.test.ts (NEW)

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

```
================================================================================
TASK: FUL-PLAT-010 - Render the committed candidate dossier
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
POINTS:     3
AGENT:      implementer=mastra-implementer | reviewer=mastra-reviewer
SPRINT:     sprint-01-produce-one-trustworthy-candidate-dossier-on-self-owned-inference (wave G)
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

For a candidate with a committed belief score, .holocron/fulcrum/dossiers/{candidateId}.md contains `Admission: admitted`, `Verified quote: true`, a numeric `Belief score`, a numeric `Domain tier version`, the verbatim quote and its source URL, the requested roles `divergent` and `convergent`, two distinct resolved model identities, a serving backend of `inference1` or `inference2` for every chat stage, and `Embedding dimensions: 1024`.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier — read before acting)
--------------------------------------------------------------------------------

- MUST: Render the literals `Admission:`, `Verified quote:`, `Belief score:`, `Domain tier version:` and `Embedding dimensions:` with values read from committed rows.
- MUST: Render the verbatim quote exactly as stored in claims.quote_text together with its bound sources.url.
- MUST: Render, per chat stage, the requested role, the resolved model identity and the serving backend recorded by the attestation.
- NEVER: Never call generateText, address a model role, or import an agent from the render path.
- NEVER: Never emit a dossier with a blank Belief score, a blank Domain tier version, or a placeholder quote.
- NEVER: Never re-truncate or re-normalize the stored quote text — it must round-trip byte-for-byte.
- NEVER: Never write outside .holocron/fulcrum/dossiers/ and the files listed in write_allowed.
- STRICTLY: The renderer takes typed row inputs validated by a closed Zod schema — no z.any().
- STRICTLY: No mocked Postgres: the renderer is proven against rows a real committed cycle wrote.

--------------------------------------------------------------------------------
CAPABILITY CHAIN
--------------------------------------------------------------------------------

touches_capabilities: CAP-PUBLISH-01, CAP-EVIDENCE-01
provides:             deterministic candidate dossier Markdown at .holocron/fulcrum/dossiers/{candidateId}.md, dossier surface literals: Admission, Verified quote, Belief score, Domain tier version, verbatim quote + source URL, requested roles, resolved model identities, serving backend per chat stage, Embedding dimensions, per-component score breakdown with contributing claims and UNKNOWN components
consumes:             single-transaction cycle commit (FUL-PLAT-009), router-truthful-serving-attestation (FUL-PLAT-007), deterministic belief score and domain tier version (FUL-PLAT-004), claim admission decision and verified quote (FUL-PLAT-002)
boundary_contracts:
  - The dossier is a pure function of committed Postgres state — the same committed ledger renders byte-identical Markdown on every invocation
  - Every rendered value is read from a committed row; no field is defaulted, invented, or filled from a model call
  - The render path contains no generateText call and addresses no model role
  - A candidate with no committed belief score is refused with a named error rather than rendered with blank fields

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------

- [ ] AC-1 (PRIMARY): Dossier renders the committed evidence chain and inference identity
- [ ] AC-2: Per-component breakdown shows contributing claims and UNKNOWN components
- [ ] AC-3: Re-render after a later commit replaces stale values in place
- [ ] AC-4: A candidate with no committed score is refused, not rendered blank
- [ ] AC-5: The render path is deterministic and model-free
- [ ] pnpm test:integration passes + pnpm tsgo --noEmit clean
- [ ] Only writeAllowed files modified (git diff --name-only)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD Beads — ordered happy-path first)
--------------------------------------------------------------------------------

AC-1: Dossier renders the committed evidence chain and inference identity [PRIMARY]
  GIVEN: one candidate has a committed admitted claim, belief score and attested telemetry
  WHEN:  the dossier renderer runs for that candidate id
  THEN:  the Markdown file carries the admission, verified-quote, score, tier version, quote, source URL, roles, model identities, serving backends and embedding dimensions

  TEST_TIER:            integration
  VERIFICATION_SERVICE: real Postgres holocron_nonprod committed rows + real filesystem under .holocron/fulcrum/dossiers
  FLOW_REF:             CAP-PUBLISH-01 hop: commit -> Markdown generator
  TDD_STATE:            none
  VERIFY:               PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-dossier-render.test.ts -t "AC-1"

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             visible
    TOPOLOGY:         single-node
    SERVICE:          real Postgres holocron_nonprod committed rows + real filesystem under .holocron/fulcrum/dossiers
    NEGATIVE_CONTROL: would fail if the renderer emits a static template shell with placeholder values; the belief score is hardcoded rather than read from the committed belief_scores row; Postgres is disconnected and the renderer still writes a file; the serving backend line is a hardcoded mini name rather than the attested value
    EVIDENCE:         file_artifact (required_capture=True)
    CASES:
      - START_REF: one_committed_candidate_with_admitted_claim
        ACTOR:     cli_user
        STEP:      run the dossier renderer for the committed candidateId
        STEP:      read `.holocron/fulcrum/dossiers/{candidateId}.md`
        MUST_OBSERVE:     the file contains the literal `Admission: admitted`
        MUST_OBSERVE:     the file contains the literal `Verified quote: true`
        MUST_OBSERVE:     the file contains `Belief score: 0.62`
        MUST_OBSERVE:     the file contains `Domain tier version: 1`
        MUST_OBSERVE:     the file contains the stored `claims.quote_text` byte-for-byte
        MUST_OBSERVE:     the file contains the bound `sources.url` value
        MUST_OBSERVE:     the file names the requested roles `divergent` and `convergent`
        MUST_OBSERVE:     the file lists 2 distinct resolved model identities
        MUST_OBSERVE:     every chat stage line names a serving backend of `inference1` or `inference2`
        MUST_OBSERVE:     the file contains the literal `Embedding dimensions: 1024`
        MUST_NOT_OBSERVE: a `Belief score:` line with an empty value
        MUST_NOT_OBSERVE: a `Domain tier version:` line with an empty value
        MUST_NOT_OBSERVE: the literal `Admission: none`
        MUST_NOT_OBSERVE: a serving backend of `127.0.0.1`
        MUST_NOT_OBSERVE: 0 resolved model identities listed

AC-2: Per-component breakdown shows contributing claims and UNKNOWN components
  GIVEN: the fitness contract declares four weight components and the ledger holds claims for three of them
  WHEN:  the dossier renders the score breakdown
  THEN:  each scored component lists its contributing claims and the empty component is marked UNKNOWN

  TEST_TIER:            integration
  VERIFICATION_SERVICE: real Postgres holocron_nonprod committed rows + real filesystem
  FLOW_REF:             UC-LED-05 / T-LED-020: empty component is UNKNOWN, not challenged-zero
  TDD_STATE:            none
  VERIFY:               PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-dossier-render.test.ts -t "AC-2"

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             visible
    TOPOLOGY:         single-node
    SERVICE:          real Postgres holocron_nonprod committed rows + real filesystem
    NEGATIVE_CONTROL: would fail if an empty component renders as a zero score instead of UNKNOWN; the breakdown is a static list disconnected from components_json; contributing claim ids are omitted so the number cannot be traced
    EVIDENCE:         file_artifact (required_capture=True)
    CASES:
      - START_REF: committed_candidate_with_one_empty_component
        ACTOR:     cli_user
        STEP:      run the dossier renderer for the committed candidateId
        STEP:      read the score breakdown section of `.holocron/fulcrum/dossiers/{candidateId}.md`
        MUST_OBSERVE:     4 component rows in the breakdown section
        MUST_OBSERVE:     the component `regulatory_pressure` is marked `UNKNOWN`
        MUST_OBSERVE:     3 components carry a numeric weighted contribution
        MUST_OBSERVE:     each scored component lists at least 1 contributing claim id
        MUST_NOT_OBSERVE: the component `regulatory_pressure` rendered with a score of `0`
        MUST_NOT_OBSERVE: 0 component rows in the breakdown section
        MUST_NOT_OBSERVE: a component row with an empty contribution and no `UNKNOWN` marker

AC-3: Re-render after a later commit replaces stale values in place
  GIVEN: a dossier already exists rendering the first cycle's score
  WHEN:  a second cycle commits a higher score and the renderer runs again
  THEN:  the single dossier file carries the newest score and no longer carries the stale one

  TEST_TIER:            integration
  VERIFICATION_SERVICE: real Postgres holocron_nonprod committed rows + real filesystem
  FLOW_REF:             UC-GATE-05: regenerate a dossier on material change so it reflects the latest committed cycle
  TDD_STATE:            none
  VERIFY:               PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-dossier-render.test.ts -t "AC-3"

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             visible
    TOPOLOGY:         single-node
    SERVICE:          real Postgres holocron_nonprod committed rows + real filesystem
    NEGATIVE_CONTROL: would fail if the renderer appends a second file instead of replacing the existing one; the renderer reads a cached payload and the stale score is unchanged; the newest belief_scores row is ignored and the first score is rendered again
    EVIDENCE:         file_artifact (required_capture=True)
    CASES:
      - START_REF: candidate_after_two_committed_cycles
        ACTOR:     cli_user
        STEP:      run the dossier renderer for the committed candidateId a second time
        STEP:      list `.holocron/fulcrum/dossiers/` and read the dossier file
        MUST_OBSERVE:     1 file matching `{candidateId}.md` in the dossier directory
        MUST_OBSERVE:     the file contains `Belief score: 0.74`
        MUST_OBSERVE:     the file lists 2 admitted claims bound to 2 distinct source URLs
        MUST_NOT_OBSERVE: the file contains `Belief score: 0.62`
        MUST_NOT_OBSERVE: 2 files matching `{candidateId}*.md`
        MUST_NOT_OBSERVE: 0 admitted claims listed

AC-4: A candidate with no committed score is refused, not rendered blank
  GIVEN: a candidate id with zero committed belief_scores rows
  WHEN:  the dossier renderer runs for that id
  THEN:  it fails with a named error and writes no dossier file

  TEST_TIER:            integration
  VERIFICATION_SERVICE: real Postgres holocron_nonprod + real filesystem
  FLOW_REF:             CAP-PUBLISH-01 failure mode: never publish a dossier that is not backed by a committed score
  TDD_STATE:            none
  VERIFY:               PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-dossier-render.test.ts -t "AC-4"

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             holdout
    TOPOLOGY:         single-node
    SERVICE:          real Postgres holocron_nonprod + real filesystem
    NEGATIVE_CONTROL: would fail if the renderer defaults a missing score to zero and writes the file anyway; the refusal is a silent no-op that reports success; the error message is empty so the operator cannot tell what is absent
    EVIDENCE:         stdout (required_capture=True)
    CASES:
      - START_REF: candidate_id_with_no_committed_score
        ACTOR:     cli_user
        STEP:      run the dossier renderer for candidate id `00000000-0000-7000-8000-000000000000`
        STEP:      list `.holocron/fulcrum/dossiers/`
        MUST_OBSERVE:     error code `FULCRUM_DOSSIER_NOT_COMMITTED`
        MUST_OBSERVE:     the message names candidate id `00000000-0000-7000-8000-000000000000`
        MUST_OBSERVE:     0 files matching `00000000-0000-7000-8000-000000000000.md`
        MUST_NOT_OBSERVE: exit code `0`
        MUST_NOT_OBSERVE: a file containing `Belief score: 0`
        MUST_NOT_OBSERVE: a file containing `Admission: admitted`

AC-5: The render path is deterministic and model-free
  GIVEN: the renderer module and its imports
  WHEN:  the same committed ledger is rendered twice and the module tree is scanned
  THEN:  the two outputs are byte-identical and the module tree contains no generateText call and no model role

  TEST_TIER:            integration
  VERIFICATION_SERVICE: real Postgres holocron_nonprod committed rows + real filesystem scan of services/platform/src/mission/fulcrum
  FLOW_REF:             API design invariant: no generateText and no model role inside gate, score or render modules
  TDD_STATE:            none
  VERIFY:               PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-dossier-render.test.ts -t "AC-5"

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             holdout
    TOPOLOGY:         single-node
    SERVICE:          real Postgres holocron_nonprod committed rows + real filesystem scan of services/platform/src/mission/fulcrum
    NEGATIVE_CONTROL: would fail if the renderer imports an agent and the scan is a no-op that always passes; the two renders differ because a timestamp is embedded in the body; the scan reads a hardcoded allowlist disconnected from the actual import graph
    EVIDENCE:         stdout (required_capture=True)
    CASES:
      - START_REF: one_committed_candidate_with_admitted_claim
        ACTOR:     cli_user
        STEP:      run the dossier renderer twice for the same committed candidateId
        STEP:      compare the two rendered bodies byte-for-byte
        STEP:      scan the renderer module and its transitive imports for `generateText` and for the role literals
        MUST_OBSERVE:     the 2 rendered bodies are byte-identical
        MUST_OBSERVE:     `0` occurrences of `generateText` in the renderer import graph
        MUST_OBSERVE:     `0` occurrences of the literal `judge` in the renderer import graph
        MUST_OBSERVE:     the rendered body contains `Belief score: 0.62` on both renders
        MUST_NOT_OBSERVE: a diff between the 2 rendered bodies
        MUST_NOT_OBSERVE: 1 or more `generateText` occurrences in the renderer import graph
        MUST_NOT_OBSERVE: 0 files scanned

--------------------------------------------------------------------------------
TEST CRITERIA (boolean — each maps to an AC)
--------------------------------------------------------------------------------

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 |  | AC-1 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-dossier-render.test.ts -t "TC-1"` |
| TC-2 |  | AC-1 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-dossier-render.test.ts -t "TC-2"` |
| TC-3 |  | AC-1 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-dossier-render.test.ts -t "TC-3"` |
| TC-4 |  | AC-2 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-dossier-render.test.ts -t "TC-4"` |
| TC-5 |  | AC-3 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-dossier-render.test.ts -t "TC-5"` |
| TC-6 |  | AC-4 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-dossier-render.test.ts -t "TC-6"` |
| TC-7 |  | AC-5 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-dossier-render.test.ts -t "TC-7"` |

--------------------------------------------------------------------------------
SCOPE (file-level write permissions)
--------------------------------------------------------------------------------

writeAllowed:
- services/platform/src/mission/fulcrum/dossier-render.ts (NEW)
- services/platform/src/mission/fulcrum/dossier-sections.ts (NEW)
- services/platform/src/mission/fulcrum/dossier-schema.ts (NEW)
- services/platform/tests/integration/fulcrum-dossier-render.test.ts (NEW)

writeProhibited:
- services/platform/src/research/** — the gate, score and provenance modules are read-only inputs here
- services/platform/src/db/schema/** — owned by FUL-PLAT-001
- services/platform/src/inference/** and services/platform/src/fleet/** — owned by FUL-PLAT-007
- services/platform/src/cli/holo.ts — owned by FUL-PLAT-012
- Any file not listed in write_allowed
- Any file not explicitly listed above

--------------------------------------------------------------------------------
CODE PATTERN
--------------------------------------------------------------------------------

Source: services/platform/src/research/findings-writer.ts (section assembly) + services/platform/src/inference/infer-trace.ts:118-180 (durable modelCalls read)

Deterministic section-writer: a typed row bundle in, a string out, one file write. Sections are pure functions so the whole body is reproducible and diffable.

ANTI-PATTERN: Rendering a template shell whose values are filled with defaults when a row is absent — a dossier with `Belief score:` and nothing after it is exactly the fakeable surface this task exists to prevent.

References:
- .spec/prds/fulcrum/09-technical-requirements/04-api-design.md — candidate dossier path .holocron/fulcrum/dossiers/{candidateId}.md, produced by a deterministic renderer over the evidence graph
- .spec/prds/fulcrum/07-uc-gate.md#UC-GATE-05 — the dossier shows every claim with its bound evidence, source, grade and admission status

Notes:
- T
- h
- e
-  
- r
- e
- n
- d
- e
- r
- e
- r
-  
- t
- a
- k
- e
- s
-  
- a
-  
- c
- a
- n
- d
- i
- d
- a
- t
- e
- I
- d
- ,
-  
- l
- o
- a
- d
- s
-  
- t
- h
- e
-  
- n
- e
- w
- e
- s
- t
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
- b
- e
- l
- i
- e
- f
-  
- s
- c
- o
- r
- e
- ,
-  
- i
- t
- s
-  
- c
- o
- m
- p
- o
- n
- e
- n
- t
- s
- ,
-  
- t
- h
- e
-  
- a
- d
- m
- i
- t
- t
- e
- d
-  
- c
- l
- a
- i
- m
- s
-  
- w
- i
- t
- h
-  
- t
- h
- e
- i
- r
-  
- b
- o
- u
- n
- d
-  
- s
- o
- u
- r
- c
- e
- s
- ,
-  
- a
- n
- d
-  
- t
- h
- e
-  
- r
- u
- n
- '
- s
-  
- a
- t
- t
- e
- s
- t
- e
- d
-  
- t
- e
- l
- e
- m
- e
- t
- r
- y
- ,
-  
- t
- h
- e
- n
-  
- w
- r
- i
- t
- e
- s
-  
- o
- n
- e
-  
- M
- a
- r
- k
- d
- o
- w
- n
-  
- f
- i
- l
- e
- .
-  
- I
- t
-  
- p
- e
- r
- f
- o
- r
- m
- s
-  
- n
- o
-  
- w
- r
- i
- t
- e
- s
-  
- t
- o
-  
- P
- o
- s
- t
- g
- r
- e
- s
- .

--------------------------------------------------------------------------------
READING LIST (max 5 — canonical pattern first)
--------------------------------------------------------------------------------

1. services/platform/src/research/findings-writer.ts
   - Lines: 1-120
   - Focus: [PRIMARY PATTERN] existing deterministic Markdown writer over committed rows — section assembly, no model call, typed row inputs
2. services/platform/src/research/citation-writer.ts
   - Lines: 1-100
   - Focus: How a verbatim quote and its source URL are rendered together without re-normalizing the stored text
3. services/platform/src/db/schema/evidence.ts
   - Lines: 30-110
   - Focus: sources and passages column shapes the renderer reads (url, content_hash, embedding vector(1024))
4. services/platform/src/inference/infer-trace.ts
   - Lines: 60-180
   - Focus: loadInferTrace reads durable modelCalls per run id — the renderer reuses this to fill the roles / model identities / serving backend lines
5. services/platform/src/research/session-writer.ts
   - Lines: 1-100
   - Focus: Section-writer composition and file-path conventions for generated Markdown artifacts

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
  Command:  PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-dossier-render.test.ts
  Expected: Exit 0

Gate 2:
  Command:  pnpm test:integration
  Expected: Exit 0

Gate 3:
  Command:  pnpm tsgo --noEmit
  Expected: Exit 0

Gate 4:
  Command:  pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error services/platform/src/mission/fulcrum services/platform/tests/integration/fulcrum-dossier-render.test.ts
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
Rationale:   A deterministic Markdown renderer over the committed Postgres evidence graph plus the attested telemetry rows — platform TypeScript with a hard no-model constraint on the render path. Reviewer: mastra-reviewer (grep for generateText / model role inside the renderer).
Reviewer:    mastra-reviewer

--------------------------------------------------------------------------------
CODING STANDARDS
--------------------------------------------------------------------------------

- Pure section functions: row bundle in, string out, no I/O inside a section
- Closed Zod schema for the row bundle — no z.any()
- No timestamps or random ids in the rendered body; determinism is asserted byte-for-byte
- Fail closed on an absent row rather than defaulting a rendered value

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------

Depends on: FUL-PLAT-002, FUL-PLAT-004, FUL-PLAT-007, FUL-PLAT-009
Blocks:     FUL-PLAT-011
Wave:       G

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
  "task_id": "FUL-PLAT-010",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "one_committed_candidate_with_admitted_claim": {
      "description": "One Fulcrum cycle has committed for mission dev-revenue, leaving one candidate, one admitted claim with a verified verbatim quote, one belief score stamping a domain tier version, and attested telemetry rows for the chat and embed calls",
      "seed_method": "cli",
      "records": [
        "`holo fulcrum '<goal>' --idempotency-key fulcrum-human-gate-01 --json` has committed and returned a candidateId",
        "claims holds 1 row with `status` = `admitted`, `passes_gate` = true and a non-empty `quote_text`",
        "belief_scores holds 1 row with `score` = 0.62 and `domain_tier_version` = 1",
        "inference_telemetry holds 2 chat rows with 2 distinct `model_id` values and 1 embed row",
        "no file exists at `.holocron/fulcrum/dossiers/{candidateId}.md`"
      ]
    },
    "committed_candidate_with_one_empty_component": {
      "description": "Same committed candidate, but the fitness contract declares a fourth weight component for which the ledger holds no claims",
      "seed_method": "cli",
      "records": [
        "weight_components holds 4 rows for the active weight version",
        "claims holds 0 rows for component `regulatory_pressure`",
        "belief_scores components_json marks `regulatory_pressure` as `UNKNOWN`"
      ]
    },
    "candidate_id_with_no_committed_score": {
      "description": "A syntactically valid candidate id for which no belief_scores row was ever committed",
      "seed_method": "cli",
      "records": [
        "`holo db seed:e2e` has run and holocron_nonprod is reachable",
        "belief_scores holds 0 rows for candidate id `00000000-0000-7000-8000-000000000000`",
        "no file exists at `.holocron/fulcrum/dossiers/00000000-0000-7000-8000-000000000000.md`"
      ]
    },
    "candidate_after_two_committed_cycles": {
      "description": "The same candidate after a second Fulcrum cycle committed a higher belief score from an additional admitted claim",
      "seed_method": "cli",
      "records": [
        "belief_scores holds 2 rows for the candidate, the newest with `score` = 0.74",
        "claims holds 2 admitted rows bound to 2 distinct sources",
        "`.holocron/fulcrum/dossiers/{candidateId}.md` already exists rendering `Belief score: 0.62`"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN one candidate has a committed admitted claim, belief score and attested telemetry WHEN the dossier renderer runs for that candidate id THEN the Markdown file carries the admission, verified-quote, score, tier version, quote, source URL, roles, model identities, serving backends and embedding dimensions",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-dossier-render.test.ts -t \"AC-1\"",
      "maps_to_ac": null,
      "test_tier": "integration",
      "verification_service": "real Postgres holocron_nonprod committed rows + real filesystem under .holocron/fulcrum/dossiers",
      "unit_test_justified": null,
      "scenario": {
        "id": "SC-FUL-PLAT-010-1",
        "primary": true,
        "tier": "visible",
        "test_tier": "integration",
        "topology": "single-node",
        "verification_service": "real Postgres holocron_nonprod committed rows + real filesystem under .holocron/fulcrum/dossiers",
        "negative_control": {
          "would_fail_if": [
            "the renderer emits a static template shell with placeholder values",
            "the belief score is hardcoded rather than read from the committed belief_scores row",
            "Postgres is disconnected and the renderer still writes a file",
            "the serving backend line is a hardcoded mini name rather than the attested value"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "one_committed_candidate_with_admitted_claim",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run the dossier renderer for the committed candidateId",
                "read `.holocron/fulcrum/dossiers/{candidateId}.md`"
              ]
            },
            "end_state": {
              "must_observe": [
                "the file contains the literal `Admission: admitted`",
                "the file contains the literal `Verified quote: true`",
                "the file contains `Belief score: 0.62`",
                "the file contains `Domain tier version: 1`",
                "the file contains the stored `claims.quote_text` byte-for-byte",
                "the file contains the bound `sources.url` value",
                "the file names the requested roles `divergent` and `convergent`",
                "the file lists 2 distinct resolved model identities",
                "every chat stage line names a serving backend of `inference1` or `inference2`",
                "the file contains the literal `Embedding dimensions: 1024`"
              ],
              "must_not_observe": [
                "a `Belief score:` line with an empty value",
                "a `Domain tier version:` line with an empty value",
                "the literal `Admission: none`",
                "a serving backend of `127.0.0.1`",
                "0 resolved model identities listed"
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
      "description": "GIVEN the fitness contract declares four weight components and the ledger holds claims for three of them WHEN the dossier renders the score breakdown THEN each scored component lists its contributing claims and the empty component is marked UNKNOWN",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-dossier-render.test.ts -t \"AC-2\"",
      "maps_to_ac": null,
      "test_tier": "integration",
      "verification_service": "real Postgres holocron_nonprod committed rows + real filesystem",
      "unit_test_justified": null,
      "scenario": {
        "id": "SC-FUL-PLAT-010-2",
        "primary": false,
        "tier": "visible",
        "test_tier": "integration",
        "topology": "single-node",
        "verification_service": "real Postgres holocron_nonprod committed rows + real filesystem",
        "negative_control": {
          "would_fail_if": [
            "an empty component renders as a zero score instead of UNKNOWN",
            "the breakdown is a static list disconnected from components_json",
            "contributing claim ids are omitted so the number cannot be traced"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "committed_candidate_with_one_empty_component",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run the dossier renderer for the committed candidateId",
                "read the score breakdown section of `.holocron/fulcrum/dossiers/{candidateId}.md`"
              ]
            },
            "end_state": {
              "must_observe": [
                "4 component rows in the breakdown section",
                "the component `regulatory_pressure` is marked `UNKNOWN`",
                "3 components carry a numeric weighted contribution",
                "each scored component lists at least 1 contributing claim id"
              ],
              "must_not_observe": [
                "the component `regulatory_pressure` rendered with a score of `0`",
                "0 component rows in the breakdown section",
                "a component row with an empty contribution and no `UNKNOWN` marker"
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
      "description": "GIVEN a dossier already exists rendering the first cycle's score WHEN a second cycle commits a higher score and the renderer runs again THEN the single dossier file carries the newest score and no longer carries the stale one",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-dossier-render.test.ts -t \"AC-3\"",
      "maps_to_ac": null,
      "test_tier": "integration",
      "verification_service": "real Postgres holocron_nonprod committed rows + real filesystem",
      "unit_test_justified": null,
      "scenario": {
        "id": "SC-FUL-PLAT-010-3",
        "primary": false,
        "tier": "visible",
        "test_tier": "integration",
        "topology": "single-node",
        "verification_service": "real Postgres holocron_nonprod committed rows + real filesystem",
        "negative_control": {
          "would_fail_if": [
            "the renderer appends a second file instead of replacing the existing one",
            "the renderer reads a cached payload and the stale score is unchanged",
            "the newest belief_scores row is ignored and the first score is rendered again"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "candidate_after_two_committed_cycles",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run the dossier renderer for the committed candidateId a second time",
                "list `.holocron/fulcrum/dossiers/` and read the dossier file"
              ]
            },
            "end_state": {
              "must_observe": [
                "1 file matching `{candidateId}.md` in the dossier directory",
                "the file contains `Belief score: 0.74`",
                "the file lists 2 admitted claims bound to 2 distinct source URLs"
              ],
              "must_not_observe": [
                "the file contains `Belief score: 0.62`",
                "2 files matching `{candidateId}*.md`",
                "0 admitted claims listed"
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
      "description": "GIVEN a candidate id with zero committed belief_scores rows WHEN the dossier renderer runs for that id THEN it fails with a named error and writes no dossier file",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-dossier-render.test.ts -t \"AC-4\"",
      "maps_to_ac": null,
      "test_tier": "integration",
      "verification_service": "real Postgres holocron_nonprod + real filesystem",
      "unit_test_justified": null,
      "scenario": {
        "id": "SC-FUL-PLAT-010-4",
        "primary": false,
        "tier": "holdout",
        "test_tier": "integration",
        "topology": "single-node",
        "verification_service": "real Postgres holocron_nonprod + real filesystem",
        "negative_control": {
          "would_fail_if": [
            "the renderer defaults a missing score to zero and writes the file anyway",
            "the refusal is a silent no-op that reports success",
            "the error message is empty so the operator cannot tell what is absent"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "candidate_id_with_no_committed_score",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run the dossier renderer for candidate id `00000000-0000-7000-8000-000000000000`",
                "list `.holocron/fulcrum/dossiers/`"
              ]
            },
            "end_state": {
              "must_observe": [
                "error code `FULCRUM_DOSSIER_NOT_COMMITTED`",
                "the message names candidate id `00000000-0000-7000-8000-000000000000`",
                "0 files matching `00000000-0000-7000-8000-000000000000.md`"
              ],
              "must_not_observe": [
                "exit code `0`",
                "a file containing `Belief score: 0`",
                "a file containing `Admission: admitted`"
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
      "description": "GIVEN the renderer module and its imports WHEN the same committed ledger is rendered twice and the module tree is scanned THEN the two outputs are byte-identical and the module tree contains no generateText call and no model role",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-dossier-render.test.ts -t \"AC-5\"",
      "maps_to_ac": null,
      "test_tier": "integration",
      "verification_service": "real Postgres holocron_nonprod committed rows + real filesystem scan of services/platform/src/mission/fulcrum",
      "unit_test_justified": null,
      "scenario": {
        "id": "SC-FUL-PLAT-010-5",
        "primary": false,
        "tier": "holdout",
        "test_tier": "integration",
        "topology": "single-node",
        "verification_service": "real Postgres holocron_nonprod committed rows + real filesystem scan of services/platform/src/mission/fulcrum",
        "negative_control": {
          "would_fail_if": [
            "the renderer imports an agent and the scan is a no-op that always passes",
            "the two renders differ because a timestamp is embedded in the body",
            "the scan reads a hardcoded allowlist disconnected from the actual import graph"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "one_committed_candidate_with_admitted_claim",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run the dossier renderer twice for the same committed candidateId",
                "compare the two rendered bodies byte-for-byte",
                "scan the renderer module and its transitive imports for `generateText` and for the role literals"
              ]
            },
            "end_state": {
              "must_observe": [
                "the 2 rendered bodies are byte-identical",
                "`0` occurrences of `generateText` in the renderer import graph",
                "`0` occurrences of the literal `judge` in the renderer import graph",
                "the rendered body contains `Belief score: 0.62` on both renders"
              ],
              "must_not_observe": [
                "a diff between the 2 rendered bodies",
                "1 or more `generateText` occurrences in the renderer import graph",
                "0 files scanned"
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
      "description": "The dossier file contains the literal Admission colon admitted when the committed claim passed the gate",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-dossier-render.test.ts -t \"TC-1\"",
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
      "description": "The rendered quote equals claims.quote_text byte-for-byte when the dossier renders",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-dossier-render.test.ts -t \"TC-2\"",
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
      "description": "Every chat stage line names a serving backend of inference1 or inference2 when the attestation rows exist",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-dossier-render.test.ts -t \"TC-3\"",
      "maps_to_ac": "AC-1",
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
      "description": "A component with zero claims is marked UNKNOWN when the breakdown renders",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-dossier-render.test.ts -t \"TC-4\"",
      "maps_to_ac": "AC-2",
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
      "description": "The dossier directory holds one file for the candidate after a second render",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-dossier-render.test.ts -t \"TC-5\"",
      "maps_to_ac": "AC-3",
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
      "description": "The renderer writes no file when the candidate has zero committed belief_scores rows",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-dossier-render.test.ts -t \"TC-6\"",
      "maps_to_ac": "AC-4",
      "satisfied": null,
      "evidence": null,
      "remediation": null,
      "last_evaluated_cycle": null,
      "last_evaluated_commit": null
    },
    {
      "id": "TC-7",
      "type": "test_criterion",
      "primary": false,
      "description": "The renderer import graph contains zero generateText occurrences when scanned",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-dossier-render.test.ts -t \"TC-7\"",
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
