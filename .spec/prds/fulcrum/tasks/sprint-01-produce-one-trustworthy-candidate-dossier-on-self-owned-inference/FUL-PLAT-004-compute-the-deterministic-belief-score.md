# FUL-PLAT-004 — Compute the deterministic belief score

> **Sprint:** [sprint-01-produce-one-trustworthy-candidate-dossier-on-self-owned-inference](./SPRINT.md) · **Wave:** D
> **Assignee:** mastra-implementer · **Reviewer:** mastra-reviewer
> **Priority:** P0 · **Points:** 3 · **Type:** FEATURE
> **Proposed by:** mastra-planner
> **TDD mode:** `red_first` · **RED_GREEN_REQUIRED:** yes
> Status: Backlog

## What this does

Ship the saturating, disconfirmation-weighted, sparsity-aware score aggregation and append it as a version-stamped belief_scores row.

## Why

Against real Postgres, grades 1.0/0.9/0.8/0.7 on a weight-0.5 component persist score 0.45 with support factor 0.9; adding a 0.4 refuter at multiplier 2 drops it to exactly 0.05; a recompute appends a byte-identical 0.45; an empty component reads UNKNOWN and an unscored judgment component contributes 0.1.

## How to verify

Primary acceptance criterion **AC-1** (integration tier, service: real Postgres holocron_nonprod (services/platform/src/db/client.ts)):

```
PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-belief-score.test.ts -t 'AC-1'
```

Full gate set: 5 acceptance criteria, 10 test criteria, 3 verification gates.

## Scope

- services/platform/src/fulcrum/gate/score.ts (NEW)
- services/platform/src/fulcrum/belief-score-writer.ts (NEW)
- services/platform/tests/integration/fulcrum-belief-score.test.ts (NEW)

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

```
================================================================================
TASK: FUL-PLAT-004 - Compute the deterministic belief score
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
POINTS:     3
AGENT:      implementer=mastra-implementer | reviewer=mastra-reviewer
SPRINT:     sprint-01-produce-one-trustworthy-candidate-dossier-on-self-owned-inference (wave D)
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

Against real Postgres, grades 1.0/0.9/0.8/0.7 on a weight-0.5 component persist score 0.45 with support factor 0.9; adding a 0.4 refuter at multiplier 2 drops it to exactly 0.05; a recompute appends a byte-identical 0.45; an empty component reads UNKNOWN and an unscored judgment component contributes 0.1.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier — read before acting)
--------------------------------------------------------------------------------

- MUST: MUST compute each evidence component's support as the mean of its top-3 admitted grades so a fourth marginal claim adds nothing
- MUST: MUST read the disconfirmation multiplier from the active `weight_versions` row, defaulting to 2.0 only when the contract declares it
- MUST: MUST append a new `belief_scores` row per compute — the table is append-only and enforced by FUL-PLAT-001's trigger
- NEVER: NEVER call generateText, import a model client, or reference divergent / convergent / embed / judge inside services/platform/src/fulcrum/gate/score.ts
- NEVER: NEVER treat a component with no admitted claims as 0 — record UNKNOWN
- NEVER: NEVER include a provisional or demoted claim in any component's contribution
- STRICTLY: STRICTLY deterministic: no Date.now(), no Math.random(), no Set/Map iteration-order dependence in the summation — the recompute test compares score text byte-for-byte

--------------------------------------------------------------------------------
CAPABILITY CHAIN
--------------------------------------------------------------------------------

touches_capabilities: CAP-EVIDENCE-01, CAP-COMMIT-01
provides:             deterministic-belief-score, belief-score-row
consumes:             fulcrum-admission-decision, independence-sweep-demotions, fulcrum-ledger-tables, fulcrum-mission-contract-version
boundary_contracts:
  - Each appended belief_scores row stamps exactly one weight_version and one domain_tier_version so a historical score stays interpretable
  - A component with zero admitted claims records UNKNOWN and its weight is excluded — absent evidence is never scored as a passed challenge
  - Recomputing over an identical ledger state yields a byte-identical score with no model call and no clock or randomness dependence
  - Judgment-kind components never route through claim admission and default to the neutral prior 0.5

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------

- [ ] AC-1 (PRIMARY): Component support saturates at the top three admitted grades
- [ ] AC-2: Refuting evidence subtracts at the disconfirmation multiplier
- [ ] AC-3: Identical ledger state recomputes to a byte-identical score
- [ ] AC-4: A component with no admitted claims is UNKNOWN, never zero
- [ ] AC-5: Judgment components use a neutral prior and never touch admission
- [ ] pnpm test:integration passes + pnpm tsgo --noEmit clean
- [ ] Only writeAllowed files modified (git diff --name-only)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD Beads — ordered happy-path first)
--------------------------------------------------------------------------------

AC-1: Component support saturates at the top three admitted grades [PRIMARY]
  GIVEN: a candidate whose 'demand' component holds 4 admitted support claims graded 1.0, 0.9, 0.8 and 0.7
  WHEN:  computeScore runs and the belief-score writer appends the result
  THEN:  the persisted `belief_scores` row records a support factor of 0.9 for 'demand' and the fourth claim changes nothing

  TEST_TIER:            integration
  VERIFICATION_SERVICE: real Postgres holocron_nonprod (services/platform/src/db/client.ts)
  FLOW_REF:             CAP-EVIDENCE-01 → UC-LED-05 AC-1
  TDD_STATE:            none
  VERIFY:               PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-belief-score.test.ts -t 'AC-1'

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             visible
    TOPOLOGY:         single-node
    SERVICE:          real Postgres holocron_nonprod (services/platform/src/db/client.ts)
    NEGATIVE_CONTROL: would fail if computeScore averages every admitted grade instead of the top three, so the fourth marginal claim moves the number; computeScore returns a constant regardless of the claim grades; the belief-score writer is a no-op so belief_scores stays at 0 rows; the test asserts on the returned object only and never queries the persisted row
    EVIDENCE:         db_query (required_capture=True)
    CASES:
      - START_REF: four_graded_support_claims
        ACTOR:     cli_user
        STEP:      call `computeScore` over the candidate's admitted claims with weight_version 1
        STEP:      append the result through the belief-score writer
        STEP:      SELECT score, components_json, weight_version, domain_tier_version FROM belief_scores
        MUST_OBSERVE:     `components_json` records a support factor of 0.9 for component 'demand'
        MUST_OBSERVE:     the persisted `score` reads 0.45 for weight 0.5 times factor 0.9
        MUST_OBSERVE:     `SELECT count(*) FROM belief_scores` returns 1
        MUST_OBSERVE:     the row stamps `weight_version` = 1 and `domain_tier_version` = 1
        MUST_NOT_OBSERVE: a support factor of 0.85 that averaged all 4 grades
        MUST_NOT_OBSERVE: `SELECT count(*) FROM belief_scores` returns 0
        MUST_NOT_OBSERVE: a persisted `score` of 0
      - START_REF: four_graded_support_claims
        ACTOR:     cli_user
        STEP:      call `computeScore` for a component holding 1 admitted claim graded 1.0
        STEP:      call `computeScore` for a component holding 5 admitted claims each graded 0.5
        STEP:      compare the two support factors
        MUST_OBSERVE:     the single gold claim yields a support factor of 1.0
        MUST_OBSERVE:     the five weak claims yield a support factor of 0.5
        MUST_OBSERVE:     the 1-claim factor exceeds the 5-claim factor
        MUST_NOT_OBSERVE: the 5-claim component scoring above the 1-claim component
        MUST_NOT_OBSERVE: both factors reading 0
        MUST_NOT_OBSERVE: an empty components list

AC-2: Refuting evidence subtracts at the disconfirmation multiplier
  GIVEN: the same candidate scoring 0.45 on 'demand' from support alone
  WHEN:  1 admitted refuting claim graded 0.4 is appended and the score is recomputed with multiplier 2.0
  THEN:  the persisted score reads 0.05, an exact drop of 0.40

  TEST_TIER:            integration
  VERIFICATION_SERVICE: real Postgres holocron_nonprod (services/platform/src/db/client.ts)
  FLOW_REF:             CAP-EVIDENCE-01 → UC-LED-05 AC-2
  TDD_STATE:            none
  VERIFY:               PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-belief-score.test.ts -t 'AC-2'

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             visible
    TOPOLOGY:         single-node
    SERVICE:          real Postgres holocron_nonprod (services/platform/src/db/client.ts)
    NEGATIVE_CONTROL: would fail if the refuting claim is ignored so the score is unchanged at 0.45; the multiplier is hardcoded to 1 instead of read from weight_versions.disconfirmation_multiplier; refuting claims take a privileged path that skips admission; the recompute overwrites the prior row instead of appending, hiding the delta
    EVIDENCE:         db_query (required_capture=True)
    CASES:
      - START_REF: support_plus_refuter
        ACTOR:     cli_user
        STEP:      call `computeScore` over the 4 support claims plus the 1 refuting claim graded 0.4
        STEP:      append the result and SELECT score, disconfirmation_total, components_json FROM belief_scores ORDER BY created_at DESC
        MUST_OBSERVE:     the newest `belief_scores.score` reads 0.05
        MUST_OBSERVE:     `disconfirmation_total` reads 0.8 for factor 0.4 times multiplier 2
        MUST_OBSERVE:     the drop from the prior score of 0.45 is exactly 0.40
        MUST_OBSERVE:     `SELECT count(*) FROM belief_scores` returns 2
        MUST_NOT_OBSERVE: the newest score still reads 0.45
        MUST_NOT_OBSERVE: `disconfirmation_total` reads 0
        MUST_NOT_OBSERVE: `SELECT count(*) FROM belief_scores` returns 0

AC-3: Identical ledger state recomputes to a byte-identical score
  GIVEN: a candidate that already produced a `belief_scores` row reading 0.45
  WHEN:  computeScore is re-run over the unchanged ledger and the result is appended
  THEN:  the second row's score string is byte-identical to the first and both carry the same version stamps

  TEST_TIER:            integration
  VERIFICATION_SERVICE: real Postgres holocron_nonprod (services/platform/src/db/client.ts)
  FLOW_REF:             CAP-EVIDENCE-01 → UC-LED-05 AC-3 + AC-7
  TDD_STATE:            none
  VERIFY:               PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-belief-score.test.ts -t 'AC-3'

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             visible
    TOPOLOGY:         single-node
    SERVICE:          real Postgres holocron_nonprod (services/platform/src/db/client.ts)
    NEGATIVE_CONTROL: would fail if computeScore reads Date.now() or Math.random(), making the recompute drift; component iteration order depends on object key order, so the floating-point sum differs between runs; the second compute is omitted and the writer is a no-op, leaving the ledger unchanged; the score is produced by a model call rather than deterministic code
    EVIDENCE:         db_query (required_capture=True)
    CASES:
      - START_REF: four_graded_support_claims
        ACTOR:     cli_user
        STEP:      call `computeScore` and append the first `belief_scores` row
        STEP:      call `computeScore` again over the identical unchanged ledger and append a second row
        STEP:      SELECT score::text, weight_version, domain_tier_version FROM belief_scores ORDER BY created_at
        MUST_OBSERVE:     both rows read `score` = 0.45
        MUST_OBSERVE:     the two `score::text` values compare byte-identical
        MUST_OBSERVE:     `SELECT count(*) FROM belief_scores` returns 2
        MUST_OBSERVE:     both rows stamp `weight_version` = 1 and `domain_tier_version` = 1
        MUST_NOT_OBSERVE: the two score strings differ
        MUST_NOT_OBSERVE: `SELECT count(*) FROM belief_scores` returns 0
        MUST_NOT_OBSERVE: a row with a NULL or empty version stamp

AC-4: A component with no admitted claims is UNKNOWN, never zero
  GIVEN: a candidate whose 'pricing' component holds 0 admitted claims
  WHEN:  computeScore runs over the candidate
  THEN:  `components_json` records `UNKNOWN` for 'pricing' and its weight is excluded from the total rather than counted as a failed challenge

  TEST_TIER:            integration
  VERIFICATION_SERVICE: real Postgres holocron_nonprod (services/platform/src/db/client.ts)
  FLOW_REF:             CAP-EVIDENCE-01 → UC-LED-05 AC-4
  TDD_STATE:            none
  VERIFY:               PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-belief-score.test.ts -t 'AC-4'

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             visible
    TOPOLOGY:         single-node
    SERVICE:          real Postgres holocron_nonprod (services/platform/src/db/client.ts)
    NEGATIVE_CONTROL: would fail if an absent component defaults to 0, treating missing evidence as a passed challenge; components with no claims are dropped from components_json entirely, hiding the coverage gap; computeScore returns a fixed components list regardless of the ledger
    EVIDENCE:         db_query (required_capture=True)
    CASES:
      - START_REF: empty_and_judgment_components
        ACTOR:     cli_user
        STEP:      call `computeScore` over a candidate holding 4 admitted 'demand' claims and 0 admitted 'pricing' claims
        STEP:      append the result and SELECT score, components_json FROM belief_scores
        MUST_OBSERVE:     `components_json` records the literal `UNKNOWN` for component 'pricing'
        MUST_OBSERVE:     `components_json` records a numeric factor of 0.9 for component 'demand'
        MUST_OBSERVE:     the persisted `score` reads 0.45, computed over the 1 scoreable component only
        MUST_NOT_OBSERVE: `components_json` records a factor of 0 for component 'pricing'
        MUST_NOT_OBSERVE: the persisted `score` dropped as if 'pricing' were a failed challenge
        MUST_NOT_OBSERVE: `components_json` is empty

AC-5: Judgment components use a neutral prior and never touch admission
  GIVEN: a 'buildability' component declared with `kind` = 'judgment' and weight 0.2, never scored by the operator
  WHEN:  computeScore runs over the candidate
  THEN:  'buildability' contributes the neutral prior 0.5 and no admission decision is written for it

  TEST_TIER:            integration
  VERIFICATION_SERVICE: real Postgres holocron_nonprod (services/platform/src/db/client.ts)
  FLOW_REF:             CAP-EVIDENCE-01 → UC-LED-05 AC-5
  TDD_STATE:            none
  VERIFY:               PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-belief-score.test.ts -t 'AC-5'

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             visible
    TOPOLOGY:         single-node
    SERVICE:          real Postgres holocron_nonprod (services/platform/src/db/client.ts)
    NEGATIVE_CONTROL: would fail if judgment components are routed through evaluateAdmission and land as UNKNOWN because they have no evidence; the neutral prior is omitted so an unscored judgment component reads 0 and drags the total down; the kind field is ignored and every component is treated as evidence
    EVIDENCE:         db_query (required_capture=True)
    CASES:
      - START_REF: empty_and_judgment_components
        ACTOR:     cli_user
        STEP:      call `computeScore` over the candidate whose weight_components include 'buildability' with kind 'judgment'
        STEP:      append the result and SELECT components_json FROM belief_scores
        STEP:      SELECT count(*) FROM claims WHERE component = 'buildability'
        MUST_OBSERVE:     `components_json` records `kind` = 'judgment' and a factor of 0.5 for 'buildability'
        MUST_OBSERVE:     the judgment contribution reads 0.1 for weight 0.2 times prior 0.5
        MUST_OBSERVE:     `SELECT count(*) FROM claims WHERE component = 'buildability'` returns 0
        MUST_NOT_OBSERVE: a `claims` row created for the judgment component
        MUST_NOT_OBSERVE: `components_json` records `UNKNOWN` for a judgment component
        MUST_NOT_OBSERVE: the judgment factor reads 0

--------------------------------------------------------------------------------
TEST CRITERIA (boolean — each maps to an AC)
--------------------------------------------------------------------------------

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 |  | AC-1 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-belief-score.test.ts -t 'AC-1'` |
| TC-2 |  | AC-1 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-belief-score.test.ts -t 'AC-1'` |
| TC-3 |  | AC-2 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-belief-score.test.ts -t 'AC-2'` |
| TC-4 |  | AC-2 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-belief-score.test.ts -t 'AC-2'` |
| TC-5 |  | AC-3 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-belief-score.test.ts -t 'AC-3'` |
| TC-6 |  | AC-3 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-belief-score.test.ts -t 'AC-3'` |
| TC-7 |  | AC-3 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-belief-score.test.ts -t 'AC-3'` |
| TC-8 |  | AC-4 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-belief-score.test.ts -t 'AC-4'` |
| TC-9 |  | AC-5 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-belief-score.test.ts -t 'AC-5'` |
| TC-10 |  | AC-5 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-belief-score.test.ts -t 'AC-5'` |

--------------------------------------------------------------------------------
SCOPE (file-level write permissions)
--------------------------------------------------------------------------------

writeAllowed:
- services/platform/src/fulcrum/gate/score.ts (NEW)
- services/platform/src/fulcrum/belief-score-writer.ts (NEW)
- services/platform/tests/integration/fulcrum-belief-score.test.ts (NEW)

writeProhibited:
- services/platform/src/fulcrum/gate/grade.ts, verify-quote.ts, admission.ts, provenance.ts — delivered by FUL-PLAT-002/003; consume, do not edit
- services/platform/src/fulcrum/contract.ts and services/platform/src/fulcrum/missions/** — owned by FUL-PLAT-005
- services/platform/src/fulcrum/retrieval.ts — owned by FUL-PLAT-006
- services/platform/src/db/** — owned by FUL-PLAT-001
- services/platform/src/mission/** — owned by FUL-PLAT-005/006/008
- Any file not listed in write_allowed
- Any file not explicitly listed above

--------------------------------------------------------------------------------
CODE PATTERN
--------------------------------------------------------------------------------

Source: services/platform/src/research/evidence-gate.ts + services/platform/src/db/migrations/0004_beliefs_immutability_revise.sql (append-only precedent)

Pure fold over typed records returning { score, disconfirmationTotal, components[] }, plus an append-only writer that stamps both versions.

ANTI-PATTERN: Scoring an evidence-free component as 0. That is holocron's old failure mode restated — absent evidence read as a survived challenge — and it is the specific thing UC-LED-05 AC-4 forbids.

References:
- .spec/prds/fulcrum/06-uc-led.md § UC-LED-05 — top-3 saturation, multiplier, UNKNOWN, judgment split, version stamping
- .spec/prds/fulcrum/09-technical-requirements/01-architecture-posture.md § 2 — the Gate never calls a model

Notes:
- s
- c
- o
- r
- e
- .
- t
- s
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
- a
- d
- m
- i
- t
- t
- e
- d
- -
- c
- l
- a
- i
- m
-  
- r
- e
- c
- o
- r
- d
- s
-  
- a
- n
- d
-  
- a
-  
- c
- o
- n
- t
- r
- a
- c
- t
-  
- s
- n
- a
- p
- s
- h
- o
- t
- ;
-  
- b
- e
- l
- i
- e
- f
- -
- s
- c
- o
- r
- e
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
- r
- e
- a
- d
- s
-  
- t
- h
- e
-  
- a
- c
- t
- i
- v
- e
-  
- w
- e
- i
- g
- h
- t
- /
- t
- i
- e
- r
-  
- v
- e
- r
- s
- i
- o
- n
- s
-  
- a
- n
- d
-  
- a
- p
- p
- e
- n
- d
- s
-  
- t
- h
- e
-  
- r
- o
- w
- .
-  
- B
- e
- c
- a
- u
- s
- e
-  
- b
- e
- l
- i
- e
- f
- _
- s
- c
- o
- r
- e
- s
-  
- i
- s
-  
- t
- r
- i
- g
- g
- e
- r
- -
- e
- n
- f
- o
- r
- c
- e
- d
-  
- a
- p
- p
- e
- n
- d
- -
- o
- n
- l
- y
- ,
-  
- a
-  
- r
- e
- c
- o
- m
- p
- u
- t
- e
-  
- m
- u
- s
- t
-  
- I
- N
- S
- E
- R
- T
- ,
-  
- n
- e
- v
- e
- r
-  
- U
- P
- D
- A
- T
- E
-  
- —
-  
- w
- h
- i
- c
- h
-  
- i
- s
-  
- e
- x
- a
- c
- t
- l
- y
-  
- w
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
- b
- y
- t
- e
- -
- i
- d
- e
- n
- t
- i
- c
- a
- l
-  
- d
- e
- t
- e
- r
- m
- i
- n
- i
- s
- m
-  
- t
- e
- s
- t
-  
- o
- b
- s
- e
- r
- v
- a
- b
- l
- e
-  
- a
- s
-  
- t
- w
- o
-  
- r
- o
- w
- s
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
- o
- n
- e
-  
- m
- u
- t
- a
- t
- e
- d
-  
- r
- o
- w
- .

--------------------------------------------------------------------------------
READING LIST (max 5 — canonical pattern first)
--------------------------------------------------------------------------------

1. services/platform/src/research/evidence-gate.ts
   - Lines: 1-105
   - Focus: [PRIMARY PATTERN] pure deterministic aggregation over strict Zod inputs returning a structured result — the shape score.ts mirrors
2. services/platform/src/fulcrum/gate/admission.ts
   - Lines: whole file (delivered by FUL-PLAT-002)
   - Focus: The admitted-claim record with qualifying_grade and polarity that computeScore consumes
3. services/platform/src/fulcrum/gate/provenance.ts
   - Lines: whole file (delivered by FUL-PLAT-003)
   - Focus: Demoted claims must be excluded from every component contribution
4. services/platform/src/db/schema/fulcrum.ts
   - Lines: belief_scores / weight_versions / weight_components (delivered by FUL-PLAT-001)
   - Focus: components_json shape, disconfirmation_total column, the two version-stamp columns
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
  Command:  pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error services/platform/src/fulcrum/gate/score.ts services/platform/src/fulcrum/belief-score-writer.ts services/platform/tests/integration/fulcrum-belief-score.test.ts
  Expected: None

Gate S: Scenario is un-fakeable (PRIMARY) — supersedes 'Exit 0' as the bar for done.
  Verify: validate_scenario.py passes on the PRIMARY AC scenario (exit 0).
  Verify: RED-against-start observed and recorded before green.
  Verify: captured evidence shows the seeded MUST_OBSERVE value, not merely 'tests passed'.

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------

Implementer: mastra-implementer
Rationale:   Closes the determinism seam this triad owns: a pure aggregation module in services/platform/src/fulcrum plus an append-only Postgres writer, proven by re-running against real persisted rows on the integration lane.
Reviewer:    mastra-reviewer

--------------------------------------------------------------------------------
CODING STANDARDS
--------------------------------------------------------------------------------

- computeScore input and output are declared Zod schemas — no z.any() on the scoring path
- components_json entries are a closed discriminated union on kind: 'evidence' | 'judgment', with factor typed number | 'UNKNOWN'
- score.ts imports nothing from services/platform/src/db and no model or fleet client
- Sum components in a stable declared order (contract order), never in Object.keys order

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------

Depends on: FUL-PLAT-001, FUL-PLAT-002, FUL-PLAT-003, FUL-PLAT-005
Blocks:     FUL-PLAT-008, FUL-PLAT-010
Wave:       D

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
  "task_id": "FUL-PLAT-004",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "four_graded_support_claims": {
      "description": "one candidate whose 'demand' component holds 4 admitted support claims with qualifying grades 1.0, 0.9, 0.8 and 0.7, under weight_version 1 (weight 0.5, multiplier 2.0) and domain_tier_version 1",
      "seed_method": "cli",
      "records": [
        "`claims` holds 4 rows with `status` = 'admitted' and `polarity` = 'support' for component 'demand'",
        "`qualifying_grade` values are 1.0, 0.9, 0.8 and 0.7",
        "`weight_components.weight` is 0.5 for 'demand' with `kind` = 'evidence'",
        "`belief_scores` holds 0 rows for the candidate"
      ]
    },
    "support_plus_refuter": {
      "description": "the same candidate after 1 admitted refuting claim with qualifying_grade 0.4 is appended to the 'demand' component",
      "seed_method": "cli",
      "records": [
        "`claims` holds 4 admitted support rows and 1 admitted row with `polarity` = 'refute'",
        "the refuting row carries `qualifying_grade` = 0.4",
        "`weight_versions.disconfirmation_multiplier` = 2"
      ]
    },
    "empty_and_judgment_components": {
      "description": "one candidate whose 'pricing' evidence component holds 0 admitted claims and whose 'buildability' judgment component has never been scored by the operator",
      "seed_method": "cli",
      "records": [
        "`claims` holds 0 admitted rows for component 'pricing'",
        "`weight_components` holds 1 row for 'buildability' with `kind` = 'judgment' and `weight` = 0.2",
        "`claims` holds 0 rows of any status for component 'buildability'"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN a candidate whose 'demand' component holds 4 admitted support claims graded 1.0, 0.9, 0.8 and 0.7 WHEN computeScore runs and the belief-score writer appends the result THEN the persisted `belief_scores` row records a support factor of 0.9 for 'demand' and the fourth claim changes nothing",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-belief-score.test.ts -t 'AC-1'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "primary": true,
        "verification_service": "real Postgres holocron_nonprod (services/platform/src/db/client.ts)",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "computeScore averages every admitted grade instead of the top three, so the fourth marginal claim moves the number",
            "computeScore returns a constant regardless of the claim grades",
            "the belief-score writer is a no-op so belief_scores stays at 0 rows",
            "the test asserts on the returned object only and never queries the persisted row"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "four_graded_support_claims",
            "action": {
              "actor": "cli_user",
              "steps": [
                "call `computeScore` over the candidate's admitted claims with weight_version 1",
                "append the result through the belief-score writer",
                "SELECT score, components_json, weight_version, domain_tier_version FROM belief_scores"
              ]
            },
            "end_state": {
              "must_observe": [
                "`components_json` records a support factor of 0.9 for component 'demand'",
                "the persisted `score` reads 0.45 for weight 0.5 times factor 0.9",
                "`SELECT count(*) FROM belief_scores` returns 1",
                "the row stamps `weight_version` = 1 and `domain_tier_version` = 1"
              ],
              "must_not_observe": [
                "a support factor of 0.85 that averaged all 4 grades",
                "`SELECT count(*) FROM belief_scores` returns 0",
                "a persisted `score` of 0"
              ]
            }
          },
          {
            "start_ref": "four_graded_support_claims",
            "action": {
              "actor": "cli_user",
              "steps": [
                "call `computeScore` for a component holding 1 admitted claim graded 1.0",
                "call `computeScore` for a component holding 5 admitted claims each graded 0.5",
                "compare the two support factors"
              ]
            },
            "end_state": {
              "must_observe": [
                "the single gold claim yields a support factor of 1.0",
                "the five weak claims yield a support factor of 0.5",
                "the 1-claim factor exceeds the 5-claim factor"
              ],
              "must_not_observe": [
                "the 5-claim component scoring above the 1-claim component",
                "both factors reading 0",
                "an empty components list"
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
      "description": "GIVEN the same candidate scoring 0.45 on 'demand' from support alone WHEN 1 admitted refuting claim graded 0.4 is appended and the score is recomputed with multiplier 2.0 THEN the persisted score reads 0.05, an exact drop of 0.40",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-belief-score.test.ts -t 'AC-2'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "primary": false,
        "verification_service": "real Postgres holocron_nonprod (services/platform/src/db/client.ts)",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "the refuting claim is ignored so the score is unchanged at 0.45",
            "the multiplier is hardcoded to 1 instead of read from weight_versions.disconfirmation_multiplier",
            "refuting claims take a privileged path that skips admission",
            "the recompute overwrites the prior row instead of appending, hiding the delta"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "support_plus_refuter",
            "action": {
              "actor": "cli_user",
              "steps": [
                "call `computeScore` over the 4 support claims plus the 1 refuting claim graded 0.4",
                "append the result and SELECT score, disconfirmation_total, components_json FROM belief_scores ORDER BY created_at DESC"
              ]
            },
            "end_state": {
              "must_observe": [
                "the newest `belief_scores.score` reads 0.05",
                "`disconfirmation_total` reads 0.8 for factor 0.4 times multiplier 2",
                "the drop from the prior score of 0.45 is exactly 0.40",
                "`SELECT count(*) FROM belief_scores` returns 2"
              ],
              "must_not_observe": [
                "the newest score still reads 0.45",
                "`disconfirmation_total` reads 0",
                "`SELECT count(*) FROM belief_scores` returns 0"
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
      "description": "GIVEN a candidate that already produced a `belief_scores` row reading 0.45 WHEN computeScore is re-run over the unchanged ledger and the result is appended THEN the second row's score string is byte-identical to the first and both carry the same version stamps",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-belief-score.test.ts -t 'AC-3'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "primary": false,
        "verification_service": "real Postgres holocron_nonprod (services/platform/src/db/client.ts)",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "computeScore reads Date.now() or Math.random(), making the recompute drift",
            "component iteration order depends on object key order, so the floating-point sum differs between runs",
            "the second compute is omitted and the writer is a no-op, leaving the ledger unchanged",
            "the score is produced by a model call rather than deterministic code"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "four_graded_support_claims",
            "action": {
              "actor": "cli_user",
              "steps": [
                "call `computeScore` and append the first `belief_scores` row",
                "call `computeScore` again over the identical unchanged ledger and append a second row",
                "SELECT score::text, weight_version, domain_tier_version FROM belief_scores ORDER BY created_at"
              ]
            },
            "end_state": {
              "must_observe": [
                "both rows read `score` = 0.45",
                "the two `score::text` values compare byte-identical",
                "`SELECT count(*) FROM belief_scores` returns 2",
                "both rows stamp `weight_version` = 1 and `domain_tier_version` = 1"
              ],
              "must_not_observe": [
                "the two score strings differ",
                "`SELECT count(*) FROM belief_scores` returns 0",
                "a row with a NULL or empty version stamp"
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
      "description": "GIVEN a candidate whose 'pricing' component holds 0 admitted claims WHEN computeScore runs over the candidate THEN `components_json` records `UNKNOWN` for 'pricing' and its weight is excluded from the total rather than counted as a failed challenge",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-belief-score.test.ts -t 'AC-4'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "primary": false,
        "verification_service": "real Postgres holocron_nonprod (services/platform/src/db/client.ts)",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "an absent component defaults to 0, treating missing evidence as a passed challenge",
            "components with no claims are dropped from components_json entirely, hiding the coverage gap",
            "computeScore returns a fixed components list regardless of the ledger"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "empty_and_judgment_components",
            "action": {
              "actor": "cli_user",
              "steps": [
                "call `computeScore` over a candidate holding 4 admitted 'demand' claims and 0 admitted 'pricing' claims",
                "append the result and SELECT score, components_json FROM belief_scores"
              ]
            },
            "end_state": {
              "must_observe": [
                "`components_json` records the literal `UNKNOWN` for component 'pricing'",
                "`components_json` records a numeric factor of 0.9 for component 'demand'",
                "the persisted `score` reads 0.45, computed over the 1 scoreable component only"
              ],
              "must_not_observe": [
                "`components_json` records a factor of 0 for component 'pricing'",
                "the persisted `score` dropped as if 'pricing' were a failed challenge",
                "`components_json` is empty"
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
      "description": "GIVEN a 'buildability' component declared with `kind` = 'judgment' and weight 0.2, never scored by the operator WHEN computeScore runs over the candidate THEN 'buildability' contributes the neutral prior 0.5 and no admission decision is written for it",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-belief-score.test.ts -t 'AC-5'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "primary": false,
        "verification_service": "real Postgres holocron_nonprod (services/platform/src/db/client.ts)",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "judgment components are routed through evaluateAdmission and land as UNKNOWN because they have no evidence",
            "the neutral prior is omitted so an unscored judgment component reads 0 and drags the total down",
            "the kind field is ignored and every component is treated as evidence"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "empty_and_judgment_components",
            "action": {
              "actor": "cli_user",
              "steps": [
                "call `computeScore` over the candidate whose weight_components include 'buildability' with kind 'judgment'",
                "append the result and SELECT components_json FROM belief_scores",
                "SELECT count(*) FROM claims WHERE component = 'buildability'"
              ]
            },
            "end_state": {
              "must_observe": [
                "`components_json` records `kind` = 'judgment' and a factor of 0.5 for 'buildability'",
                "the judgment contribution reads 0.1 for weight 0.2 times prior 0.5",
                "`SELECT count(*) FROM claims WHERE component = 'buildability'` returns 0"
              ],
              "must_not_observe": [
                "a `claims` row created for the judgment component",
                "`components_json` records `UNKNOWN` for a judgment component",
                "the judgment factor reads 0"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "The support factor for a component graded 1.0/0.9/0.8/0.7 reads 0.9",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-belief-score.test.ts -t 'AC-1'",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "A component holding one claim graded 1.0 outscores a component holding five claims graded 0.5",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-belief-score.test.ts -t 'AC-1'",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Appending one admitted refuting claim graded 0.4 drops the persisted score from 0.45 to 0.05",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-belief-score.test.ts -t 'AC-2'",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "The persisted disconfirmation_total reads 0.8 under multiplier 2",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-belief-score.test.ts -t 'AC-2'",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "Two computeScore runs over an unchanged ledger persist byte-identical score text",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-belief-score.test.ts -t 'AC-3'",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "Every appended belief_scores row carries a non-null weight_version",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-belief-score.test.ts -t 'AC-3'",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-7",
      "type": "test_criterion",
      "description": "Every appended belief_scores row carries a non-null domain_tier_version",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-belief-score.test.ts -t 'AC-3'",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-8",
      "type": "test_criterion",
      "description": "A component with zero admitted claims records the literal UNKNOWN in components_json",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-belief-score.test.ts -t 'AC-4'",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-9",
      "type": "test_criterion",
      "description": "An unscored judgment component contributes the neutral prior 0.5",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-belief-score.test.ts -t 'AC-5'",
      "maps_to_ac": "AC-5"
    },
    {
      "id": "TC-10",
      "type": "test_criterion",
      "description": "An unscored judgment component creates zero claims rows",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-belief-score.test.ts -t 'AC-5'",
      "maps_to_ac": "AC-5"
    }
  ]
}
-->

</details>

## Acceptance Criteria

- [ ] AC-1 (PRIMARY): Component support saturates at the top three admitted grades
- [ ] AC-2: Refuting evidence subtracts at the disconfirmation multiplier
- [ ] AC-3: Identical ledger state recomputes to a byte-identical score
- [ ] AC-4: A component with no admitted claims is UNKNOWN, never zero
- [ ] AC-5: Judgment components use a neutral prior and never touch admission
