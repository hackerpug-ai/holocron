# FUL-PLAT-003 — Enforce provenance independence

> **Sprint:** [sprint-01-produce-one-trustworthy-candidate-dossier-on-self-owned-inference](./SPRINT.md) · **Wave:** C
> **Assignee:** mastra-implementer · **Reviewer:** mastra-reviewer
> **Priority:** P0 · **Points:** 3 · **Type:** FEATURE
> **Proposed by:** mastra-planner
> **TDD mode:** `red_first` · **RED_GREEN_REQUIRED:** yes
> Status: Backlog

## What this does

Make independence provenance-based: collapse syndicated content into one group, count each group once, demote the lower-weighted component when a group would solely support two, and strip self-sourced evidence from independence credit.

## Why

Against real Postgres, 3 byte-identical sources across 3 domains resolve to 1 provenance_group with an independent-group count of 1; a shared sole group demotes the 'pricing' claim to provisional with reason source_independence; a holocron-published source reads self_sourced = 1 and drops the count from 3 to 2.

## How to verify

Primary acceptance criterion **AC-1** (integration tier, service: real Postgres holocron_nonprod (services/platform/src/db/client.ts)):

```
PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-provenance.test.ts -t 'AC-1'
```

Full gate set: 4 acceptance criteria, 7 test criteria, 3 verification gates.

## Scope

- services/platform/src/fulcrum/gate/provenance.ts (NEW)
- services/platform/src/fulcrum/provenance-writer.ts (NEW)
- services/platform/tests/integration/fulcrum-provenance.test.ts (NEW)

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

```
================================================================================
TASK: FUL-PLAT-003 - Enforce provenance independence
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
POINTS:     3
AGENT:      implementer=mastra-implementer | reviewer=mastra-reviewer
SPRINT:     sprint-01-produce-one-trustworthy-candidate-dossier-on-self-owned-inference (wave C)
PROPOSED_BY:mastra-planner
TDD_MODE:   red_first
RED_GREEN_REQUIRED: yes

RUNTIME_COMMANDS:
  test:      pnpm test:integration
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error

PROGRESS: 0/4 ACs complete

--------------------------------------------------------------------------------
OUTCOME (observable success)
--------------------------------------------------------------------------------

Against real Postgres, 3 byte-identical sources across 3 domains resolve to 1 provenance_group with an independent-group count of 1; a shared sole group demotes the 'pricing' claim to provisional with reason source_independence; a holocron-published source reads self_sourced = 1 and drops the count from 3 to 2.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier — read before acting)
--------------------------------------------------------------------------------

- MUST: MUST derive the provenance group from the persisted `sources.content_hash`, ignoring any independenceGroup value supplied by the caller
- MUST: MUST persist the demotion decision onto `claims.status` with the closed reason value `source_independence`
- MUST: MUST determine self_sourced from the real published `documents` lineage written by services/platform/src/mission/document-publish.ts, not from a hardcoded domain list
- NEVER: NEVER import a model client or call generateText inside services/platform/src/fulcrum/gate/provenance.ts
- NEVER: NEVER count a self_sourced group toward independence, even when it is the only support
- NEVER: NEVER demote the higher-weighted component when two components share a sole group
- STRICTLY: STRICTLY keep provenance.ts pure (no sql import); persistence lives in services/platform/src/fulcrum/provenance-writer.ts

--------------------------------------------------------------------------------
CAPABILITY CHAIN
--------------------------------------------------------------------------------

touches_capabilities: CAP-EVIDENCE-01, CAP-PUBLISH-01
provides:             provenance-group-assignment, independence-sweep-demotions, self-sourced-exclusion
consumes:             fulcrum-admission-decision, fulcrum-ledger-tables, sources-fetch-artifact-columns
boundary_contracts:
  - Byte-identical content under N registrable domains collapses to exactly one provenance_group, derived from content_hash and never from a caller-supplied label
  - A provenance group counts at most once when testing whether a component is independently supported
  - A single provenance group cannot be the sole support for two components of one candidate — the lower-weighted component's claim is demoted with the reason source_independence
  - Evidence tracing to holocron's own published documents is flagged self_sourced and excluded from independence counts

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------

- [ ] AC-1 (PRIMARY): Byte-identical content across three domains collapses to one provenance group
- [ ] AC-2: One group cannot solely support two components
- [ ] AC-3: Self-sourced evidence never satisfies independence
- [ ] AC-4: A caller-supplied group label cannot buy independence
- [ ] pnpm test:integration passes + pnpm tsgo --noEmit clean
- [ ] Only writeAllowed files modified (git diff --name-only)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD Beads — ordered happy-path first)
--------------------------------------------------------------------------------

AC-1: Byte-identical content across three domains collapses to one provenance group [PRIMARY]
  GIVEN: 3 seeded `sources` rows carrying byte-identical `normalized_text` under 3 different registrable domains
  WHEN:  the provenance sweep assigns provenance groups and persists them onto `sources` and `claim_evidence_bindings`
  THEN:  all 3 rows carry the same single `provenance_group` and the independent-group count reads 1

  TEST_TIER:            integration
  VERIFICATION_SERVICE: real Postgres holocron_nonprod (services/platform/src/db/client.ts)
  FLOW_REF:             CAP-EVIDENCE-01 → UC-LED-03 AC-1/AC-2
  TDD_STATE:            none
  VERIFY:               PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-provenance.test.ts -t 'AC-1'

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             visible
    TOPOLOGY:         single-node
    SERVICE:          real Postgres holocron_nonprod (services/platform/src/db/client.ts)
    NEGATIVE_CONTROL: would fail if provenanceSweep returns an empty demotion list without reading content_hash, leaving each source its own group; the provenance writer is a no-op so sources.provenance_group stays NULL; grouping is keyed on registrable domain instead of content hash, so syndication counts three times; the test asserts on an in-memory array rather than querying the persisted rows
    EVIDENCE:         db_query (required_capture=True)
    CASES:
      - START_REF: syndicated_triplet
        ACTOR:     cli_user
        STEP:      run `provenanceSweep` over the 3 admitted claims through the provenance writer
        STEP:      SELECT DISTINCT provenance_group FROM sources WHERE content_hash = the shared digest
        STEP:      SELECT count(DISTINCT provenance_group) FROM claim_evidence_bindings for the candidate
        MUST_OBSERVE:     `SELECT count(DISTINCT provenance_group) FROM sources` returns 1
        MUST_OBSERVE:     all 3 `sources` rows carry the same non-null `provenance_group`
        MUST_OBSERVE:     `claim_evidence_bindings` holds 3 rows resolving to 1 independent group
        MUST_OBSERVE:     the independent-group count for the candidate reads 1
        MUST_NOT_OBSERVE: `SELECT count(DISTINCT provenance_group) FROM sources` returns 3
        MUST_NOT_OBSERVE: `provenance_group` is NULL on any of the 3 rows
        MUST_NOT_OBSERVE: `SELECT count(*) FROM claim_evidence_bindings` returns 0

AC-2: One group cannot solely support two components
  GIVEN: 1 provenance group that is the only support for both the 'demand' and 'pricing' components of one candidate
  WHEN:  the provenance sweep runs and its demotions are persisted
  THEN:  the lower-weighted 'pricing' claim reads `status` = 'provisional' with reason `source_independence` and 'demand' stays admitted

  TEST_TIER:            integration
  VERIFICATION_SERVICE: real Postgres holocron_nonprod (services/platform/src/db/client.ts)
  FLOW_REF:             CAP-EVIDENCE-01 → UC-LED-03 AC-3/AC-5
  TDD_STATE:            none
  VERIFY:               PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-provenance.test.ts -t 'AC-2'

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             visible
    TOPOLOGY:         single-node
    SERVICE:          real Postgres holocron_nonprod (services/platform/src/db/client.ts)
    NEGATIVE_CONTROL: would fail if the sweep returns an empty demotion list, leaving both components admitted on one group; the demotion is computed but never written, so claims.status is unchanged; the sweep demotes by insertion order instead of component weight rank; the reason is a free-form message that no downstream reader can match
    EVIDENCE:         db_query (required_capture=True)
    CASES:
      - START_REF: two_component_shared_group
        ACTOR:     cli_user
        STEP:      run `provenanceSweep` over the candidate's 2 admitted claims
        STEP:      persist the returned demotions through the provenance writer
        STEP:      SELECT component, status, metadata_json FROM claims for the candidate
        MUST_OBSERVE:     the 'pricing' claim reads `status` = 'provisional'
        MUST_OBSERVE:     the 'pricing' claim reason reads `source_independence`
        MUST_OBSERVE:     the 'demand' claim still reads `status` = 'admitted'
        MUST_OBSERVE:     `SELECT count(*) FROM claims WHERE status = 'admitted'` returns 1 for the candidate
        MUST_NOT_OBSERVE: both claims read `status` = 'admitted'
        MUST_NOT_OBSERVE: the 'demand' claim demoted instead of 'pricing'
        MUST_NOT_OBSERVE: no reason persisted on the demoted claim

AC-3: Self-sourced evidence never satisfies independence
  GIVEN: 3 admitted claims for one candidate — 1 bound to a holocron-published `documents` row, 2 bound to external domains
  WHEN:  the independent-group count is recomputed for that component
  THEN:  the count reads 2 and the self-sourced row carries `self_sourced` = 1

  TEST_TIER:            integration
  VERIFICATION_SERVICE: real Postgres holocron_nonprod (services/platform/src/db/client.ts)
  FLOW_REF:             CAP-EVIDENCE-01 + CAP-PUBLISH-01 → UC-LED-03 AC-4
  TDD_STATE:            none
  VERIFY:               PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-provenance.test.ts -t 'AC-3'

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             visible
    TOPOLOGY:         single-node
    SERVICE:          real Postgres holocron_nonprod (services/platform/src/db/client.ts)
    NEGATIVE_CONTROL: would fail if self_sourced is never set, so holocron's own prior output corroborates itself; the independence count includes every group regardless of the self_sourced flag; the flag is derived from a hardcoded list instead of the documents category written by publishDocumentForRun; the test injects a self_sourced value directly rather than publishing through the real document path
    EVIDENCE:         db_query (required_capture=True)
    CASES:
      - START_REF: self_sourced_plus_two
        ACTOR:     cli_user
        STEP:      run `provenanceSweep` and persist the results
        STEP:      SELECT self_sourced, provenance_group FROM sources for the 3 bound sources
        STEP:      compute the independent-group count for the candidate's component
        MUST_OBSERVE:     the holocron-published source reads `self_sourced` = 1
        MUST_OBSERVE:     the independent-group count reads 2 rather than 3
        MUST_OBSERVE:     `SELECT count(*) FROM claim_evidence_bindings WHERE self_sourced = 1` returns 1
        MUST_NOT_OBSERVE: the independent-group count reads 3
        MUST_NOT_OBSERVE: `self_sourced` is NULL or 0 on the holocron-published source
        MUST_NOT_OBSERVE: `SELECT count(*) FROM claim_evidence_bindings` returns 0

AC-4: A caller-supplied group label cannot buy independence
  GIVEN: the 3 syndicated sources sharing 1 content hash
  WHEN:  the caller passes distinct hand-written `independenceGroup` labels for the 3 claims
  THEN:  the sweep ignores the supplied labels and the independent-group count still reads 1

  TEST_TIER:            integration
  VERIFICATION_SERVICE: real Postgres holocron_nonprod (services/platform/src/db/client.ts)
  FLOW_REF:             CAP-EVIDENCE-01 boundary: independence is provenance-based
  TDD_STATE:            none
  VERIFY:               PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-provenance.test.ts -t 'AC-4'

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             visible
    TOPOLOGY:         single-node
    SERVICE:          real Postgres holocron_nonprod (services/platform/src/db/client.ts)
    NEGATIVE_CONTROL: would fail if the sweep trusts the caller-supplied independenceGroup label, so relabelling manufactures independence; provenance_group is copied straight from the input payload without hashing the content; the sweep is stubbed to echo its input
    EVIDENCE:         db_query (required_capture=True)
    CASES:
      - START_REF: syndicated_triplet
        ACTOR:     cli_user
        STEP:      call `provenanceSweep` passing `independenceGroup` values 'g1', 'g2' and 'g3' for the 3 claims
        STEP:      persist the results and SELECT DISTINCT provenance_group FROM claim_evidence_bindings
        MUST_OBSERVE:     `SELECT count(DISTINCT provenance_group) FROM claim_evidence_bindings` returns 1
        MUST_OBSERVE:     the persisted `provenance_group` matches the shared `content_hash` derivation, not 'g1'
        MUST_OBSERVE:     the independent-group count reads 1 for all 3 claims
        MUST_NOT_OBSERVE: `SELECT count(DISTINCT provenance_group) FROM claim_evidence_bindings` returns 3
        MUST_NOT_OBSERVE: a persisted `provenance_group` equal to 'g1'
        MUST_NOT_OBSERVE: the independent-group count reads 0

--------------------------------------------------------------------------------
TEST CRITERIA (boolean — each maps to an AC)
--------------------------------------------------------------------------------

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 |  | AC-1 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-provenance.test.ts -t 'AC-1'` |
| TC-2 |  | AC-1 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-provenance.test.ts -t 'AC-1'` |
| TC-3 |  | AC-2 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-provenance.test.ts -t 'AC-2'` |
| TC-4 |  | AC-2 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-provenance.test.ts -t 'AC-2'` |
| TC-5 |  | AC-3 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-provenance.test.ts -t 'AC-3'` |
| TC-6 |  | AC-3 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-provenance.test.ts -t 'AC-3'` |
| TC-7 |  | AC-4 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-provenance.test.ts -t 'AC-4'` |

--------------------------------------------------------------------------------
SCOPE (file-level write permissions)
--------------------------------------------------------------------------------

writeAllowed:
- services/platform/src/fulcrum/gate/provenance.ts (NEW)
- services/platform/src/fulcrum/provenance-writer.ts (NEW)
- services/platform/tests/integration/fulcrum-provenance.test.ts (NEW)

writeProhibited:
- services/platform/src/fulcrum/retrieval.ts — owned by FUL-PLAT-006 (same wave)
- services/platform/src/mission/** — owned by FUL-PLAT-005/006/008
- services/platform/src/fulcrum/gate/grade.ts, verify-quote.ts, admission.ts — delivered by FUL-PLAT-002; consume, do not edit
- services/platform/src/db/** — owned by FUL-PLAT-001
- Any file not listed in write_allowed
- Any file not explicitly listed above

--------------------------------------------------------------------------------
CODE PATTERN
--------------------------------------------------------------------------------

Source: services/platform/src/research/evidence-gate.ts (canonical-identity grouping) + services/platform/src/research/provenance.ts (sha256 identity)

Pure sweep over already-read claim/binding records returning a typed demotions list, plus a writer that persists group assignments and status changes.

ANTI-PATTERN: Trusting `item.independenceGroup` from the input payload. That is exactly the hole evidence-gate.ts closed: a source becomes independent by relabelling itself, and three syndicated copies of one wire story read as three independent corroborations.

References:
- .spec/prds/fulcrum/06-uc-led.md § UC-LED-03 (all five acceptance criteria)
- services/platform/src/research/evidence-gate.ts:72-80 — the canonical-identity independence rule already shipped here

Notes:
- p
- r
- o
- v
- e
- n
- a
- n
- c
- e
- S
- w
- e
- e
- p
-  
- i
- s
-  
- p
- u
- r
- e
-  
- a
- n
- d
-  
- r
- e
- t
- u
- r
- n
- s
-  
- a
-  
- d
- e
- m
- o
- t
- i
- o
- n
- s
- [
- ]
-  
- l
- i
- s
- t
- ;
-  
- t
- h
- e
-  
- w
- r
- i
- t
- e
- r
-  
- a
- p
- p
- l
- i
- e
- s
-  
- t
- h
- e
- m
- .
-  
- K
- e
- e
- p
- i
- n
- g
-  
- t
- h
- e
-  
- d
- e
- m
- o
- t
- i
- o
- n
-  
- d
- e
- c
- i
- s
- i
- o
- n
-  
- a
- s
-  
- r
- e
- t
- u
- r
- n
- e
- d
-  
- d
- a
- t
- a
-  
- r
- a
- t
- h
- e
- r
-  
- t
- h
- a
- n
-  
- a
- n
-  
- i
- n
- -
- p
- l
- a
- c
- e
-  
- m
- u
- t
- a
- t
- i
- o
- n
-  
- m
- e
- a
- n
- s
-  
- t
- h
- e
-  
- s
- a
- m
- e
-  
- s
- w
- e
- e
- p
-  
- c
- a
- n
-  
- b
- e
-  
- r
- e
- p
- l
- a
- y
- e
- d
-  
- f
- o
- r
-  
- t
- h
- e
-  
- d
- o
- s
- s
- i
- e
- r
- '
- s
-  
- p
- e
- r
- -
- c
- o
- m
- p
- o
- n
- e
- n
- t
-  
- b
- r
- e
- a
- k
- d
- o
- w
- n
-  
- i
- n
-  
- F
- U
- L
- -
- P
- L
- A
- T
- -
- 0
- 1
- 0
-  
- w
- i
- t
- h
- o
- u
- t
-  
- r
- e
- -
- r
- u
- n
- n
- i
- n
- g
-  
- P
- o
- s
- t
- g
- r
- e
- s
-  
- w
- r
- i
- t
- e
- s
- .

--------------------------------------------------------------------------------
READING LIST (max 5 — canonical pattern first)
--------------------------------------------------------------------------------

1. services/platform/src/research/evidence-gate.ts
   - Lines: 72-80
   - Focus: [PRIMARY PATTERN] the exact precedent for this task's central rule — 'Independence is keyed by the canonical source identity, never by a caller/model-supplied group label'
2. services/platform/src/research/provenance.ts
   - Lines: 1-70
   - Focus: sha256Text + attestation store shape; Fulcrum reuses content-hash identity but persists the group on sources / claim_evidence_bindings instead of an in-memory map
3. services/platform/src/mission/document-publish.ts
   - Lines: 1-60
   - Focus: How a Fulcrum document is published (source_run_id idempotency, category) — the lineage that makes a later retrieval self_sourced
4. services/platform/src/fulcrum/gate/admission.ts
   - Lines: whole file (delivered by FUL-PLAT-002)
   - Focus: The admitted-claim shape and closed reason union this sweep extends with source_independence
5. services/platform/tests/integration/research-evidence-core.test.ts
   - Lines: 1-70
   - Focus: Integration-lane conventions: fail-closed beforeAll, holocron_nonprod guard, real createSql

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

Gate 1: None
  Command:  pnpm test:integration
  Expected: None

Gate 2: None
  Command:  pnpm tsgo --noEmit
  Expected: None

Gate 3: None
  Command:  pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error services/platform/src/fulcrum/gate/provenance.ts services/platform/src/fulcrum/provenance-writer.ts services/platform/tests/integration/fulcrum-provenance.test.ts
  Expected: None

Gate S: Scenario is un-fakeable (PRIMARY) — supersedes 'Exit 0' as the bar for done.
  Verify: validate_scenario.py passes on the PRIMARY AC scenario (exit 0).
  Verify: RED-against-start observed and recorded before green.
  Verify: captured evidence shows the seeded MUST_OBSERVE value, not merely 'tests passed'.

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------

Implementer: mastra-implementer
Rationale:   Extends the same deterministic gate seam this triad owns in services/platform/src/fulcrum, and the proof requires real Postgres rows plus a real publishDocumentForRun document — mastra-implementer's TDD-against-real-services contract.
Reviewer:    mastra-reviewer

--------------------------------------------------------------------------------
CODING STANDARDS
--------------------------------------------------------------------------------

- Sweep input and output are declared Zod schemas — no z.any() and no loose Record on the demotion path
- The demotion reason is added to the closed reason union from FUL-PLAT-002, never a free-form string
- provenance.ts imports nothing from services/platform/src/db and no model or fleet client
- Group derivation is a pure function of content_hash — no Date.now(), no randomness, no ordering dependence

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------

Depends on: FUL-PLAT-001, FUL-PLAT-002
Blocks:     FUL-PLAT-004, FUL-PLAT-008
Wave:       C

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
  "task_id": "FUL-PLAT-003",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "syndicated_triplet": {
      "description": "three `sources` rows seeded through the corpus ingest CLI carrying byte-identical `normalized_text` under three different registrable domains, each bound to 1 admitted claim",
      "seed_method": "cli",
      "records": [
        "3 `sources` rows with `source_domain` values 'reuters.example', 'syndication1.example' and 'syndication2.example'",
        "all 3 rows share 1 identical `content_hash` digest",
        "`claims` holds 3 rows with `status` = 'admitted'"
      ]
    },
    "two_component_shared_group": {
      "description": "one provenance group solely supporting 2 components of the same candidate \u2014 component 'demand' ranked above component 'pricing'",
      "seed_method": "cli",
      "records": [
        "`claim_evidence_bindings` holds 2 rows sharing 1 `provenance_group`",
        "`claims` holds 1 admitted row for component 'demand' and 1 admitted row for component 'pricing'",
        "`weight_components.weight` is 0.4 for 'demand' and 0.2 for 'pricing'"
      ]
    },
    "self_sourced_plus_two": {
      "description": "one candidate supported by 3 sources \u2014 1 retrieved from a holocron `documents` row published by publishDocumentForRun, plus 2 external sources on distinct domains",
      "seed_method": "cli",
      "records": [
        "1 `sources` row with `self_sourced` = 1 tracing to a `documents` row with `category` = 'fulcrum'",
        "2 `sources` rows with `self_sourced` = 0 on distinct registrable domains",
        "`claims` holds 3 rows with `status` = 'admitted'"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN 3 seeded `sources` rows carrying byte-identical `normalized_text` under 3 different registrable domains WHEN the provenance sweep assigns provenance groups and persists them onto `sources` and `claim_evidence_bindings` THEN all 3 rows carry the same single `provenance_group` and the independent-group count reads 1",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-provenance.test.ts -t 'AC-1'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "primary": true,
        "verification_service": "real Postgres holocron_nonprod (services/platform/src/db/client.ts)",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "provenanceSweep returns an empty demotion list without reading content_hash, leaving each source its own group",
            "the provenance writer is a no-op so sources.provenance_group stays NULL",
            "grouping is keyed on registrable domain instead of content hash, so syndication counts three times",
            "the test asserts on an in-memory array rather than querying the persisted rows"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "syndicated_triplet",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run `provenanceSweep` over the 3 admitted claims through the provenance writer",
                "SELECT DISTINCT provenance_group FROM sources WHERE content_hash = the shared digest",
                "SELECT count(DISTINCT provenance_group) FROM claim_evidence_bindings for the candidate"
              ]
            },
            "end_state": {
              "must_observe": [
                "`SELECT count(DISTINCT provenance_group) FROM sources` returns 1",
                "all 3 `sources` rows carry the same non-null `provenance_group`",
                "`claim_evidence_bindings` holds 3 rows resolving to 1 independent group",
                "the independent-group count for the candidate reads 1"
              ],
              "must_not_observe": [
                "`SELECT count(DISTINCT provenance_group) FROM sources` returns 3",
                "`provenance_group` is NULL on any of the 3 rows",
                "`SELECT count(*) FROM claim_evidence_bindings` returns 0"
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
      "description": "GIVEN 1 provenance group that is the only support for both the 'demand' and 'pricing' components of one candidate WHEN the provenance sweep runs and its demotions are persisted THEN the lower-weighted 'pricing' claim reads `status` = 'provisional' with reason `source_independence` and 'demand' stays admitted",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-provenance.test.ts -t 'AC-2'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "primary": false,
        "verification_service": "real Postgres holocron_nonprod (services/platform/src/db/client.ts)",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "the sweep returns an empty demotion list, leaving both components admitted on one group",
            "the demotion is computed but never written, so claims.status is unchanged",
            "the sweep demotes by insertion order instead of component weight rank",
            "the reason is a free-form message that no downstream reader can match"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "two_component_shared_group",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run `provenanceSweep` over the candidate's 2 admitted claims",
                "persist the returned demotions through the provenance writer",
                "SELECT component, status, metadata_json FROM claims for the candidate"
              ]
            },
            "end_state": {
              "must_observe": [
                "the 'pricing' claim reads `status` = 'provisional'",
                "the 'pricing' claim reason reads `source_independence`",
                "the 'demand' claim still reads `status` = 'admitted'",
                "`SELECT count(*) FROM claims WHERE status = 'admitted'` returns 1 for the candidate"
              ],
              "must_not_observe": [
                "both claims read `status` = 'admitted'",
                "the 'demand' claim demoted instead of 'pricing'",
                "no reason persisted on the demoted claim"
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
      "description": "GIVEN 3 admitted claims for one candidate \u2014 1 bound to a holocron-published `documents` row, 2 bound to external domains WHEN the independent-group count is recomputed for that component THEN the count reads 2 and the self-sourced row carries `self_sourced` = 1",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-provenance.test.ts -t 'AC-3'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "primary": false,
        "verification_service": "real Postgres holocron_nonprod (services/platform/src/db/client.ts)",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "self_sourced is never set, so holocron's own prior output corroborates itself",
            "the independence count includes every group regardless of the self_sourced flag",
            "the flag is derived from a hardcoded list instead of the documents category written by publishDocumentForRun",
            "the test injects a self_sourced value directly rather than publishing through the real document path"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "self_sourced_plus_two",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run `provenanceSweep` and persist the results",
                "SELECT self_sourced, provenance_group FROM sources for the 3 bound sources",
                "compute the independent-group count for the candidate's component"
              ]
            },
            "end_state": {
              "must_observe": [
                "the holocron-published source reads `self_sourced` = 1",
                "the independent-group count reads 2 rather than 3",
                "`SELECT count(*) FROM claim_evidence_bindings WHERE self_sourced = 1` returns 1"
              ],
              "must_not_observe": [
                "the independent-group count reads 3",
                "`self_sourced` is NULL or 0 on the holocron-published source",
                "`SELECT count(*) FROM claim_evidence_bindings` returns 0"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN the 3 syndicated sources sharing 1 content hash WHEN the caller passes distinct hand-written `independenceGroup` labels for the 3 claims THEN the sweep ignores the supplied labels and the independent-group count still reads 1",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-provenance.test.ts -t 'AC-4'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "primary": false,
        "verification_service": "real Postgres holocron_nonprod (services/platform/src/db/client.ts)",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "the sweep trusts the caller-supplied independenceGroup label, so relabelling manufactures independence",
            "provenance_group is copied straight from the input payload without hashing the content",
            "the sweep is stubbed to echo its input"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "syndicated_triplet",
            "action": {
              "actor": "cli_user",
              "steps": [
                "call `provenanceSweep` passing `independenceGroup` values 'g1', 'g2' and 'g3' for the 3 claims",
                "persist the results and SELECT DISTINCT provenance_group FROM claim_evidence_bindings"
              ]
            },
            "end_state": {
              "must_observe": [
                "`SELECT count(DISTINCT provenance_group) FROM claim_evidence_bindings` returns 1",
                "the persisted `provenance_group` matches the shared `content_hash` derivation, not 'g1'",
                "the independent-group count reads 1 for all 3 claims"
              ],
              "must_not_observe": [
                "`SELECT count(DISTINCT provenance_group) FROM claim_evidence_bindings` returns 3",
                "a persisted `provenance_group` equal to 'g1'",
                "the independent-group count reads 0"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Three sources sharing one content_hash across three domains persist a single distinct provenance_group",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-provenance.test.ts -t 'AC-1'",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "The independent-group count for the syndicated candidate reads 1",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-provenance.test.ts -t 'AC-1'",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "The lower-weighted 'pricing' claim is demoted to provisional with reason source_independence",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-provenance.test.ts -t 'AC-2'",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "The higher-weighted 'demand' claim remains status 'admitted' after the sweep",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-provenance.test.ts -t 'AC-2'",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "A source tracing to a publishDocumentForRun document is persisted with self_sourced = 1",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-provenance.test.ts -t 'AC-3'",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "The independent-group count reads 2 when one of the three supporting groups is self-sourced",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-provenance.test.ts -t 'AC-3'",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-7",
      "type": "test_criterion",
      "description": "Caller-supplied independenceGroup labels g1/g2/g3 do not raise the independent-group count above 1",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-provenance.test.ts -t 'AC-4'",
      "maps_to_ac": "AC-4"
    }
  ]
}
-->

</details>

## Acceptance Criteria

- [ ] AC-1 (PRIMARY): Byte-identical content across three domains collapses to one provenance group
- [ ] AC-2: One group cannot solely support two components
- [ ] AC-3: Self-sourced evidence never satisfies independence
- [ ] AC-4: A caller-supplied group label cannot buy independence
