# REDHAT-FIX-H3 — Make the documented evidence seed-to-belief human path product-true without gate-only scaffold inserts (fresh red-hat H3: HT-1→HT-2 broken)

## What this does

Close red-hat H3 by making the documented human path HT-1→HT-2 product-true: evidence:seed leaves an open belief for the seeded claim so evidence:belief --as-of now returns it without gate-setup scaffolding.

Provides: product-seed-creates-open-belief, ht1-ht2-continuous-product-path, seed-cli-beliefId-surface.

## Why

- MUST make evidence:seed (seedEvidence) create exactly one open belief for the seeded claim via the authorized open-belief write path (seed_open_belief / seedOpenBelief after H1 lockdown)
- MUST expose beliefId on EvidenceSeedResult and CLI JSON/text so operators can chain seed → belief → revise without DB spelunking
- MUST make holo evidence:belief --claim-id <seed-claim> --as-of now return ok:true with that belief without any gate-setup pre-insert
- MUST use a product actor string (e.g. evidence:seed or seed) and a product statement derived from the seed claim — never reintroduce gate-setup into the product path
- NEVER depend on gate-only scaffold INSERT (actor gate-setup / statement 'initial gate belief from seed claim') for HT-2 to pass
- NEVER raw-INSERT closed beliefs or bypass H1 authenticity controls to make seed 'work'
- NEVER leave seedEvidence returning only claimId/passageIds with no belief while docs claim HT-1→HT-2 continuity
- STRICTLY proof is CLI-level against real Postgres (PLATFORM_IT=1): run evidence:seed then evidence:belief with no intermediate non-product SQL
- STRICTLY coordination with H1: after INSERT lockdown, seed MUST call DEFINER open-belief function
- Grounded in: UC-DATA-02, T-DATA-005, T-DATA-006, T-PLAT-004, HT-1, HT-2

## How to verify

- `pnpm tsgo --noEmit` → Exit 0
- `pnpm biome check .` → Exit 0
- `PLATFORM_IT=1 pnpm vitest run tests/integration/service/evidence-seed-belief-path.test.ts tests/integration/service/evidence-seed.test.ts` → Exit 0
- `PLATFORM_IT=1 pnpm vitest run tests/integration/service/evidence-asof-*.test.ts tests/integration/service/immutability-*.test.ts` → Exit 0

## Scope

Writes: services/platform/src/db/evidence/seed.ts · services/platform/src/db/evidence/revise.ts · services/platform/src/db/evidence/index.ts · services/platform/src/cli/holo.ts · tests/integration/service/evidence-seed-belief-path.test.ts · tests/integration/service/evidence-seed.test.ts · tests/integration/service/evidence-asof-*.test.ts · tests/integration/service/evidence-harness.ts · tests/integration/service/immutability-harness.ts · .spec/prds/mk6-migration/tasks/sprint-07-evidence-graph-substrate-and-ledger-immutability/gate-plan.json · .spec/prds/mk6-migration/tasks/sprint-07-evidence-graph-substrate-and-ledger-immutability/SPRINT.md · .tmp/ledger-2/**

Prohibited: services/platform/src/db/migrations/0000_*.sql · services/platform/src/db/migrations/0001_*.sql · services/platform/src/db/migrations/0002_*.sql · services/platform/src/db/migrations/0003_*.sql · services/platform/src/db/migrations/0004_beliefs_immutability_revise.sql · services/platform/src/db/migrations/0005_belief_asof_net_support.sql · services/platform/src/db/schema/evidence.ts · app/**

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: REDHAT-FIX-H3 — Make the documented evidence seed-to-belief human path product-true without gate-only scaffold inserts (fresh red-hat H3: HT-1→HT-2 broken)
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     S  (120 min)
AGENT:      implementer=mastra-implementer | reviewer=mastra-reviewer
PROPOSED-BY: mastra-planner
TDD_MODE:   red_first     RED_GREEN_REQUIRED: yes     (requires_seeded_evidence: true)
CAPABILITY: N/A
SPRINT:     [Sprint 7 — Evidence-Graph Substrate and Ledger Immutability](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm vitest run <path>
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
holo evidence:seed --json returns ok:true with claimId and beliefId; immediate holo evidence:belief --claim-id <claimId> --as-of now --json returns ok:true, same beliefId, product statement/actor ≠ gate-setup; netSupport remains computable from seed relations.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST make evidence:seed (seedEvidence) create exactly one open belief for the seeded claim via the authorized open-belief write path (seed_open_belief / seedOpenBelief after H1 lockdown)
- MUST expose beliefId on EvidenceSeedResult and CLI JSON/text so operators can chain seed → belief → revise without DB spelunking
- MUST make holo evidence:belief --claim-id <seed-claim> --as-of now return ok:true with that belief without any gate-setup pre-insert
- MUST use a product actor string (e.g. evidence:seed or seed) and a product statement derived from the seed claim — never reintroduce gate-setup into the product path
- NEVER depend on gate-only scaffold INSERT (actor gate-setup / statement 'initial gate belief from seed claim') for HT-2 to pass
- NEVER raw-INSERT closed beliefs or bypass H1 authenticity controls to make seed 'work'
- NEVER leave seedEvidence returning only claimId/passageIds with no belief while docs claim HT-1→HT-2 continuity
- NEVER implement seed belief only inside tests/harness while CLI product path remains belief-less
- STRICTLY proof is CLI-level against real Postgres (PLATFORM_IT=1): run evidence:seed then evidence:belief with no intermediate non-product SQL
- STRICTLY coordination with H1: after INSERT lockdown, seed MUST call DEFINER open-belief function
- STRICTLY coordination with H2: product seed path runs as holocron_app once role bind lands

--------------------------------------------------------------------------------
BOUNDARY CONTRACTS
--------------------------------------------------------------------------------
- HT-1 (evidence:seed) MUST leave a queryable open belief for the seeded claim so HT-2 (evidence:belief --as-of now) succeeds without hidden gate inserts
- Open belief write MUST use authorized path after H1 (seed_open_belief / SECURITY DEFINER) — not raw owner INSERT and not gate-setup actor scaffolding
- Product seed actor/statement MUST be product-true (not actor=gate-setup / statement='initial gate belief from seed claim')

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: evidence:seed creates an open belief for the seeded claim (PRIMARY)
- [ ] AC-2: HT-1→HT-2 continuous: evidence:belief --as-of now succeeds without scaffold
- [ ] AC-3: Product actor/statement — no gate-setup scaffold
- [ ] AC-4: Authorized write path under H1/H2 constraints
- [ ] AC-5: Seed still preserves dual contradicting passages + relations + net-support
- [ ] `PLATFORM_IT=1` integration suite green + `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean (only SCOPE.writeAllowed files modified)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads — RED before GREEN, proven by real services)
--------------------------------------------------------------------------------
AC-1 evidence:seed creates an open belief for the seeded claim [PRIMARY] (flow_ref T-DATA-005)
  GIVEN: clean-evidence-tables on real Postgres with H1 authorized open-belief path available
  WHEN:  Running holo evidence:seed --json (product CLI only)
  THEN:  ok:true; claimId UUID present; beliefId UUID present; DB has exactly one beliefs row for claimId with tx_to IS NULL
  TEST_TIER: integration · VERIFICATION_SERVICE: postgres · TDD_STATE: none
  VERIFY: PLATFORM_IT=1 pnpm vitest run tests/integration/service/evidence-seed-belief-path.test.ts
  SCENARIO — start_ref: clean-evidence-tables · evidence: stdout
    NEGATIVE_CONTROL: would fail if seedEvidence still inserts only source+passages+claim+relations with NO belief (current red-hat live / belief insert omitted); beliefId only invented in JSON without DB row (hardcoded / stub); Test inserts belief via seedOpenBelief harness after seed CLI (scaffolding / mock path); static empty shell returning ok without DB; product seed belief write absent
    EVIDENCE: stdout (required_capture=True)
    CASE[0] start_ref: clean-evidence-tables
      actor: operator
      - holo evidence:seed --json
      - Parse claimId and beliefId
      - SELECT id, claim_id, tx_to, actor, statement FROM beliefs WHERE id = beliefId
      MUST_OBSERVE:
        - seed ok: true
        - claimId matches UUID format `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
        - beliefId matches UUID format `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
        - beliefs.tx_to IS NULL for beliefId (open COUNT = 1)
        - beliefs.claim_id == seed claimId (same UUID string)
        - COUNT open beliefs for claimId == 1
      MUST_NOT_OBSERVE:
        - beliefId empty or null
        - ok: false
        - open beliefs COUNT = 0 for claimId
        - belief row with tx_to IS NOT NULL as the only seed belief
        - empty claimId
AC-2 HT-1→HT-2 continuous: evidence:belief --as-of now succeeds without scaffold (flow_ref T-DATA-005)
  GIVEN: Only product evidence:seed has been run for claimId (no gate-setup SQL, no test harness belief insert)
  WHEN:  Running holo evidence:belief --claim-id <claimId> --as-of now --json
  THEN:  ok:true; beliefId equals seed beliefId; statement non-empty; exit code 0; errors do not include 'no belief for claim'
  TEST_TIER: integration · VERIFICATION_SERVICE: postgres · TDD_STATE: none
  VERIFY: PLATFORM_IT=1 pnpm vitest run tests/integration/service/evidence-seed-belief-path.test.ts
  SCENARIO — start_ref: product-seed-output · evidence: stdout
    NEGATIVE_CONTROL: would fail if as-of now still returns ok:false / no belief for claim (red-hat live re-probe / seed belief omitted); Test inserts gate-setup belief between seed and belief commands (scaffold / stub path); belief as-of reads a different claim_id than seed output (wrong constant); static empty shell returning ok without DB; mock getBeliefAsOf hardcoded ok:true
    EVIDENCE: stdout (required_capture=True)
    CASE[0] start_ref: product-seed-output
      actor: operator
      - holo evidence:seed --json → claimId, beliefId
      - Immediately holo evidence:belief --claim-id claimId --as-of now --json
      - Compare belief ids and ok flags
      MUST_OBSERVE:
        - belief command ok: true
        - belief command exit code == 0
        - beliefId == seed beliefId (same UUID string)
        - statement length > 0
        - netSupport is a number (seed baseline netSupport == -1 or other integer)
      MUST_NOT_OBSERVE:
        - ok: false
        - errors containing 'no belief for claim'
        - beliefId empty or null
        - exit code == 1 solely due to missing belief
        - empty statement
AC-3 Product actor/statement — no gate-setup scaffold (flow_ref T-DATA-005)
  GIVEN: Belief created solely by product evidence:seed
  WHEN:  Inspecting beliefs.actor and beliefs.statement for the seed beliefId
  THEN:  actor is a product value (evidence:seed or seed or equivalent documented product actor) and NEVER gate-setup; statement is NOT 'initial gate belief from seed claim'; statement aligns with seed claim text / product seed constants
  TEST_TIER: integration · VERIFICATION_SERVICE: postgres · TDD_STATE: none
  VERIFY: PLATFORM_IT=1 pnpm vitest run tests/integration/service/evidence-seed-belief-path.test.ts
  SCENARIO — start_ref: product-seed-output · evidence: db_query
    NEGATIVE_CONTROL: would fail if Gate scripts still required to INSERT actor=gate-setup for HT-2 (product path omitted); Product seed copies gate-setup strings into production path (hardcoded scaffold); Actor left null and gate path is the only documented way to set actor (absent product actor); stub/mock seed that does not persist actor/statement; static empty shell returning ok without DB
    EVIDENCE: db_query (required_capture=True)
    CASE[0] start_ref: product-seed-output
      actor: operator
      - seed via CLI
      - SELECT actor, statement FROM beliefs WHERE id = beliefId
      - Compare statement to SEED_CLAIM_TEXT or documented product seed belief statement
      MUST_OBSERVE:
        - actor is non-empty product actor (e.g. 'evidence:seed' or 'seed')
        - actor != 'gate-setup' (actor is not gate-setup)
        - statement != 'initial gate belief from seed claim'
        - statement contains product seed claim semantics matching SEED_CLAIM_TEXT 'Quarterly revenue grew year-over-year.'
      MUST_NOT_OBSERVE:
        - actor equals 'gate-setup'
        - statement equals 'initial gate belief from seed claim'
        - actor empty or null
        - statement empty
        - none product actor (blank)
AC-4 Authorized write path under H1/H2 constraints (flow_ref T-DATA-006)
  GIVEN: H1 insert authenticity and H2 app-role product pool are applied (or task lands after them per depends_on)
  WHEN:  Product seed creates the open belief while connected as holocron_app
  THEN:  Belief insert uses seed_open_belief / authorized DEFINER path (not raw owner INSERT); session current_user = holocron_app; seed still ok:true
  TEST_TIER: integration · VERIFICATION_SERVICE: postgres · TDD_STATE: none
  VERIFY: PLATFORM_IT=1 pnpm vitest run tests/integration/service/evidence-seed-belief-path.test.ts
  SCENARIO — start_ref: clean-evidence-tables · evidence: db_query
    NEGATIVE_CONTROL: would fail if seedEvidence reconnects as owner solely to raw INSERT beliefs after H1 REVOKE (bypass / wrong path); seed fails under holocron_app because it still uses raw INSERT without DEFINER (function omitted); Closed history insert used to fabricate as-of; stub/mock seed returning ok without authorized write; static empty shell returning ok without DB
    EVIDENCE: db_query (required_capture=True)
    CASE[0] start_ref: clean-evidence-tables
      actor: operator
      - Run product seed under bound app role
      - Assert current_user holocron_app during seed belief write
      - Assert resulting belief tx_to IS NULL
      - Optional: confirm has_table_privilege app INSERT beliefs is false yet seed succeeded via EXECUTE
      MUST_OBSERVE:
        - seed ok: true with beliefId matching UUID format `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
        - open belief tx_to IS NULL (open COUNT = 1)
        - product seed session current_user: holocron_app (after H2)
        - belief write authorized via DEFINER EXECUTE when has_table_privilege(INSERT): false
      MUST_NOT_OBSERVE:
        - seed requires owner raw INSERT into beliefs
        - seed belief with tx_to IS NOT NULL (closed COUNT = 1 as sole belief)
        - permission denied leaving seed without belief while claim exists (beliefId empty)
        - ok: false with open beliefs COUNT = 0
AC-5 Seed still preserves dual contradicting passages + relations + net-support (flow_ref T-DATA-005)
  GIVEN: Product evidence:seed after belief wiring
  WHEN:  Inspecting seed side effects and evidence:belief netSupport
  THEN:  Still 2 passages, supports+contradicts relations; netSupport remains the validity-windowed computation (seed baseline netSupport = -1 at now for current open contradicts edge); belief creation does not drop ledger-1 substrate guarantees
  TEST_TIER: integration · VERIFICATION_SERVICE: postgres · TDD_STATE: none
  VERIFY: PLATFORM_IT=1 pnpm vitest run tests/integration/service/evidence-seed.test.ts tests/integration/service/evidence-seed-belief-path.test.ts
  SCENARIO — start_ref: clean-evidence-tables · evidence: stdout
    NEGATIVE_CONTROL: would fail if Belief wiring removes passage/relation inserts (substrate omitted); netSupport null solely because seed relations broken (deleted edges); Regression: evidence-seed.test.ts counts no longer met; stub/mock seed returning hardcoded counts without DB; static empty shell returning ok without DB
    EVIDENCE: stdout (required_capture=True)
    CASE[0] start_ref: clean-evidence-tables
      actor: operator
      - holo evidence:seed --json
      - Assert passageIds length 2, relationIds length 2
      - holo evidence:belief --as-of now --json → netSupport
      MUST_OBSERVE:
        - passageIds.length == 2
        - relationIds.length == 2
        - counts.openRelations >= 2
        - belief as-of now ok: true with beliefId matching UUID format `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
        - netSupport is integer (seed baseline netSupport == -1 at now per validity windows)
      MUST_NOT_OBSERVE:
        - passageIds.length == 0
        - relationIds.length == 0
        - belief ok with missing relations (substrate regression)
        - netSupport field absent or empty
        - openRelations COUNT = 0

--------------------------------------------------------------------------------
TEST CRITERIA (boolean statements mapping to ACs)
--------------------------------------------------------------------------------
| ID | Statement | Maps to | Verify | Type |
|----|-----------|---------|--------|------|
| TC-1 | holo evidence:seed --json returns ok:true with non-null claimId and beliefId and the belief row is open (tx_to IS NULL) for that claim. | AC-1 | `PLATFORM_IT=1 pnpm vitest run tests/integration/service/evidence-seed-belief-path.test.ts` | happy_path |
| TC-2 | Immediately after product seed only, holo evidence:belief --claim-id <seed claimId> --as-of now --json returns ok:true with the same beliefId and exit code 0. | AC-2 | `PLATFORM_IT=1 pnpm vitest run tests/integration/service/evidence-seed-belief-path.test.ts` | happy_path |
| TC-3 | Seeded belief actor is not gate-setup and statement is not 'initial gate belief from seed claim'; statement aligns with product SEED_CLAIM_TEXT semantics. | AC-3 | `PLATFORM_IT=1 pnpm vitest run tests/integration/service/evidence-seed-belief-path.test.ts` | negative |
| TC-4 | Under holocron_app product pool with H1 authenticity controls, seed still creates the open belief via authorized DEFINER path. | AC-4 | `PLATFORM_IT=1 pnpm vitest run tests/integration/service/evidence-seed-belief-path.test.ts` | invariant |
| TC-5 | Post-fix seed still inserts 2 passages and 2 relations and as-of now reports integer netSupport alongside the belief. | AC-5 | `PLATFORM_IT=1 pnpm vitest run tests/integration/service/evidence-seed.test.ts tests/integration/service/evidence-seed-belief-path.test.ts` | happy_path |
| TC-6 | RED evidence captures pre-fix seed→belief failure: ok:false / no belief for claim after evidence:seed without gate-setup. | AC-2 | `ls .tmp/ledger-2/REDHAT-FIX-H3-red* .spec/evidence/redhat-fix-h3* 2>/dev/null | head -5` | red_evidence |

--------------------------------------------------------------------------------
SCOPE (file-level write permissions)
--------------------------------------------------------------------------------

writeAllowed:
- services/platform/src/db/evidence/seed.ts
- services/platform/src/db/evidence/revise.ts
- services/platform/src/db/evidence/index.ts
- services/platform/src/cli/holo.ts
- tests/integration/service/evidence-seed-belief-path.test.ts
- tests/integration/service/evidence-seed.test.ts
- tests/integration/service/evidence-asof-*.test.ts
- tests/integration/service/evidence-harness.ts
- tests/integration/service/immutability-harness.ts
- .spec/prds/mk6-migration/tasks/sprint-07-evidence-graph-substrate-and-ledger-immutability/gate-plan.json
- .spec/prds/mk6-migration/tasks/sprint-07-evidence-graph-substrate-and-ledger-immutability/SPRINT.md
- .tmp/ledger-2/**
- .spec/evidence/redhat-fix-h3*

writeProhibited:
- services/platform/src/db/migrations/0000_*.sql
- services/platform/src/db/migrations/0001_*.sql
- services/platform/src/db/migrations/0002_*.sql
- services/platform/src/db/migrations/0003_*.sql
- services/platform/src/db/migrations/0004_beliefs_immutability_revise.sql
- services/platform/src/db/migrations/0005_belief_asof_net_support.sql
- services/platform/src/db/schema/evidence.ts
- app/**
- holocron-mcp/**
- Gate-only SQL scripts that INSERT actor=gate-setup as the permanent product path

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. `.spec/reviews/red-hat-2026-07-15T20-00-07Z-sprint07.md` (64-72,96-99,203-207)
   - Focus: H3 HT-1→HT-2 broken; gate-setup scaffold; live seed has no belief
2. `services/platform/src/db/evidence/seed.ts` (1-260)
   - Focus: seedEvidence creates source+2 passages+claim+relations only — no belief; EvidenceSeedResult lacks beliefId
3. `services/platform/src/db/evidence/revise.ts` (110-163)
   - Focus: seedOpenBelief test helper — wire into product seed via authorized path after H1
4. `services/platform/src/cli/holo.ts` (1005-1126)
   - Focus: evidence:seed and evidence:belief CLI surfaces
5. `services/platform/src/db/evidence/belief-asof.ts` (1-120)
   - Focus: getBeliefAsOf returns ok:false when no belief for claim
6. `tests/integration/service/evidence-seed.test.ts` (1-120)
   - Focus: Existing seed substrate assertions to extend/regress
7. `.spec/prds/mk6-migration/tasks/sprint-07-evidence-graph-substrate-and-ledger-immutability/SPRINT.md` (31-42)
   - Focus: Human Test Deliverable HT-1 seed → HT-2 belief --as-of now

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
Gate 1: Typecheck
  Command: `pnpm tsgo --noEmit`
  Expected: Exit 0
Gate 2: Lint
  Command: `pnpm biome check .`
  Expected: Exit 0
Gate 3: Seed→belief product path suite
  Command: `PLATFORM_IT=1 pnpm vitest run tests/integration/service/evidence-seed-belief-path.test.ts tests/integration/service/evidence-seed.test.ts`
  Expected: Exit 0
Gate 4: As-of + immutability regression
  Command: `PLATFORM_IT=1 pnpm vitest run tests/integration/service/evidence-asof-*.test.ts tests/integration/service/immutability-*.test.ts`
  Expected: Exit 0

--------------------------------------------------------------------------------
DESIGN
--------------------------------------------------------------------------------

References:
- .spec/reviews/red-hat-2026-07-15T20-00-07Z-sprint07.md — H3
- services/platform/src/db/evidence/seed.ts — seedEvidence gap
- services/platform/src/db/evidence/revise.ts — seedOpenBelief
- SPRINT.md Human Test Deliverable HT-1→HT-2

Interaction notes:
- After inserting claim in seedEvidence, call authorized open-belief writer with claimId=claimId, statement based on SEED_CLAIM_TEXT (or explicit seed belief statement constant), actor='evidence:seed', confidence matching claim (0.55) or documented default.
- Extend EvidenceSeedResult with beliefId: string | null; CLI text prints beliefId; JSON includes beliefId.
- Depends on REDHAT-FIX-H1 so open-belief write is DEFINER-safe under INSERT lockdown; depends on REDHAT-FIX-H2 so product seed runs as holocron_app with operability grants.
- Update gate-plan to remove gate-setup belief insert between steps 1 and 2 once product path works; do not keep gate-setup as required product step.
- Preserve net-support semantics from ledger-3 seed validity windows (supports closed 2024-H1, contradicts open → netSupport -1 at now).

Pattern: Product seed is a single operator entrypoint that materializes claim graph + initial open belief via authorized DEFINER write; as-of reads that belief without scaffolds
Pattern source: services/platform/src/db/evidence/seed.ts + services/platform/src/db/evidence/revise.ts seedOpenBelief
Anti-pattern: Gate scripts inserting actor=gate-setup beliefs to make HT-2 pass while product evidence:seed remains belief-less; or returning beliefId in JSON without inserting a real open row

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------

Depends on: ledger-1, REDHAT-FIX-H1, REDHAT-FIX-H2
Blocks: None

--------------------------------------------------------------------------------
CODING STANDARDS
--------------------------------------------------------------------------------
- RULES.md
- services/platform/src/db/evidence/seed.ts
- services/platform/src/db/evidence/revise.ts
- services/platform/src/cli/holo.ts

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------

Implementer: mastra-implementer
Rationale: Product path fix for evidence:seed → evidence:belief continuous human test. Requires wiring authorized open-belief creation into seedEvidence/CLI and PLATFORM_IT proof without gate-setup scaffolds. mastra-implementer owns the evidence CLI surface; mastra-reviewer confirms HT-1→HT-2 is product-true.
Reviewer: mastra-reviewer

--------------------------------------------------------------------------------
REVIEW (for mastra-reviewer)
--------------------------------------------------------------------------------

Must pass:
- Each AC asserts a concrete failure/success signature against real Postgres (PLATFORM_IT=1)
- No stubs/mocks of DB client; REVOKE/DEFINER/role-bind is DB-enforced where claimed
- RED evidence present for primary path before GREEN
- SCOPE respected (git diff --name-only ⊆ writeAllowed)
- HT-1→HT-2 product path is not gate-scaffolded (H3) / owner pool not default product path (H2) / closed INSERT blocked (H1)

Verdict: [APPROVED | NEEDS_FIXES]

--------------------------------------------------------------------------------
NOTES
--------------------------------------------------------------------------------
Source: .spec/reviews/red-hat-2026-07-15T20-00-07Z-sprint07.md
Proposed by: mastra-planner (via /kb-sprint-tasks-plan --only REDHAT-FIX-H3)

</details>

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-H3",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "clean-evidence-tables": {
      "description": "Evidence tables truncated under advisory lock so seed is the sole source of the claim/belief under test.",
      "seed_method": "public_api",
      "records": [
        "truncateEvidenceTables() / withEvidenceLock",
        "ensureMigrated including H1 0006_* and H2 operability grants"
      ]
    },
    "product-seed-output": {
      "description": "JSON output of holo evidence:seed --json from the product CLI only.",
      "seed_method": "public_api",
      "records": [
        "bun services/platform/src/cli/holo.ts evidence:seed --json",
        "Capture claimId, beliefId, passageIds, relationIds"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN clean evidence tables, WHEN holo evidence:seed --json, THEN ok:true with claimId and beliefId UUIDs and exactly one open belief row for that claim",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/evidence-seed-belief-path.test.ts",
      "maps_to_ac": null,
      "flow_ref": "T-DATA-005",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres",
        "negative_control": {
          "would_fail_if": [
            "seedEvidence still inserts only source+passages+claim+relations with NO belief (current red-hat live / belief insert omitted)",
            "beliefId only invented in JSON without DB row (hardcoded / stub)",
            "Test inserts belief via seedOpenBelief harness after seed CLI (scaffolding / mock path)",
            "static empty shell returning ok without DB",
            "product seed belief write absent"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "clean-evidence-tables",
            "action": {
              "actor": "operator",
              "steps": [
                "holo evidence:seed --json",
                "Parse claimId and beliefId",
                "SELECT id, claim_id, tx_to, actor, statement FROM beliefs WHERE id = beliefId"
              ]
            },
            "end_state": {
              "must_observe": [
                "seed ok: true",
                "claimId matches UUID format `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`",
                "beliefId matches UUID format `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`",
                "beliefs.tx_to IS NULL for beliefId (open COUNT = 1)",
                "beliefs.claim_id == seed claimId (same UUID string)",
                "COUNT open beliefs for claimId == 1"
              ],
              "must_not_observe": [
                "beliefId empty or null",
                "ok: false",
                "open beliefs COUNT = 0 for claimId",
                "belief row with tx_to IS NOT NULL as the only seed belief",
                "empty claimId"
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
      "description": "GIVEN only product evidence:seed for claimId, WHEN evidence:belief --as-of now, THEN ok:true with same beliefId and no 'no belief for claim' error",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/evidence-seed-belief-path.test.ts",
      "maps_to_ac": null,
      "flow_ref": "T-DATA-005",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres",
        "negative_control": {
          "would_fail_if": [
            "as-of now still returns ok:false / no belief for claim (red-hat live re-probe / seed belief omitted)",
            "Test inserts gate-setup belief between seed and belief commands (scaffold / stub path)",
            "belief as-of reads a different claim_id than seed output (wrong constant)",
            "static empty shell returning ok without DB",
            "mock getBeliefAsOf hardcoded ok:true"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "product-seed-output",
            "action": {
              "actor": "operator",
              "steps": [
                "holo evidence:seed --json \u2192 claimId, beliefId",
                "Immediately holo evidence:belief --claim-id claimId --as-of now --json",
                "Compare belief ids and ok flags"
              ]
            },
            "end_state": {
              "must_observe": [
                "belief command ok: true",
                "belief command exit code == 0",
                "beliefId == seed beliefId (same UUID string)",
                "statement length > 0",
                "netSupport is a number (seed baseline netSupport == -1 or other integer)"
              ],
              "must_not_observe": [
                "ok: false",
                "errors containing 'no belief for claim'",
                "beliefId empty or null",
                "exit code == 1 solely due to missing belief",
                "empty statement"
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
      "description": "GIVEN seed-created belief, WHEN reading actor/statement, THEN actor \u2260 gate-setup and statement \u2260 'initial gate belief from seed claim' and statement aligns with SEED_CLAIM_TEXT semantics",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/evidence-seed-belief-path.test.ts",
      "maps_to_ac": null,
      "flow_ref": "T-DATA-005",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres",
        "negative_control": {
          "would_fail_if": [
            "Gate scripts still required to INSERT actor=gate-setup for HT-2 (product path omitted)",
            "Product seed copies gate-setup strings into production path (hardcoded scaffold)",
            "Actor left null and gate path is the only documented way to set actor (absent product actor)",
            "stub/mock seed that does not persist actor/statement",
            "static empty shell returning ok without DB"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "product-seed-output",
            "action": {
              "actor": "operator",
              "steps": [
                "seed via CLI",
                "SELECT actor, statement FROM beliefs WHERE id = beliefId",
                "Compare statement to SEED_CLAIM_TEXT or documented product seed belief statement"
              ]
            },
            "end_state": {
              "must_observe": [
                "actor is non-empty product actor (e.g. 'evidence:seed' or 'seed')",
                "actor != 'gate-setup' (actor is not gate-setup)",
                "statement != 'initial gate belief from seed claim'",
                "statement contains product seed claim semantics matching SEED_CLAIM_TEXT 'Quarterly revenue grew year-over-year.'"
              ],
              "must_not_observe": [
                "actor equals 'gate-setup'",
                "statement equals 'initial gate belief from seed claim'",
                "actor empty or null",
                "statement empty",
                "none product actor (blank)"
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
      "description": "GIVEN H1 authenticity + H2 app-role bind, WHEN product seed creates belief, THEN write uses authorized DEFINER path under holocron_app with open tx_to IS NULL",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/evidence-seed-belief-path.test.ts",
      "maps_to_ac": null,
      "flow_ref": "T-DATA-006",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres",
        "negative_control": {
          "would_fail_if": [
            "seedEvidence reconnects as owner solely to raw INSERT beliefs after H1 REVOKE (bypass / wrong path)",
            "seed fails under holocron_app because it still uses raw INSERT without DEFINER (function omitted)",
            "Closed history insert used to fabricate as-of",
            "stub/mock seed returning ok without authorized write",
            "static empty shell returning ok without DB"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "clean-evidence-tables",
            "action": {
              "actor": "operator",
              "steps": [
                "Run product seed under bound app role",
                "Assert current_user holocron_app during seed belief write",
                "Assert resulting belief tx_to IS NULL",
                "Optional: confirm has_table_privilege app INSERT beliefs is false yet seed succeeded via EXECUTE"
              ]
            },
            "end_state": {
              "must_observe": [
                "seed ok: true with beliefId matching UUID format `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`",
                "open belief tx_to IS NULL (open COUNT = 1)",
                "product seed session current_user: holocron_app (after H2)",
                "belief write authorized via DEFINER EXECUTE when has_table_privilege(INSERT): false"
              ],
              "must_not_observe": [
                "seed requires owner raw INSERT into beliefs",
                "seed belief with tx_to IS NOT NULL (closed COUNT = 1 as sole belief)",
                "permission denied leaving seed without belief while claim exists (beliefId empty)",
                "ok: false with open beliefs COUNT = 0"
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
      "description": "GIVEN product seed with belief wiring, WHEN inspecting passages/relations and as-of netSupport, THEN ledger-1 substrate counts remain (2 passages, 2 relations) and netSupport is integer alongside belief",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/evidence-seed.test.ts tests/integration/service/evidence-seed-belief-path.test.ts",
      "maps_to_ac": null,
      "flow_ref": "T-DATA-005",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres",
        "negative_control": {
          "would_fail_if": [
            "Belief wiring removes passage/relation inserts (substrate omitted)",
            "netSupport null solely because seed relations broken (deleted edges)",
            "Regression: evidence-seed.test.ts counts no longer met",
            "stub/mock seed returning hardcoded counts without DB",
            "static empty shell returning ok without DB"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "clean-evidence-tables",
            "action": {
              "actor": "operator",
              "steps": [
                "holo evidence:seed --json",
                "Assert passageIds length 2, relationIds length 2",
                "holo evidence:belief --as-of now --json \u2192 netSupport"
              ]
            },
            "end_state": {
              "must_observe": [
                "passageIds.length == 2",
                "relationIds.length == 2",
                "counts.openRelations >= 2",
                "belief as-of now ok: true with beliefId matching UUID format `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`",
                "netSupport is integer (seed baseline netSupport == -1 at now per validity windows)"
              ],
              "must_not_observe": [
                "passageIds.length == 0",
                "relationIds.length == 0",
                "belief ok with missing relations (substrate regression)",
                "netSupport field absent or empty",
                "openRelations COUNT = 0"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "holo evidence:seed --json returns ok:true with non-null claimId and beliefId and the belief row is open (tx_to IS NULL) for that claim.",
      "maps_to_ac": "AC-1",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/evidence-seed-belief-path.test.ts"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Immediately after product seed only, holo evidence:belief --claim-id <seed claimId> --as-of now --json returns ok:true with the same beliefId and exit code 0.",
      "maps_to_ac": "AC-2",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/evidence-seed-belief-path.test.ts"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Seeded belief actor is not gate-setup and statement is not 'initial gate belief from seed claim'; statement aligns with product SEED_CLAIM_TEXT semantics.",
      "maps_to_ac": "AC-3",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/evidence-seed-belief-path.test.ts"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Under holocron_app product pool with H1 authenticity controls, seed still creates the open belief via authorized DEFINER path.",
      "maps_to_ac": "AC-4",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/evidence-seed-belief-path.test.ts"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "Post-fix seed still inserts 2 passages and 2 relations and as-of now reports integer netSupport alongside the belief.",
      "maps_to_ac": "AC-5",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/evidence-seed.test.ts tests/integration/service/evidence-seed-belief-path.test.ts"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "RED evidence captures pre-fix seed\u2192belief failure: ok:false / no belief for claim after evidence:seed without gate-setup.",
      "maps_to_ac": "AC-2",
      "verify": "ls .tmp/ledger-2/REDHAT-FIX-H3-red* .spec/evidence/redhat-fix-h3* 2>/dev/null | head -5"
    }
  ]
}
-->
