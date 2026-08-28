# FUL-PLAT-002 — Decide deterministic claim admission

> **Sprint:** [sprint-01-produce-one-trustworthy-candidate-dossier-on-self-owned-inference](./SPRINT.md) · **Wave:** B
> **Assignee:** mastra-implementer · **Reviewer:** mastra-reviewer
> **Priority:** P0 · **Points:** 5 · **Type:** FEATURE
> **Proposed by:** mastra-planner
> **TDD mode:** `red_first` · **RED_GREEN_REQUIRED:** yes
> Status: Backlog

## What this does

Ship the deterministic admission predicate — tier-by-recency grading, exact quote verification against the persisted fetch artifact, and a recorded admit/provisional decision with a machine-readable reason for every claim.

## Why

Against real Postgres, a claim whose quote is verbatim in sources.normalized_text on a laddered in-window domain reads status 'admitted' with passes_gate true and qualifying_grade 0.92; unclassified, stale, sub-floor and fabricated-quote claims each read provisional with their own distinct reason.

## How to verify

Primary acceptance criterion **AC-1** (integration tier, service: real Postgres holocron_nonprod (services/platform/src/db/client.ts)):

```
PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-admission.test.ts -t 'AC-1'
```

Full gate set: 5 acceptance criteria, 12 test criteria, 3 verification gates.

## Scope

- services/platform/src/fulcrum/gate/grade.ts (NEW)
- services/platform/src/fulcrum/gate/verify-quote.ts (NEW)
- services/platform/src/fulcrum/gate/admission.ts (NEW)
- services/platform/src/fulcrum/admission-writer.ts (NEW)
- services/platform/tests/integration/fulcrum-admission.test.ts (NEW)

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

```
================================================================================
TASK: FUL-PLAT-002 - Decide deterministic claim admission
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
POINTS:     5
AGENT:      implementer=mastra-implementer | reviewer=mastra-reviewer
SPRINT:     sprint-01-produce-one-trustworthy-candidate-dossier-on-self-owned-inference (wave B)
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

Against real Postgres, a claim whose quote is verbatim in sources.normalized_text on a laddered in-window domain reads status 'admitted' with passes_gate true and qualifying_grade 0.92; unclassified, stale, sub-floor and fabricated-quote claims each read provisional with their own distinct reason.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier — read before acting)
--------------------------------------------------------------------------------

- MUST: MUST resolve the tier by lookup against the mission's active `domain_tier_versions` / `domain_tiers` rows read from Postgres
- MUST: MUST verify the quote against the persisted `sources.normalized_text` column, using exact mode only (`allowLines: false`)
- MUST: MUST persist status, passes_gate, qualifying_grade and the reason for every evaluated claim, including rejections
- NEVER: NEVER import a model client, call `generateText`, or reference the roles divergent / convergent / embed / judge inside services/platform/src/fulcrum/gate/**
- NEVER: NEVER assign a default tier value to an unclassified domain — return no grade and record `domain_unclassified`
- NEVER: NEVER accept a quote verified against the caller-supplied sourceText or a hybrid-search snippet
- STRICTLY: STRICTLY separate pure logic (services/platform/src/fulcrum/gate/**, zero I/O) from persistence (services/platform/src/fulcrum/admission-writer.ts) — the reviewer greps the gate directory for both model calls and sql imports

--------------------------------------------------------------------------------
CAPABILITY CHAIN
--------------------------------------------------------------------------------

touches_capabilities: CAP-EVIDENCE-01
provides:             fulcrum-evidence-grade, verified-quote-predicate, fulcrum-admission-decision
consumes:             fulcrum-ledger-tables, sources-fetch-artifact-columns, claims-admission-columns
boundary_contracts:
  - A claim's quote_text must be an exact substring of the bound source's sources.normalized_text or the claim is rejected with the distinct reason quote_unverified — never checked against a caller-supplied sourceText or an RRF snippet
  - A domain absent from the active domain_tiers ladder yields no grade and leaves the claim provisional — a model never assigns a tier
  - Every claim carries a persisted admission decision: claims.status, claims.passes_gate and claims.qualifying_grade, plus a machine-readable reason
  - The gate modules contain zero generateText calls and zero model-role identifiers (divergent / convergent / embed / judge)

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------

- [ ] AC-1 (PRIMARY): A quote-verified in-window classified claim is admitted and recorded
- [ ] AC-2: Each admission failure mode leaves the claim provisional with its own reason
- [ ] AC-3: A quote absent from normalized_text is rejected with its own reason
- [ ] AC-4: Grade is a deterministic tier-by-recency product
- [ ] AC-5: Gate modules contain no model call and no model role
- [ ] pnpm test:integration passes + pnpm tsgo --noEmit clean
- [ ] Only writeAllowed files modified (git diff --name-only)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD Beads — ordered happy-path first)
--------------------------------------------------------------------------------

AC-1: A quote-verified in-window classified claim is admitted and recorded [PRIMARY]
  GIVEN: a seeded `sources` row on 'sec.gov' whose `normalized_text` contains the 10-K sentence, and 1 bound claim with `status` = 'provisional'
  WHEN:  the evidence-gate caller runs `evaluateAdmission` over that claim with `quote_text` copied verbatim from `sources.normalized_text` and persists the decision
  THEN:  the stored claim reads `status` = 'admitted', `passes_gate` = true, and a numeric `qualifying_grade`

  TEST_TIER:            integration
  VERIFICATION_SERVICE: real Postgres holocron_nonprod (services/platform/src/db/client.ts)
  FLOW_REF:             CAP-EVIDENCE-01 → UC-LED-01 + UC-LED-02 + UC-LED-04
  TDD_STATE:            none
  VERIFY:               PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-admission.test.ts -t 'AC-1'

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             visible
    TOPOLOGY:         single-node
    SERVICE:          real Postgres holocron_nonprod (services/platform/src/db/client.ts)
    NEGATIVE_CONTROL: would fail if evaluateAdmission returns a hardcoded admitted verdict without reading sources.normalized_text; the admission writer is a no-op so the claims row is never updated from provisional; the test mocks the sql client, so an empty database still reports admitted; the grade function returns a constant instead of tier_value times recency decay
    EVIDENCE:         db_query (required_capture=True)
    CASES:
      - START_REF: graded_corpus_source
        ACTOR:     cli_user
        STEP:      read `sources.normalized_text` and copy the verbatim sentence 'Quarterly revenue grew 12% year-over-year according to the 10-K filing.' as the claim's `quote_text`
        STEP:      call `evaluateAdmission` through the evidence-gate caller with `grade_floor` = 0.5 and `recency_window_days` = 365
        STEP:      persist the decision through the admission writer
        STEP:      SELECT status, passes_gate, qualifying_grade, metadata_json FROM claims WHERE id = the seeded claim
        MUST_OBSERVE:     the stored claim reads `status` = 'admitted'
        MUST_OBSERVE:     the stored claim reads `passes_gate` = true
        MUST_OBSERVE:     `qualifying_grade` is 0.92 for tier_value 1.0 decayed over 30 days
        MUST_OBSERVE:     the decision reason reads `admitted_quote_verified`
        MUST_NOT_OBSERVE: the stored claim still reads `status` = 'provisional'
        MUST_NOT_OBSERVE: `qualifying_grade` is NULL or 0
        MUST_NOT_OBSERVE: `SELECT count(*) FROM claims WHERE status = 'admitted'` returns 0

AC-2: Each admission failure mode leaves the claim provisional with its own reason
  GIVEN: three seeded claims: one on an unclassified domain, one outside the 365-day window, one with a sub-floor grade
  WHEN:  the evidence-gate caller evaluates all three and persists the decisions
  THEN:  each claim reads `status` = 'provisional' with a distinct machine-readable reason

  TEST_TIER:            integration
  VERIFICATION_SERVICE: real Postgres holocron_nonprod (services/platform/src/db/client.ts)
  FLOW_REF:             CAP-EVIDENCE-01 → UC-LED-02 AC-2/AC-3
  TDD_STATE:            none
  VERIFY:               PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-admission.test.ts -t 'AC-2'

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             visible
    TOPOLOGY:         single-node
    SERVICE:          real Postgres holocron_nonprod (services/platform/src/db/client.ts)
    NEGATIVE_CONTROL: would fail if every failure path returns the same generic 'not admitted' reason, so a stub satisfies all three cases; the unclassified branch assigns a default tier value instead of leaving the grade absent; the recency window is ignored and stale evidence is admitted; the reason field is never persisted to claims.metadata_json
    EVIDENCE:         db_query (required_capture=True)
    CASES:
      - START_REF: unclassified_corpus_source
        ACTOR:     cli_user
        STEP:      call `evaluateAdmission` for the claim bound to 'randomblog.example'
        STEP:      persist the decision and SELECT status, qualifying_grade, metadata_json FROM claims
        MUST_OBSERVE:     the stored claim reads `status` = 'provisional'
        MUST_OBSERVE:     the reason reads `domain_unclassified`
        MUST_OBSERVE:     `qualifying_grade` is NULL because no tier value exists
        MUST_NOT_OBSERVE: the stored claim reads `status` = 'admitted'
        MUST_NOT_OBSERVE: a `qualifying_grade` of 0
        MUST_NOT_OBSERVE: the reason string is empty
      - START_REF: stale_corpus_source
        ACTOR:     cli_user
        STEP:      call `evaluateAdmission` for the 900-day-old 'sec.gov' claim with `recency_window_days` = 365
        STEP:      persist the decision and SELECT status, metadata_json FROM claims
        MUST_OBSERVE:     the stored claim reads `status` = 'provisional'
        MUST_OBSERVE:     the reason reads `evidence_out_of_window`
        MUST_OBSERVE:     `SELECT count(*) FROM claims WHERE status = 'admitted'` returns 0
        MUST_NOT_OBSERVE: the stored claim reads `status` = 'admitted'
        MUST_NOT_OBSERVE: the reason reads `domain_unclassified` for a classified sec.gov source
        MUST_NOT_OBSERVE: no reason recorded at all
      - START_REF: graded_corpus_source
        ACTOR:     cli_user
        STEP:      call `evaluateAdmission` for the 'sec.gov' claim with `grade_floor` raised to 0.98
        STEP:      persist the decision and SELECT status, qualifying_grade, metadata_json FROM claims
        MUST_OBSERVE:     the stored claim reads `status` = 'provisional'
        MUST_OBSERVE:     the reason reads `grade_below_floor`
        MUST_OBSERVE:     `qualifying_grade` reads 0.92 which is under the 0.98 floor
        MUST_NOT_OBSERVE: the stored claim reads `status` = 'admitted'
        MUST_NOT_OBSERVE: the reason reads `evidence_out_of_window` for an in-window source
        MUST_NOT_OBSERVE: an empty reason string with `qualifying_grade` NULL

AC-3: A quote absent from normalized_text is rejected with its own reason
  GIVEN: a seeded 'sec.gov' source whose `normalized_text` does not contain the string 'holocron guarantees 70% margin'
  WHEN:  the caller submits a claim carrying that fabricated quote, and separately a quote taken from the 280-character RRF snippet buffer
  THEN:  both claims read `status` = 'provisional' with reason `quote_unverified`, distinct from the other failure reasons

  TEST_TIER:            integration
  VERIFICATION_SERVICE: real Postgres holocron_nonprod (services/platform/src/db/client.ts)
  FLOW_REF:             CAP-EVIDENCE-01 → UC-LED-04
  TDD_STATE:            none
  VERIFY:               PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-admission.test.ts -t 'AC-3'

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             visible
    TOPOLOGY:         single-node
    SERVICE:          real Postgres holocron_nonprod (services/platform/src/db/client.ts)
    NEGATIVE_CONTROL: would fail if the quote check compares against the caller-supplied sourceText instead of the persisted sources.normalized_text, making self-citation pass; verifyQuote is stubbed to return true; the rejected-for-quote reason is collapsed into the generic provisional reason; lines-mode matching is enabled, admitting a quote assembled from non-adjacent fragments
    EVIDENCE:         db_query (required_capture=True)
    CASES:
      - START_REF: graded_corpus_source
        ACTOR:     cli_user
        STEP:      submit a claim whose `quote_text` is the fabricated string 'holocron guarantees 70% margin'
        STEP:      call `evaluateAdmission` and persist the decision
        STEP:      SELECT status, passes_gate, metadata_json FROM claims
        MUST_OBSERVE:     the stored claim reads `status` = 'provisional'
        MUST_OBSERVE:     the reason reads `quote_unverified`
        MUST_OBSERVE:     the stored claim reads `passes_gate` = false
        MUST_NOT_OBSERVE: the stored claim reads `status` = 'admitted'
        MUST_NOT_OBSERVE: the reason reads `grade_below_floor` for a floor-clearing source
        MUST_NOT_OBSERVE: no reason persisted
      - START_REF: graded_corpus_source
        ACTOR:     cli_user
        STEP:      build a quote by slicing the first 280 characters of the hybrid-search `sourceText` snippet rather than `sources.normalized_text`
        STEP:      call `evaluateAdmission` with that quote and persist the decision
        STEP:      SELECT status, metadata_json FROM claims
        MUST_OBSERVE:     the stored claim reads `status` = 'provisional'
        MUST_OBSERVE:     the reason reads `quote_unverified`
        MUST_OBSERVE:     `SELECT count(*) FROM claims WHERE passes_gate = true` returns 0
        MUST_NOT_OBSERVE: the stored claim reads `status` = 'admitted'
        MUST_NOT_OBSERVE: `passes_gate` = true for an RRF-sliced quote
        MUST_NOT_OBSERVE: no reason persisted
      - START_REF: graded_corpus_source
        ACTOR:     cli_user
        STEP:      submit a claim whose `quote_text` is the verbatim 10-K sentence from `sources.normalized_text`
        STEP:      call `evaluateAdmission` and persist the decision
        STEP:      SELECT status FROM claims
        MUST_OBSERVE:     the stored claim reads `status` = 'admitted'
        MUST_OBSERVE:     `SELECT count(*) FROM claims WHERE passes_gate = true` returns 1
        MUST_NOT_OBSERVE: the stored claim reads `status` = 'provisional'
        MUST_NOT_OBSERVE: `SELECT count(*) FROM claims WHERE passes_gate = true` returns 0

AC-4: Grade is a deterministic tier-by-recency product
  GIVEN: an active `domain_tiers` ladder mapping 'sec.gov' to `tier_value` = 1.0 with a 180-day half-life
  WHEN:  `gradeEvidence` is called twice with the identical tier value, retrieved_at and now
  THEN:  both calls return the byte-identical grade 0.89 and an unladdered domain returns no grade

  TEST_TIER:            integration
  VERIFICATION_SERVICE: real Postgres holocron_nonprod (services/platform/src/db/client.ts)
  FLOW_REF:             CAP-EVIDENCE-01 → UC-LED-01
  TDD_STATE:            none
  VERIFY:               PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-admission.test.ts -t 'AC-4'

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             visible
    TOPOLOGY:         single-node
    SERVICE:          real Postgres holocron_nonprod (services/platform/src/db/client.ts)
    NEGATIVE_CONTROL: would fail if gradeEvidence returns a constant regardless of tier value or age; the tier is resolved by a model call instead of a domain_tiers lookup; an unknown domain is silently assigned a default tier; the ladder is read from a hardcoded map instead of the active domain_tier_versions row
    EVIDENCE:         db_query (required_capture=True)
    CASES:
      - START_REF: graded_corpus_source
        ACTOR:     cli_user
        STEP:      read `tier_value` = 1.0 for 'sec.gov' from the active `domain_tiers` row
        STEP:      call `gradeEvidence(tierValue, retrievedAt, halfLifeDays = 180, now)` twice with identical arguments
        STEP:      compare the two returned values as strings
        MUST_OBSERVE:     the first call returns 0.89
        MUST_OBSERVE:     the second call returns the byte-identical string '0.89'
        MUST_OBSERVE:     the two grades compare equal across 2 invocations
        MUST_NOT_OBSERVE: the two calls differ
        MUST_NOT_OBSERVE: the grade returns 0
        MUST_NOT_OBSERVE: the grade returns NULL for a laddered domain
      - START_REF: unclassified_corpus_source
        ACTOR:     cli_user
        STEP:      look up 'randomblog.example' in the active `domain_tiers` ladder
        STEP:      call `gradeEvidence(tierValue = null, retrievedAt, halfLifeDays = 180, now)`
        MUST_OBSERVE:     the ladder lookup returns 0 matching `domain_tiers` rows
        MUST_OBSERVE:     `gradeEvidence` returns null rather than a numeric grade
        MUST_NOT_OBSERVE: a numeric grade such as 0.5 for an unladdered domain
        MUST_NOT_OBSERVE: a default tier value applied

AC-5: Gate modules contain no model call and no model role
  GIVEN: the three implemented gate modules on disk
  WHEN:  the test scans their source text for `generateText` and for the model-role identifiers divergent, convergent, embed and judge
  THEN:  all three files are scanned and both occurrence counts read 0

  TEST_TIER:            integration
  VERIFICATION_SERVICE: real filesystem scan of services/platform/src/fulcrum/gate (no model process)
  FLOW_REF:             CAP-EVIDENCE-01 boundary: determinism seam
  TDD_STATE:            none
  VERIFY:               PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-admission.test.ts -t 'AC-5'

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             visible
    TOPOLOGY:         single-node
    SERVICE:          real filesystem scan of services/platform/src/fulcrum/gate (no model process)
    NEGATIVE_CONTROL: would fail if the scan globs a directory that does not exist, so 0 files are read and the assertion passes vacuously; the gate imports a model client indirectly through a barrel, which a literal-only scan misses; the scan is stubbed to return an empty match list without reading the filesystem
    EVIDENCE:         file_artifact (required_capture=True)
    CASES:
      - START_REF: gate_module_tree
        ACTOR:     cli_user
        STEP:      read `services/platform/src/fulcrum/gate/grade.ts`, `verify-quote.ts` and `admission.ts` from the real filesystem
        STEP:      count occurrences of `generateText` and of the identifiers `divergent`, `convergent`, `embed`, `judge`
        MUST_OBSERVE:     the scan report names all 3 files `grade.ts`, `verify-quote.ts`, `admission.ts`
        MUST_OBSERVE:     the `generateText` occurrence count reads 0
        MUST_OBSERVE:     the model-role identifier occurrence count reads 0
        MUST_OBSERVE:     the scan report lists 3 files scanned
        MUST_NOT_OBSERVE: 0 files scanned
        MUST_NOT_OBSERVE: a `generateText` occurrence inside any gate module
        MUST_NOT_OBSERVE: the identifier `judge` anywhere on the Fulcrum path

--------------------------------------------------------------------------------
TEST CRITERIA (boolean — each maps to an AC)
--------------------------------------------------------------------------------

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 |  | AC-1 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-admission.test.ts -t 'AC-1'` |
| TC-2 |  | AC-1 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-admission.test.ts -t 'AC-1'` |
| TC-3 |  | AC-1 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-admission.test.ts -t 'AC-1'` |
| TC-4 |  | AC-2 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-admission.test.ts -t 'AC-2'` |
| TC-5 |  | AC-2 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-admission.test.ts -t 'AC-2'` |
| TC-6 |  | AC-2 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-admission.test.ts -t 'AC-2'` |
| TC-7 |  | AC-3 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-admission.test.ts -t 'AC-3'` |
| TC-8 |  | AC-3 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-admission.test.ts -t 'AC-3'` |
| TC-9 |  | AC-4 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-admission.test.ts -t 'AC-4'` |
| TC-10 |  | AC-4 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-admission.test.ts -t 'AC-4'` |
| TC-11 |  | AC-5 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-admission.test.ts -t 'AC-5'` |
| TC-12 |  | AC-5 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-admission.test.ts -t 'AC-5'` |

--------------------------------------------------------------------------------
SCOPE (file-level write permissions)
--------------------------------------------------------------------------------

writeAllowed:
- services/platform/src/fulcrum/gate/grade.ts (NEW)
- services/platform/src/fulcrum/gate/verify-quote.ts (NEW)
- services/platform/src/fulcrum/gate/admission.ts (NEW)
- services/platform/src/fulcrum/admission-writer.ts (NEW)
- services/platform/tests/integration/fulcrum-admission.test.ts (NEW)

writeProhibited:
- services/platform/src/fulcrum/gate/provenance.ts — owned by FUL-PLAT-003
- services/platform/src/fulcrum/gate/score.ts — owned by FUL-PLAT-004
- services/platform/src/fulcrum/contract.ts and services/platform/src/fulcrum/missions/** — owned by FUL-PLAT-005
- services/platform/src/fulcrum/retrieval.ts — owned by FUL-PLAT-006
- services/platform/src/db/** — owned by FUL-PLAT-001
- services/platform/src/research/** — the shipped on-demand research path stays untouched
- Any file not listed in write_allowed
- Any file not explicitly listed above

--------------------------------------------------------------------------------
CODE PATTERN
--------------------------------------------------------------------------------

Source: services/platform/src/research/evidence-gate.ts (evaluateEvidenceGate) + services/platform/src/research/quote-match.ts

Strict Zod input schema -> pure predicate -> structured result carrying status, passesGate, qualifyingGrade and a machine-readable reason; a separate writer persists it.

ANTI-PATTERN: services/platform/src/mission/runtime.ts:342-398 mapRrfHitsToEvidenceGateInput — `quoteInSource = sourceText.slice(0, 280)` makes `sourceText.includes(quote)` vacuously true. Admission must read the persisted sources.normalized_text, never the payload the caller handed in.

References:
- .spec/prds/fulcrum/09-technical-requirements/04-api-design.md § Evidence Gate — the exact five function signatures
- services/platform/src/research/evidence-gate.ts — the shipped deterministic-gate precedent in this repo

Notes:
- T
- h
- e
-  
- g
- a
- t
- e
-  
- d
- i
- r
- e
- c
- t
- o
- r
- y
-  
- i
- s
-  
- p
- u
- r
- e
- :
-  
- i
- t
-  
- t
- a
- k
- e
- s
-  
- a
- l
- r
- e
- a
- d
- y
- -
- r
- e
- a
- d
-  
- v
- a
- l
- u
- e
- s
-  
- (
- t
- i
- e
- r
- V
- a
- l
- u
- e
- ,
-  
- r
- e
- t
- r
- i
- e
- v
- e
- d
- A
- t
- ,
-  
- n
- o
- r
- m
- a
- l
- i
- z
- e
- d
- T
- e
- x
- t
- )
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
- c
- i
- s
- i
- o
- n
- .
-  
- R
- e
- a
- d
- i
- n
- g
-  
- t
- h
- e
-  
- l
- a
- d
- d
- e
- r
-  
- a
- n
- d
-  
- w
- r
- i
- t
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
- c
- i
- s
- i
- o
- n
-  
- l
- i
- v
- e
-  
- i
- n
-  
- a
- d
- m
- i
- s
- s
- i
- o
- n
- -
- w
- r
- i
- t
- e
- r
- .
- t
- s
-  
- s
- o
-  
- t
- h
- e
-  
- r
- e
- v
- i
- e
- w
- e
- r
- '
- s
-  
- g
- r
- e
- p
-  
- o
- v
- e
- r
-  
- s
- e
- r
- v
- i
- c
- e
- s
- /
- p
- l
- a
- t
- f
- o
- r
- m
- /
- s
- r
- c
- /
- f
- u
- l
- c
- r
- u
- m
- /
- g
- a
- t
- e
- /
- *
- *
-  
- f
- i
- n
- d
- s
-  
- n
- e
- i
- t
- h
- e
- r
-  
- a
-  
- m
- o
- d
- e
- l
-  
- c
- l
- i
- e
- n
- t
-  
- n
- o
- r
-  
- a
-  
- s
- q
- l
-  
- i
- m
- p
- o
- r
- t
- .
-  
- T
- h
- e
-  
- c
- a
- l
- l
- e
- r
-  
- f
- o
- r
-  
- t
- h
- i
- s
-  
- w
- a
- v
- e
-  
- i
- s
-  
- t
- h
- e
-  
- i
- n
- t
- e
- g
- r
- a
- t
- i
- o
- n
-  
- t
- e
- s
- t
-  
- i
- t
- s
- e
- l
- f
-  
- s
- t
- a
- n
- d
- i
- n
- g
-  
- i
- n
-  
- f
- o
- r
-  
- t
- h
- e
-  
- e
- v
- i
- d
- e
- n
- c
- e
- -
- g
- a
- t
- e
-  
- s
- t
- a
- g
- e
-  
- e
- x
- e
- c
- u
- t
- o
- r
- ;
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
- 0
- 8
-  
- w
- i
- r
- e
- s
-  
- t
- h
- e
-  
- s
- t
- a
- g
- e
- .

--------------------------------------------------------------------------------
READING LIST (max 5 — canonical pattern first)
--------------------------------------------------------------------------------

1. services/platform/src/research/evidence-gate.ts
   - Lines: 1-105
   - Focus: [PRIMARY PATTERN] the existing deterministic admission seam — strict Zod input schema, pure predicate, structured result with a reason string, independence keyed on canonical source identity rather than a caller-supplied label
2. services/platform/src/research/quote-match.ts
   - Lines: 1-45
   - Focus: verifyQuote exact-vs-lines modes and MIN_QUOTE_CHARS; the gate must call it with allowLines:false against normalized_text
3. services/platform/src/research/grade.ts
   - Lines: 1-88
   - Focus: Closest existing grading shape (rule-derived, model proposal can only lower). Fulcrum replaces the 1..5 ceiling model with tier_value times recency decay in [0,1]
4. services/platform/src/db/schema/evidence.ts
   - Lines: 82-103
   - Focus: The claims table this task writes status / passes_gate / qualifying_grade onto (columns added by FUL-PLAT-001)
5. services/platform/tests/integration/research-evidence-core.test.ts
   - Lines: 1-70
   - Focus: Integration-lane conventions: fail-closed beforeAll, holocron_nonprod guard, real createSql, no it.skip

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
  Command:  pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error services/platform/src/fulcrum/gate/grade.ts services/platform/src/fulcrum/gate/verify-quote.ts services/platform/src/fulcrum/gate/admission.ts services/platform/src/fulcrum/admission-writer.ts services/platform/tests/integration/fulcrum-admission.test.ts
  Expected: None

Gate S: Scenario is un-fakeable (PRIMARY) — supersedes 'Exit 0' as the bar for done.
  Verify: validate_scenario.py passes on the PRIMARY AC scenario (exit 0).
  Verify: RED-against-start observed and recorded before green.
  Verify: captured evidence shows the seeded MUST_OBSERVE value, not merely 'tests passed'.

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------

Implementer: mastra-implementer
Rationale:   The admission predicate is the Fulcrum determinism seam inside the Mastra platform (services/platform/src) — pure TypeScript modules plus a Postgres writer, proven on the real integration lane. mastra-implementer owns backend + agent-platform code and is the agent contractually bound to TDD against real Postgres.
Reviewer:    mastra-reviewer

--------------------------------------------------------------------------------
CODING STANDARDS
--------------------------------------------------------------------------------

- Every module input and output is a real Zod schema — no z.any() and no untyped Record on the admission path
- Reason values are a closed string-literal union (admitted_quote_verified | quote_unverified | domain_unclassified | evidence_out_of_window | grade_below_floor | no_evidence), never a free-form message
- Pure gate modules import nothing from services/platform/src/db and nothing from any model or fleet client
- Grades are doublePrecision in [0,1]; comparisons use an explicit epsilon-free exact predicate so determinism is testable

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------

Depends on: FUL-PLAT-001
Blocks:     FUL-PLAT-003, FUL-PLAT-004, FUL-PLAT-008
Wave:       B

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
  "task_id": "FUL-PLAT-002",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "graded_corpus_source": {
      "description": "one `sources` row seeded by `bun services/platform/src/cli/holo.ts evidence:seed` with `source_domain` = 'sec.gov', `retrieved_at` 30 days old, and a 1200-character `normalized_text` containing the sentence 'Quarterly revenue grew 12% year-over-year according to the 10-K filing.'",
      "seed_method": "cli",
      "records": [
        "`sources.source_domain` = 'sec.gov'",
        "`sources.normalized_text` holds 1200 characters including the 10-K sentence",
        "`domain_tiers` maps 'sec.gov' to `tier_value` = 1.0",
        "`claims` holds 1 row with `status` = 'provisional' and `passes_gate` = false"
      ]
    },
    "unclassified_corpus_source": {
      "description": "one `sources` row seeded by `holo evidence:seed` with `source_domain` = 'randomblog.example' which is absent from the active domain_tiers ladder",
      "seed_method": "cli",
      "records": [
        "`sources.source_domain` = 'randomblog.example'",
        "`domain_tiers` holds 0 rows for 'randomblog.example'",
        "`claims` holds 1 row with `status` = 'provisional'"
      ]
    },
    "stale_corpus_source": {
      "description": "one `sources` row seeded by `holo evidence:seed` with `source_domain` = 'sec.gov' and `retrieved_at` 900 days old, outside the component's 365-day recency window",
      "seed_method": "cli",
      "records": [
        "`sources.retrieved_at` is 900 days before now",
        "`weight_components.recency_window_days` = 365 for component 'demand'",
        "`claims` holds 1 row with `status` = 'provisional'"
      ]
    },
    "gate_module_tree": {
      "description": "the three Fulcrum gate modules on disk after implementation \u2014 grade.ts, verify-quote.ts, admission.ts",
      "seed_method": "cli",
      "records": [
        "`services/platform/src/fulcrum/gate/grade.ts` is 1 readable file",
        "`services/platform/src/fulcrum/gate/verify-quote.ts` is 1 readable file",
        "`services/platform/src/fulcrum/gate/admission.ts` is 1 readable file"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN a seeded `sources` row on 'sec.gov' whose `normalized_text` contains the 10-K sentence, and 1 bound claim with `status` = 'provisional' WHEN the evidence-gate caller runs `evaluateAdmission` over that claim with `quote_text` copied verbatim from `sources.normalized_text` and persists the decision THEN the stored claim reads `status` = 'admitted', `passes_gate` = true, and a numeric `qualifying_grade`",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-admission.test.ts -t 'AC-1'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "primary": true,
        "verification_service": "real Postgres holocron_nonprod (services/platform/src/db/client.ts)",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "evaluateAdmission returns a hardcoded admitted verdict without reading sources.normalized_text",
            "the admission writer is a no-op so the claims row is never updated from provisional",
            "the test mocks the sql client, so an empty database still reports admitted",
            "the grade function returns a constant instead of tier_value times recency decay"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "graded_corpus_source",
            "action": {
              "actor": "cli_user",
              "steps": [
                "read `sources.normalized_text` and copy the verbatim sentence 'Quarterly revenue grew 12% year-over-year according to the 10-K filing.' as the claim's `quote_text`",
                "call `evaluateAdmission` through the evidence-gate caller with `grade_floor` = 0.5 and `recency_window_days` = 365",
                "persist the decision through the admission writer",
                "SELECT status, passes_gate, qualifying_grade, metadata_json FROM claims WHERE id = the seeded claim"
              ]
            },
            "end_state": {
              "must_observe": [
                "the stored claim reads `status` = 'admitted'",
                "the stored claim reads `passes_gate` = true",
                "`qualifying_grade` is 0.92 for tier_value 1.0 decayed over 30 days",
                "the decision reason reads `admitted_quote_verified`"
              ],
              "must_not_observe": [
                "the stored claim still reads `status` = 'provisional'",
                "`qualifying_grade` is NULL or 0",
                "`SELECT count(*) FROM claims WHERE status = 'admitted'` returns 0"
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
      "description": "GIVEN three seeded claims: one on an unclassified domain, one outside the 365-day window, one with a sub-floor grade WHEN the evidence-gate caller evaluates all three and persists the decisions THEN each claim reads `status` = 'provisional' with a distinct machine-readable reason",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-admission.test.ts -t 'AC-2'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "primary": false,
        "verification_service": "real Postgres holocron_nonprod (services/platform/src/db/client.ts)",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "every failure path returns the same generic 'not admitted' reason, so a stub satisfies all three cases",
            "the unclassified branch assigns a default tier value instead of leaving the grade absent",
            "the recency window is ignored and stale evidence is admitted",
            "the reason field is never persisted to claims.metadata_json"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "unclassified_corpus_source",
            "action": {
              "actor": "cli_user",
              "steps": [
                "call `evaluateAdmission` for the claim bound to 'randomblog.example'",
                "persist the decision and SELECT status, qualifying_grade, metadata_json FROM claims"
              ]
            },
            "end_state": {
              "must_observe": [
                "the stored claim reads `status` = 'provisional'",
                "the reason reads `domain_unclassified`",
                "`qualifying_grade` is NULL because no tier value exists"
              ],
              "must_not_observe": [
                "the stored claim reads `status` = 'admitted'",
                "a `qualifying_grade` of 0",
                "the reason string is empty"
              ]
            }
          },
          {
            "start_ref": "stale_corpus_source",
            "action": {
              "actor": "cli_user",
              "steps": [
                "call `evaluateAdmission` for the 900-day-old 'sec.gov' claim with `recency_window_days` = 365",
                "persist the decision and SELECT status, metadata_json FROM claims"
              ]
            },
            "end_state": {
              "must_observe": [
                "the stored claim reads `status` = 'provisional'",
                "the reason reads `evidence_out_of_window`",
                "`SELECT count(*) FROM claims WHERE status = 'admitted'` returns 0"
              ],
              "must_not_observe": [
                "the stored claim reads `status` = 'admitted'",
                "the reason reads `domain_unclassified` for a classified sec.gov source",
                "no reason recorded at all"
              ]
            }
          },
          {
            "start_ref": "graded_corpus_source",
            "action": {
              "actor": "cli_user",
              "steps": [
                "call `evaluateAdmission` for the 'sec.gov' claim with `grade_floor` raised to 0.98",
                "persist the decision and SELECT status, qualifying_grade, metadata_json FROM claims"
              ]
            },
            "end_state": {
              "must_observe": [
                "the stored claim reads `status` = 'provisional'",
                "the reason reads `grade_below_floor`",
                "`qualifying_grade` reads 0.92 which is under the 0.98 floor"
              ],
              "must_not_observe": [
                "the stored claim reads `status` = 'admitted'",
                "the reason reads `evidence_out_of_window` for an in-window source",
                "an empty reason string with `qualifying_grade` NULL"
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
      "description": "GIVEN a seeded 'sec.gov' source whose `normalized_text` does not contain the string 'holocron guarantees 70% margin' WHEN the caller submits a claim carrying that fabricated quote, and separately a quote taken from the 280-character RRF snippet buffer THEN both claims read `status` = 'provisional' with reason `quote_unverified`, distinct from the other failure reasons",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-admission.test.ts -t 'AC-3'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "primary": false,
        "verification_service": "real Postgres holocron_nonprod (services/platform/src/db/client.ts)",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "the quote check compares against the caller-supplied sourceText instead of the persisted sources.normalized_text, making self-citation pass",
            "verifyQuote is stubbed to return true",
            "the rejected-for-quote reason is collapsed into the generic provisional reason",
            "lines-mode matching is enabled, admitting a quote assembled from non-adjacent fragments"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "graded_corpus_source",
            "action": {
              "actor": "cli_user",
              "steps": [
                "submit a claim whose `quote_text` is the fabricated string 'holocron guarantees 70% margin'",
                "call `evaluateAdmission` and persist the decision",
                "SELECT status, passes_gate, metadata_json FROM claims"
              ]
            },
            "end_state": {
              "must_observe": [
                "the stored claim reads `status` = 'provisional'",
                "the reason reads `quote_unverified`",
                "the stored claim reads `passes_gate` = false"
              ],
              "must_not_observe": [
                "the stored claim reads `status` = 'admitted'",
                "the reason reads `grade_below_floor` for a floor-clearing source",
                "no reason persisted"
              ]
            }
          },
          {
            "start_ref": "graded_corpus_source",
            "action": {
              "actor": "cli_user",
              "steps": [
                "build a quote by slicing the first 280 characters of the hybrid-search `sourceText` snippet rather than `sources.normalized_text`",
                "call `evaluateAdmission` with that quote and persist the decision",
                "SELECT status, metadata_json FROM claims"
              ]
            },
            "end_state": {
              "must_observe": [
                "the stored claim reads `status` = 'provisional'",
                "the reason reads `quote_unverified`",
                "`SELECT count(*) FROM claims WHERE passes_gate = true` returns 0"
              ],
              "must_not_observe": [
                "the stored claim reads `status` = 'admitted'",
                "`passes_gate` = true for an RRF-sliced quote",
                "no reason persisted"
              ]
            }
          },
          {
            "start_ref": "graded_corpus_source",
            "action": {
              "actor": "cli_user",
              "steps": [
                "submit a claim whose `quote_text` is the verbatim 10-K sentence from `sources.normalized_text`",
                "call `evaluateAdmission` and persist the decision",
                "SELECT status FROM claims"
              ]
            },
            "end_state": {
              "must_observe": [
                "the stored claim reads `status` = 'admitted'",
                "`SELECT count(*) FROM claims WHERE passes_gate = true` returns 1"
              ],
              "must_not_observe": [
                "the stored claim reads `status` = 'provisional'",
                "`SELECT count(*) FROM claims WHERE passes_gate = true` returns 0"
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
      "description": "GIVEN an active `domain_tiers` ladder mapping 'sec.gov' to `tier_value` = 1.0 with a 180-day half-life WHEN `gradeEvidence` is called twice with the identical tier value, retrieved_at and now THEN both calls return the byte-identical grade 0.89 and an unladdered domain returns no grade",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-admission.test.ts -t 'AC-4'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "primary": false,
        "verification_service": "real Postgres holocron_nonprod (services/platform/src/db/client.ts)",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "gradeEvidence returns a constant regardless of tier value or age",
            "the tier is resolved by a model call instead of a domain_tiers lookup",
            "an unknown domain is silently assigned a default tier",
            "the ladder is read from a hardcoded map instead of the active domain_tier_versions row"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "graded_corpus_source",
            "action": {
              "actor": "cli_user",
              "steps": [
                "read `tier_value` = 1.0 for 'sec.gov' from the active `domain_tiers` row",
                "call `gradeEvidence(tierValue, retrievedAt, halfLifeDays = 180, now)` twice with identical arguments",
                "compare the two returned values as strings"
              ]
            },
            "end_state": {
              "must_observe": [
                "the first call returns 0.89",
                "the second call returns the byte-identical string '0.89'",
                "the two grades compare equal across 2 invocations"
              ],
              "must_not_observe": [
                "the two calls differ",
                "the grade returns 0",
                "the grade returns NULL for a laddered domain"
              ]
            }
          },
          {
            "start_ref": "unclassified_corpus_source",
            "action": {
              "actor": "cli_user",
              "steps": [
                "look up 'randomblog.example' in the active `domain_tiers` ladder",
                "call `gradeEvidence(tierValue = null, retrievedAt, halfLifeDays = 180, now)`"
              ]
            },
            "end_state": {
              "must_observe": [
                "the ladder lookup returns 0 matching `domain_tiers` rows",
                "`gradeEvidence` returns null rather than a numeric grade"
              ],
              "must_not_observe": [
                "a numeric grade such as 0.5 for an unladdered domain",
                "a default tier value applied"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN the three implemented gate modules on disk WHEN the test scans their source text for `generateText` and for the model-role identifiers divergent, convergent, embed and judge THEN all three files are scanned and both occurrence counts read 0",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-admission.test.ts -t 'AC-5'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "primary": false,
        "verification_service": "real filesystem scan of services/platform/src/fulcrum/gate (no model process)",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "the scan globs a directory that does not exist, so 0 files are read and the assertion passes vacuously",
            "the gate imports a model client indirectly through a barrel, which a literal-only scan misses",
            "the scan is stubbed to return an empty match list without reading the filesystem"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "gate_module_tree",
            "action": {
              "actor": "cli_user",
              "steps": [
                "read `services/platform/src/fulcrum/gate/grade.ts`, `verify-quote.ts` and `admission.ts` from the real filesystem",
                "count occurrences of `generateText` and of the identifiers `divergent`, `convergent`, `embed`, `judge`"
              ]
            },
            "end_state": {
              "must_observe": [
                "the scan report names all 3 files `grade.ts`, `verify-quote.ts`, `admission.ts`",
                "the `generateText` occurrence count reads 0",
                "the model-role identifier occurrence count reads 0",
                "the scan report lists 3 files scanned"
              ],
              "must_not_observe": [
                "0 files scanned",
                "a `generateText` occurrence inside any gate module",
                "the identifier `judge` anywhere on the Fulcrum path"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "A claim whose quote_text is a verbatim substring of sources.normalized_text is stored with status 'admitted'",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-admission.test.ts -t 'AC-1'",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "The admitted claim row carries qualifying_grade 0.92",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-admission.test.ts -t 'AC-1'",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "The admitted claim row carries passes_gate true",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-admission.test.ts -t 'AC-1'",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "A claim bound to a domain absent from domain_tiers is stored provisional with reason domain_unclassified",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-admission.test.ts -t 'AC-2'",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "A claim whose evidence is 900 days old against a 365-day window is stored provisional with reason evidence_out_of_window",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-admission.test.ts -t 'AC-2'",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "A claim graded 0.92 against a 0.98 floor is stored provisional with reason grade_below_floor",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-admission.test.ts -t 'AC-2'",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-7",
      "type": "test_criterion",
      "description": "A claim carrying a fabricated quote is stored provisional with reason quote_unverified",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-admission.test.ts -t 'AC-3'",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-8",
      "type": "test_criterion",
      "description": "A quote sliced from the 280-character RRF sourceText buffer is stored provisional with reason quote_unverified",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-admission.test.ts -t 'AC-3'",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-9",
      "type": "test_criterion",
      "description": "Two gradeEvidence calls with identical arguments return the byte-identical value 0.89",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-admission.test.ts -t 'AC-4'",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-10",
      "type": "test_criterion",
      "description": "gradeEvidence returns null when the domain has no domain_tiers row in the active ladder",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-admission.test.ts -t 'AC-4'",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-11",
      "type": "test_criterion",
      "description": "The filesystem scan of the three gate modules reports 0 occurrences of generateText",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-admission.test.ts -t 'AC-5'",
      "maps_to_ac": "AC-5"
    },
    {
      "id": "TC-12",
      "type": "test_criterion",
      "description": "The filesystem scan of the three gate modules reports 0 model-role identifiers",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-admission.test.ts -t 'AC-5'",
      "maps_to_ac": "AC-5"
    }
  ]
}
-->

</details>
