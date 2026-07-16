# REDHAT-FIX-H1 — Close the as-of audit-forgery path by preventing app-role insertion of closed historical beliefs while preserving authorized seed/revision writes (fresh red-hat H1: INSERT as-of forgery)

## What this does

Close red-hat H1 by making closed-history belief INSERT impossible for holocron_app while keeping authorized open seed and temporal revision operable via SECURITY DEFINER entry points, so as-of audit history cannot be forged mid-window.

Provides: belief-insert-authenticity, seed-open-belief-security-definer, as-of-history-non-forgeability-app-role.

## Why

- MUST add a new Drizzle migration 0006_* that enforces belief INSERT authenticity at the database (prefer REVOKE INSERT on beliefs FROM holocron_app + SECURITY DEFINER seed_open_belief for open rows only; revise_belief already DEFINER for successors)
- MUST reject as holocron_app any direct INSERT into beliefs that supplies non-NULL tx_to (closed historical forgery path)
- MUST preserve authorized open-belief seed and revise_belief atomic supersession as callable by holocron_app via SECURITY DEFINER EXECUTE grants
- MUST prove with PLATFORM_IT=1 against real Postgres that belief_as_of cannot surface a forged mid-window statement inserted by the app role
- MUST rewire seedOpenBelief (and any product/test open-belief writer) to the authorized definer path — no raw INSERT INTO beliefs as holocron_app after lockdown
- NEVER rely on TypeScript-only guards for closed-history authenticity (DB must enforce)
- NEVER leave GRANT INSERT ON beliefs TO holocron_app if that grant still allows closed-history rows
- NEVER break revise_belief atomic close+insert or its EXECUTE grant to holocron_app
- STRICTLY all behavioral proof uses real Postgres (PLATFORM_IT=1); no mocked postgres clients
- STRICTLY migration is 0006_* (next after shipped 0005_belief_asof_net_support.sql) — do not rewrite 0004/0005
- Grounded in: UC-DATA-02, UC-PLAT-01-AC-4, T-PLAT-004, T-DATA-006, AP-1, AP-7

## How to verify

- `pnpm tsgo --noEmit` → Exit 0
- `pnpm biome check .` → Exit 0
- `PLATFORM_IT=1 pnpm vitest run tests/integration/service/immutability-insert-closed-rejected.test.ts tests/integration/service/immutability-seed-open-belief-definer.test.ts tests/integration/service/immutability-asof-no-forgery.test.ts` → Exit 0
- `PLATFORM_IT=1 pnpm vitest run tests/integration/service/immutability-*.test.ts` → Exit 0

## Scope

Writes: services/platform/src/db/migrations/0006_*.sql · services/platform/src/db/migrations/meta/** · services/platform/src/db/evidence/revise.ts · services/platform/src/db/evidence/index.ts · services/platform/src/db/evidence/roles.ts · tests/integration/service/immutability-insert-closed-rejected.test.ts · tests/integration/service/immutability-seed-open-belief-definer.test.ts · tests/integration/service/immutability-asof-no-forgery.test.ts · tests/integration/service/immutability-harness.ts · tests/integration/service/immutability-atomic-revision.test.ts · .tmp/ledger-2/** · .spec/evidence/redhat-fix-h1*

Prohibited: services/platform/src/db/migrations/0000_*.sql · services/platform/src/db/migrations/0001_*.sql · services/platform/src/db/migrations/0002_*.sql · services/platform/src/db/migrations/0003_*.sql · services/platform/src/db/migrations/0004_beliefs_immutability_revise.sql · services/platform/src/db/migrations/0005_belief_asof_net_support.sql · services/platform/src/db/schema/evidence.ts · app/**

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: REDHAT-FIX-H1 — Close the as-of audit-forgery path by preventing app-role insertion of closed historical beliefs while preserving authorized seed/revision writes (fresh red-hat H1: INSERT as-of forgery)
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Completed
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
As holocron_app, INSERT INTO beliefs (... tx_to = <past> ...) fails (privilege and/or trigger); seed_open_belief / product-authorized open seed succeeds with tx_to IS NULL; revise_belief still closes predecessor and inserts successor; belief_as_of for a claim never returns an app-forged closed mid-window statement over the real open chain.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST add a new Drizzle migration 0006_* that enforces belief INSERT authenticity at the database (prefer REVOKE INSERT on beliefs FROM holocron_app + SECURITY DEFINER seed_open_belief for open rows only; revise_belief already DEFINER for successors)
- MUST reject as holocron_app any direct INSERT into beliefs that supplies non-NULL tx_to (closed historical forgery path)
- MUST preserve authorized open-belief seed and revise_belief atomic supersession as callable by holocron_app via SECURITY DEFINER EXECUTE grants
- MUST prove with PLATFORM_IT=1 against real Postgres that belief_as_of cannot surface a forged mid-window statement inserted by the app role
- MUST rewire seedOpenBelief (and any product/test open-belief writer) to the authorized definer path — no raw INSERT INTO beliefs as holocron_app after lockdown
- NEVER rely on TypeScript-only guards for closed-history authenticity (DB must enforce)
- NEVER leave GRANT INSERT ON beliefs TO holocron_app if that grant still allows closed-history rows
- NEVER break revise_belief atomic close+insert or its EXECUTE grant to holocron_app
- NEVER allow holocron_app to INSERT a belief with tx_to set while an open real belief for the same claim remains and belief_as_of can prefer the forged mid-window row
- STRICTLY all behavioral proof uses real Postgres (PLATFORM_IT=1); no mocked postgres clients
- STRICTLY migration is 0006_* (next after shipped 0005_belief_asof_net_support.sql) — do not rewrite 0004/0005
- STRICTLY seed_open_belief (or equivalent) is SECURITY DEFINER, owner holocron_owner, search_path=public, and forces tx_to IS NULL on insert

--------------------------------------------------------------------------------
BOUNDARY CONTRACTS
--------------------------------------------------------------------------------
- beliefs table: holocron_app MUST NOT INSERT rows with tx_to IS NOT NULL (closed history)
- Open belief creation for product/tests MUST go through SECURITY DEFINER seed_open_belief(...) (or equivalent definer-only open insert)
- revise_belief SECURITY DEFINER remains the sole app-callable path for supersession inserts that close predecessors
- Impossibility of as-of mid-window hijack via app-role direct INSERT is a DB privilege/integrity control (AP-7 audit integrity), not TS-only filtering

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [x] AC-1: App role cannot INSERT closed historical beliefs (PRIMARY)
- [x] AC-2: Authorized open-belief seed succeeds via SECURITY DEFINER
- [x] AC-3: revise_belief still atomically supersedes after insert lockdown
- [x] AC-4: belief_as_of cannot return app-forged mid-window closed history
- [x] AC-5: Privilege catalog matches authenticity posture
- [ ] `PLATFORM_IT=1` integration suite green + `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean (only SCOPE.writeAllowed files modified)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads — RED before GREEN, proven by real services)
--------------------------------------------------------------------------------
AC-1 App role cannot INSERT closed historical beliefs [PRIMARY] (flow_ref T-PLAT-004)
  GIVEN: Postgres with 0006_* insert-authenticity migration applied and holocron_app connected via toAppRoleDatabaseUrl
  WHEN:  Executing INSERT INTO beliefs (claim_id, statement, confidence, tx_from, tx_to, actor) VALUES (..., now() - interval '1 day', now() - interval '1 hour', 'forger') as holocron_app
  THEN:  Statement fails with permission denied (SQLSTATE 42501) and/or a trigger exception forbidding non-NULL tx_to; no closed forged row remains committed
  TEST_TIER: integration · VERIFICATION_SERVICE: postgres · TDD_STATE: none
  VERIFY: PLATFORM_IT=1 pnpm vitest run tests/integration/service/immutability-insert-closed-rejected.test.ts
  SCENARIO — start_ref: migrated-ledger-db · evidence: db_query
    NEGATIVE_CONTROL: would fail if 0006 migration omitted and GRANT INSERT ON beliefs TO holocron_app retained from 0004; stub/mock postgres client that never executes INSERT; static empty shell returning ok without DB; Only TS validation rejects closed inserts while raw SQL as holocron_app still succeeds; INSERT closed history succeeds RETURNING closed=t as in red-hat live probe (migration absent)
    EVIDENCE: db_query (required_capture=True)
    CASE[0] start_ref: migrated-ledger-db
      actor: adversary-app-role
      - Connect as holocron_app via toAppRoleDatabaseUrl
      - SELECT current_user — expect holocron_app
      - INSERT closed belief with tx_to set in the past
      - Capture SQLSTATE / error message
      - As owner, COUNT forged rows with statement/actor of the attempt
      MUST_OBSERVE:
        - session current_user: holocron_app
        - INSERT closed history fails with SQLSTATE 42501
        - forged committed COUNT = 0
      MUST_NOT_OBSERVE:
        - INSERT success rowcount ≥ 1 for closed history as holocron_app
        - RETURNING closed=t for app-role forged row
        - empty SQLSTATE on failed INSERT (no error code)
        - forged belief rows COUNT > 0
AC-2 Authorized open-belief seed succeeds via SECURITY DEFINER (flow_ref T-DATA-006)
  GIVEN: Postgres with 0006_* applied; holocron_app may no longer raw-INSERT open beliefs if INSERT revoked
  WHEN:  Calling seed_open_belief(...) / seedOpenBelief authorized path as holocron_app with claim_id C and statement S
  THEN:  Returns a belief UUID; row exists with tx_to IS NULL, statement=S, claim_id=C; function is SECURITY DEFINER owned by holocron_owner
  TEST_TIER: integration · VERIFICATION_SERVICE: postgres · TDD_STATE: none
  VERIFY: PLATFORM_IT=1 pnpm vitest run tests/integration/service/immutability-seed-open-belief-definer.test.ts
  SCENARIO — start_ref: migrated-ledger-db · evidence: db_query
    NEGATIVE_CONTROL: would fail if INSERT fully revoked without seed_open_belief definer (operability broken / omitted function); seed_open_belief is SECURITY INVOKER and still requires table INSERT for holocron_app; seedOpenBelief TypeScript still does raw INSERT and fails after REVOKE without migration function; stub/mock seed_open_belief returning a hardcoded UUID without DB write; static empty shell returning ok without DB
    EVIDENCE: db_query (required_capture=True)
    CASE[0] start_ref: migrated-ledger-db
      actor: operator
      - As holocron_app, SELECT seed_open_belief(claim_id, statement, confidence, actor, ...)
      - Query beliefs by returned id
      - Query pg_proc for seed_open_belief prosecdef and owner
      MUST_OBSERVE:
        - beliefId matches UUID format `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
        - seeded row has tx_to IS NULL with open COUNT = 1
        - seeded row has tx_from IS NOT NULL (tx_from COUNT = 1)
        - seed_open_belief.prosecdef: true
        - seed_open_belief owner: holocron_owner
      MUST_NOT_OBSERVE:
        - beliefId empty or null
        - seeded row has tx_to IS NOT NULL
        - open beliefs COUNT = 0 after successful seed
        - function missing or prosecdef: false
        - stub returns ok:true with beliefId empty
AC-3 revise_belief still atomically supersedes after insert lockdown (flow_ref T-DATA-006)
  GIVEN: Open belief B1 created via authorized seed path under 0006_*
  WHEN:  Calling revise_belief(B1.id, actor, run_id, idempotency_key, new_statement, confidence, now(), NULL) as holocron_app
  THEN:  B1.tx_to set; exactly one successor B2 with supersedes_id=B1.id and tx_to IS NULL; function returns B2.id
  TEST_TIER: integration · VERIFICATION_SERVICE: postgres · TDD_STATE: none
  VERIFY: PLATFORM_IT=1 pnpm vitest run tests/integration/service/immutability-atomic-revision.test.ts
  SCENARIO — start_ref: open-belief-claim · evidence: db_query
    NEGATIVE_CONTROL: would fail if REVOKE INSERT also broke revise_belief successor INSERT without owner privileges on definer; EXECUTE on revise_belief revoked/omitted from holocron_app; Migration dropped revise_belief while adding seed_open_belief (removed function); stub/mock revise_belief returning hardcoded successor without DB; static empty shell returning ok without DB
    EVIDENCE: db_query (required_capture=True)
    CASE[0] start_ref: open-belief-claim
      actor: operator
      - Connect as holocron_app
      - SELECT revise_belief(B1, 'op-h1', 'run-h1', 'key-h1', 'revised-after-insert-lock', 0.9, now(), NULL)
      - Query predecessor and successor rows
      MUST_OBSERVE:
        - B1.tx_to IS NOT NULL (closed COUNT = 1)
        - B2.supersedes_id equals B1.id
        - B2.tx_to IS NULL (open successor COUNT = 1)
        - COUNT(*) WHERE claim_id=C AND tx_to IS NULL == 1
        - revise_belief returns B2.id UUID format `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
      MUST_NOT_OBSERVE:
        - revise_belief permission denied SQLSTATE 42501 for EXECUTE
        - two open beliefs for claim C (COUNT = 2)
        - B1 still open with tx_to IS NULL after successful revise
        - open beliefs COUNT = 0 after revise
        - successorId empty
AC-4 belief_as_of cannot return app-forged mid-window closed history (flow_ref T-PLAT-004)
  GIVEN: as-of-chain-two-revisions fixture (B1→B2) and 0006_* authenticity controls active
  WHEN:  Adversary as holocron_app attempts to INSERT a closed mid-window belief with higher/earlier tx_from covering t_mid and forged statement, then operator queries belief_as_of(claim, t_mid)
  THEN:  Forged INSERT fails; belief_as_of(t_mid) returns B1.statement (real chain), never the forged statement
  TEST_TIER: integration · VERIFICATION_SERVICE: postgres · TDD_STATE: none
  VERIFY: PLATFORM_IT=1 pnpm vitest run tests/integration/service/immutability-asof-no-forgery.test.ts
  SCENARIO — start_ref: as-of-chain-two-revisions · evidence: db_query
    NEGATIVE_CONTROL: would fail if App role can still INSERT closed rows (H1 unfixed / migration omitted) and belief_as_of ORDER BY tx_from DESC returns forged mid-window statement; Test only asserts INSERT failure without querying belief_as_of after attempted forgery; Forgery performed as table owner and treated as app-role control proof (wrong role / stub); stub/mock belief_as_of returning hardcoded B1 without DB; static empty shell returning ok without DB
    EVIDENCE: db_query (required_capture=True)
    CASE[0] start_ref: as-of-chain-two-revisions
      actor: adversary-app-role
      - Record B1.statement and t_mid
      - As holocron_app attempt INSERT closed belief for same claim_id with tx_from < t_mid < tx_to and statement 'FORGED-ASOF-HIJACK'
      - SELECT * FROM belief_as_of(claim_id, t_mid)
      - Assert statement is B1.statement
      MUST_OBSERVE:
        - forged INSERT fails with SQLSTATE 42501 for holocron_app
        - belief_as_of(t_mid).statement equals B1.statement (not 'FORGED-ASOF-HIJACK')
        - belief_as_of(t_mid).id equals B1.id
        - forged statement 'FORGED-ASOF-HIJACK' committed COUNT = 0
      MUST_NOT_OBSERVE:
        - belief_as_of(t_mid).statement equals 'FORGED-ASOF-HIJACK'
        - forged INSERT success rowcount ≥ 1 as holocron_app
        - empty belief_as_of result when real B1 covers t_mid (COUNT = 0)
        - no belief returned with ok: false after real chain exists
AC-5 Privilege catalog matches authenticity posture (flow_ref T-PLAT-004)
  GIVEN: 0006_* applied on real Postgres
  WHEN:  Querying has_table_privilege / information_schema grants for holocron_app on beliefs and EXECUTE on seed_open_belief + revise_belief
  THEN:  holocron_app lacks INSERT (or closed-insert is impossible via trigger with INSERT retained only if trigger is proven); has SELECT; has EXECUTE on seed_open_belief and revise_belief; holocron_owner retains INSERT/UPDATE/DELETE for definer bodies
  TEST_TIER: integration · VERIFICATION_SERVICE: postgres · TDD_STATE: none
  VERIFY: PLATFORM_IT=1 pnpm vitest run tests/integration/service/immutability-insert-closed-rejected.test.ts
  SCENARIO — start_ref: migrated-ledger-db · evidence: db_query
    NEGATIVE_CONTROL: would fail if Grants left as 0004 GRANT SELECT, INSERT without compensating BEFORE INSERT closed-row reject (migration omitted); EXECUTE grants missing/absent so product seed/revise inoperable under app role; Privilege catalog still shows unrestricted INSERT of closed rows for holocron_app; stub/mock privilege inventory hardcoded true without querying pg_catalog; static empty shell returning ok without DB
    EVIDENCE: db_query (required_capture=True)
    CASE[0] start_ref: migrated-ledger-db
      actor: operator
      - SELECT has_table_privilege('holocron_app','beliefs','INSERT'|'UPDATE'|'DELETE'|'SELECT')
      - SELECT has_function_privilege for seed_open_belief and revise_belief EXECUTE
      - SELECT has_table_privilege('holocron_owner','beliefs','INSERT'|'UPDATE')
      MUST_OBSERVE:
        - has_table_privilege(holocron_app, beliefs, UPDATE): false
        - has_table_privilege(holocron_app, beliefs, DELETE): false
        - has_table_privilege(holocron_app, beliefs, SELECT): true
        - has_function_privilege holocron_app EXECUTE revise_belief: true
        - has_function_privilege holocron_app EXECUTE seed_open_belief: true
        - closed-history insert path non-operable (INSERT false OR trigger deny with SQLSTATE 42501 proven in AC-1)
      MUST_NOT_OBSERVE:
        - has_table_privilege(holocron_app, beliefs, UPDATE): true
        - has_table_privilege(holocron_app, beliefs, DELETE): true
        - closed INSERT operable for app with success rowcount ≥ 1
        - empty privilege query result (none)

--------------------------------------------------------------------------------
TEST CRITERIA (boolean statements mapping to ACs)
--------------------------------------------------------------------------------
| ID | Statement | Maps to | Verify | Type |
|----|-----------|---------|--------|------|
| TC-1 | As holocron_app, INSERT of a beliefs row with non-NULL tx_to fails and commits zero forged rows. | AC-1 | `PLATFORM_IT=1 pnpm vitest run tests/integration/service/immutability-insert-closed-rejected.test.ts` | negative |
| TC-2 | seed_open_belief / seedOpenBelief as holocron_app inserts exactly one open belief (tx_to IS NULL) and returns its UUID. | AC-2 | `PLATFORM_IT=1 pnpm vitest run tests/integration/service/immutability-seed-open-belief-definer.test.ts` | happy_path |
| TC-3 | After 0006_*, revise_belief as holocron_app closes the predecessor and inserts exactly one open successor. | AC-3 | `PLATFORM_IT=1 pnpm vitest run tests/integration/service/immutability-atomic-revision.test.ts` | happy_path |
| TC-4 | belief_as_of at mid-window after a failed app-role forgery attempt returns the real predecessor statement, never FORGED-ASOF-HIJACK. | AC-4 | `PLATFORM_IT=1 pnpm vitest run tests/integration/service/immutability-asof-no-forgery.test.ts` | negative |
| TC-5 | Privilege inventory shows holocron_app cannot UPDATE/DELETE beliefs and cannot complete closed-history INSERT; EXECUTE remains on seed_open_belief and revise_belief. | AC-5 | `PLATFORM_IT=1 pnpm vitest run tests/integration/service/immutability-insert-closed-rejected.test.ts` | invariant |
| TC-6 | RED evidence artifact exists showing closed INSERT as holocron_app succeeded before the fix (or the new test fails against pre-0006 schema). | AC-1 | `ls .tmp/ledger-2/REDHAT-FIX-H1-red* .spec/evidence/redhat-fix-h1* 2>/dev/null | head -5` | red_evidence |

--------------------------------------------------------------------------------
SCOPE (file-level write permissions)
--------------------------------------------------------------------------------

writeAllowed:
- services/platform/src/db/migrations/0006_*.sql
- services/platform/src/db/migrations/meta/**
- services/platform/src/db/evidence/revise.ts
- services/platform/src/db/evidence/index.ts
- services/platform/src/db/evidence/roles.ts
- tests/integration/service/immutability-insert-closed-rejected.test.ts
- tests/integration/service/immutability-seed-open-belief-definer.test.ts
- tests/integration/service/immutability-asof-no-forgery.test.ts
- tests/integration/service/immutability-harness.ts
- tests/integration/service/immutability-atomic-revision.test.ts
- .tmp/ledger-2/**
- .spec/evidence/redhat-fix-h1*

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

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. `.spec/reviews/red-hat-2026-07-15T20-00-07Z-sprint07.md` (86-99,203-208)
   - Focus: H1 finding, live INSERT closed history probe, must-fix list
2. `services/platform/src/db/migrations/0004_beliefs_immutability_revise.sql` (38-50,77-214)
   - Focus: Current GRANT SELECT,INSERT to holocron_app; revise_belief SECURITY DEFINER pattern to mirror for seed_open_belief
3. `services/platform/src/db/migrations/0005_belief_asof_net_support.sql` (12-28)
   - Focus: belief_as_of ORDER BY tx_from DESC — forgery surface
4. `services/platform/src/db/evidence/revise.ts` (110-163)
   - Focus: seedOpenBelief raw INSERT — must become definer call
5. `services/platform/src/db/evidence/roles.ts` (1-32)
   - Focus: HOLOCRON_APP_ROLE + toAppRoleDatabaseUrl for app-role tests
6. `tests/integration/service/immutability-dml-rejected.test.ts` (1-100)
   - Focus: Pattern for app-role privilege IT + artifacts
7. `tests/integration/service/immutability-harness.ts` (44-63)
   - Focus: seedBeliefForTest → seedOpenBelief wiring

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
Gate 1: Typecheck
  Command: `pnpm tsgo --noEmit`
  Expected: Exit 0
Gate 2: Lint
  Command: `pnpm biome check .`
  Expected: Exit 0
Gate 3: Insert authenticity integration suite
  Command: `PLATFORM_IT=1 pnpm vitest run tests/integration/service/immutability-insert-closed-rejected.test.ts tests/integration/service/immutability-seed-open-belief-definer.test.ts tests/integration/service/immutability-asof-no-forgery.test.ts`
  Expected: Exit 0
Gate 4: Regression immutability revise suite
  Command: `PLATFORM_IT=1 pnpm vitest run tests/integration/service/immutability-*.test.ts`
  Expected: Exit 0

--------------------------------------------------------------------------------
DESIGN
--------------------------------------------------------------------------------

References:
- .spec/reviews/red-hat-2026-07-15T20-00-07Z-sprint07.md — H1
- services/platform/src/db/migrations/0004_beliefs_immutability_revise.sql — REVOKE/GRANT + revise_belief DEFINER pattern
- UC-DATA-02 / T-PLAT-004 / T-DATA-006 — immutability + as-of audit chain

Interaction notes:
- Prefer REVOKE INSERT ON beliefs FROM holocron_app; GRANT SELECT only; add seed_open_belief(...) SECURITY DEFINER OWNER holocron_owner that forces tx_to NULL; GRANT EXECUTE TO holocron_app.
- Alternative acceptable if proven: retain INSERT but BEFORE INSERT trigger rejects NEW.tx_to IS NOT NULL unless session_user/current_user is holocron_owner (definer). Prefer REVOKE+DEFINER to match sprint posture.
- Update seedOpenBelief TypeScript to SELECT seed_open_belief(...) instead of raw INSERT.
- H3 will call the same authorized open-belief path from seedEvidence — do not invent a second write API.
- H2 binds product pools to holocron_app; H1 must leave EXECUTE paths usable under that role.

Pattern: DB-enforced ledger authenticity: least-privilege REVOKE on beliefs + SECURITY DEFINER write functions owned by holocron_owner (mirror revise_belief)
Pattern source: services/platform/src/db/migrations/0004_beliefs_immutability_revise.sql
Anti-pattern: TypeScript-only reject of closed inserts while holocron_app retains raw INSERT; or stub seed_open_belief that returns a fake UUID without writing Postgres

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------

Depends on: ledger-2
Blocks: REDHAT-FIX-H3

--------------------------------------------------------------------------------
CODING STANDARDS
--------------------------------------------------------------------------------
- RULES.md
- services/platform/src/db/evidence/roles.ts
- services/platform/src/db/migrations/0004_beliefs_immutability_revise.sql
- tests/integration/service/immutability-harness.ts

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------

Implementer: mastra-implementer
Rationale: DB-enforced insert authenticity on beliefs is a pure platform/Postgres change (migration + SECURITY DEFINER seed path + PLATFORM_IT suite). mastra-implementer owns the evidence ledger substrate; mastra-reviewer validates REVOKE/DEFINER correctness and as-of non-forgeability against real Postgres.
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
Proposed by: mastra-planner (via /kb-sprint-tasks-plan --only REDHAT-FIX-H1)

</details>

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-H1",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "migrated-ledger-db": {
      "description": "Real holocron Postgres with migrations through 0005 applied, holocron_app/holocron_owner roles present, revise_belief and belief_as_of installed.",
      "seed_method": "public_api",
      "records": [
        "holo db:migrate (owner/admin DATABASE_URL)",
        "Confirm has_table_privilege(holocron_app, beliefs, UPDATE)=false (ledger-2 baseline)",
        "Confirm revise_belief prosecdef=true"
      ]
    },
    "open-belief-claim": {
      "description": "One claim with exactly one open belief (tx_to IS NULL) created via authorized seed path after 0006.",
      "seed_method": "public_api",
      "records": [
        "Call seed_open_belief / seedOpenBelief authorized path with known claim_id and statement",
        "Verify COUNT(*) FROM beliefs WHERE claim_id=X AND tx_to IS NULL = 1"
      ]
    },
    "as-of-chain-two-revisions": {
      "description": "Open belief B1 revised once to B2 via revise_belief so mid-window as-of between B1.tx_from and B2.tx_from returns B1.",
      "seed_method": "public_api",
      "records": [
        "seed_open_belief \u2192 B1",
        "revise_belief(B1, ...) \u2192 B2",
        "Capture t_mid = midpoint between B1.tx_from and B2.tx_from"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN Postgres with 0006_* insert-authenticity migration applied and holocron_app connected via toAppRoleDatabaseUrl, WHEN executing INSERT INTO beliefs with non-NULL tx_to as holocron_app, THEN statement fails (42501 and/or forbid-closed-insert) and zero forged closed rows are committed",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/immutability-insert-closed-rejected.test.ts",
      "maps_to_ac": null,
      "flow_ref": "T-PLAT-004",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres",
        "negative_control": {
          "would_fail_if": [
            "0006 migration omitted and GRANT INSERT ON beliefs TO holocron_app retained from 0004",
            "stub/mock postgres client that never executes INSERT",
            "static empty shell returning ok without DB",
            "Only TS validation rejects closed inserts while raw SQL as holocron_app still succeeds",
            "INSERT closed history succeeds RETURNING closed=t as in red-hat live probe (migration absent)"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "migrated-ledger-db",
            "action": {
              "actor": "adversary-app-role",
              "steps": [
                "Connect as holocron_app via toAppRoleDatabaseUrl",
                "SELECT current_user \u2014 expect holocron_app",
                "INSERT closed belief with tx_to set in the past",
                "Capture SQLSTATE / error message",
                "As owner, COUNT forged rows with statement/actor of the attempt"
              ]
            },
            "end_state": {
              "must_observe": [
                "session current_user: holocron_app",
                "INSERT closed history fails with SQLSTATE 42501",
                "forged committed COUNT = 0"
              ],
              "must_not_observe": [
                "INSERT success rowcount \u2265 1 for closed history as holocron_app",
                "RETURNING closed=t for app-role forged row",
                "empty SQLSTATE on failed INSERT (no error code)",
                "forged belief rows COUNT > 0"
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
      "description": "GIVEN 0006_* applied, WHEN calling seed_open_belief/seedOpenBelief as holocron_app, THEN open belief row is created (tx_to IS NULL) via SECURITY DEFINER owned by holocron_owner",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/immutability-seed-open-belief-definer.test.ts",
      "maps_to_ac": null,
      "flow_ref": "T-DATA-006",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres",
        "negative_control": {
          "would_fail_if": [
            "INSERT fully revoked without seed_open_belief definer (operability broken / omitted function)",
            "seed_open_belief is SECURITY INVOKER and still requires table INSERT for holocron_app",
            "seedOpenBelief TypeScript still does raw INSERT and fails after REVOKE without migration function",
            "stub/mock seed_open_belief returning a hardcoded UUID without DB write",
            "static empty shell returning ok without DB"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "migrated-ledger-db",
            "action": {
              "actor": "operator",
              "steps": [
                "As holocron_app, SELECT seed_open_belief(claim_id, statement, confidence, actor, ...)",
                "Query beliefs by returned id",
                "Query pg_proc for seed_open_belief prosecdef and owner"
              ]
            },
            "end_state": {
              "must_observe": [
                "beliefId matches UUID format `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`",
                "seeded row has tx_to IS NULL with open COUNT = 1",
                "seeded row has tx_from IS NOT NULL (tx_from COUNT = 1)",
                "seed_open_belief.prosecdef: true",
                "seed_open_belief owner: holocron_owner"
              ],
              "must_not_observe": [
                "beliefId empty or null",
                "seeded row has tx_to IS NOT NULL",
                "open beliefs COUNT = 0 after successful seed",
                "function missing or prosecdef: false",
                "stub returns ok:true with beliefId empty"
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
      "description": "GIVEN open belief B1 under 0006_*, WHEN revise_belief as holocron_app, THEN predecessor closed and exactly one open successor inserted",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/immutability-atomic-revision.test.ts",
      "maps_to_ac": null,
      "flow_ref": "T-DATA-006",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres",
        "negative_control": {
          "would_fail_if": [
            "REVOKE INSERT also broke revise_belief successor INSERT without owner privileges on definer",
            "EXECUTE on revise_belief revoked/omitted from holocron_app",
            "Migration dropped revise_belief while adding seed_open_belief (removed function)",
            "stub/mock revise_belief returning hardcoded successor without DB",
            "static empty shell returning ok without DB"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "open-belief-claim",
            "action": {
              "actor": "operator",
              "steps": [
                "Connect as holocron_app",
                "SELECT revise_belief(B1, 'op-h1', 'run-h1', 'key-h1', 'revised-after-insert-lock', 0.9, now(), NULL)",
                "Query predecessor and successor rows"
              ]
            },
            "end_state": {
              "must_observe": [
                "B1.tx_to IS NOT NULL (closed COUNT = 1)",
                "B2.supersedes_id equals B1.id",
                "B2.tx_to IS NULL (open successor COUNT = 1)",
                "COUNT(*) WHERE claim_id=C AND tx_to IS NULL == 1",
                "revise_belief returns B2.id UUID format `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`"
              ],
              "must_not_observe": [
                "revise_belief permission denied SQLSTATE 42501 for EXECUTE",
                "two open beliefs for claim C (COUNT = 2)",
                "B1 still open with tx_to IS NULL after successful revise",
                "open beliefs COUNT = 0 after revise",
                "successorId empty"
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
      "description": "GIVEN B1\u2192B2 revision chain, WHEN holocron_app attempts mid-window closed INSERT forgery then belief_as_of(t_mid), THEN forgery fails and as-of returns B1 not forged statement",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/immutability-asof-no-forgery.test.ts",
      "maps_to_ac": null,
      "flow_ref": "T-PLAT-004",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres",
        "negative_control": {
          "would_fail_if": [
            "App role can still INSERT closed rows (H1 unfixed / migration omitted) and belief_as_of ORDER BY tx_from DESC returns forged mid-window statement",
            "Test only asserts INSERT failure without querying belief_as_of after attempted forgery",
            "Forgery performed as table owner and treated as app-role control proof (wrong role / stub)",
            "stub/mock belief_as_of returning hardcoded B1 without DB",
            "static empty shell returning ok without DB"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "as-of-chain-two-revisions",
            "action": {
              "actor": "adversary-app-role",
              "steps": [
                "Record B1.statement and t_mid",
                "As holocron_app attempt INSERT closed belief for same claim_id with tx_from < t_mid < tx_to and statement 'FORGED-ASOF-HIJACK'",
                "SELECT * FROM belief_as_of(claim_id, t_mid)",
                "Assert statement is B1.statement"
              ]
            },
            "end_state": {
              "must_observe": [
                "forged INSERT fails with SQLSTATE 42501 for holocron_app",
                "belief_as_of(t_mid).statement equals B1.statement (not 'FORGED-ASOF-HIJACK')",
                "belief_as_of(t_mid).id equals B1.id",
                "forged statement 'FORGED-ASOF-HIJACK' committed COUNT = 0"
              ],
              "must_not_observe": [
                "belief_as_of(t_mid).statement equals 'FORGED-ASOF-HIJACK'",
                "forged INSERT success rowcount \u2265 1 as holocron_app",
                "empty belief_as_of result when real B1 covers t_mid (COUNT = 0)",
                "no belief returned with ok: false after real chain exists"
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
      "description": "GIVEN 0006_*, WHEN inspecting privileges, THEN holocron_app cannot UPDATE/DELETE beliefs, cannot complete closed-history INSERT, retains SELECT + EXECUTE on seed_open_belief and revise_belief",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/immutability-insert-closed-rejected.test.ts",
      "maps_to_ac": null,
      "flow_ref": "T-PLAT-004",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres",
        "negative_control": {
          "would_fail_if": [
            "Grants left as 0004 GRANT SELECT, INSERT without compensating BEFORE INSERT closed-row reject (migration omitted)",
            "EXECUTE grants missing/absent so product seed/revise inoperable under app role",
            "Privilege catalog still shows unrestricted INSERT of closed rows for holocron_app",
            "stub/mock privilege inventory hardcoded true without querying pg_catalog",
            "static empty shell returning ok without DB"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "migrated-ledger-db",
            "action": {
              "actor": "operator",
              "steps": [
                "SELECT has_table_privilege('holocron_app','beliefs','INSERT'|'UPDATE'|'DELETE'|'SELECT')",
                "SELECT has_function_privilege for seed_open_belief and revise_belief EXECUTE",
                "SELECT has_table_privilege('holocron_owner','beliefs','INSERT'|'UPDATE')"
              ]
            },
            "end_state": {
              "must_observe": [
                "has_table_privilege(holocron_app, beliefs, UPDATE): false",
                "has_table_privilege(holocron_app, beliefs, DELETE): false",
                "has_table_privilege(holocron_app, beliefs, SELECT): true",
                "has_function_privilege holocron_app EXECUTE revise_belief: true",
                "has_function_privilege holocron_app EXECUTE seed_open_belief: true",
                "closed-history insert path non-operable (INSERT false OR trigger deny with SQLSTATE 42501 proven in AC-1)"
              ],
              "must_not_observe": [
                "has_table_privilege(holocron_app, beliefs, UPDATE): true",
                "has_table_privilege(holocron_app, beliefs, DELETE): true",
                "closed INSERT operable for app with success rowcount \u2265 1",
                "empty privilege query result (none)"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "As holocron_app, INSERT of a beliefs row with non-NULL tx_to fails and commits zero forged rows.",
      "maps_to_ac": "AC-1",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/immutability-insert-closed-rejected.test.ts"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "seed_open_belief / seedOpenBelief as holocron_app inserts exactly one open belief (tx_to IS NULL) and returns its UUID.",
      "maps_to_ac": "AC-2",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/immutability-seed-open-belief-definer.test.ts"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "After 0006_*, revise_belief as holocron_app closes the predecessor and inserts exactly one open successor.",
      "maps_to_ac": "AC-3",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/immutability-atomic-revision.test.ts"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "belief_as_of at mid-window after a failed app-role forgery attempt returns the real predecessor statement, never FORGED-ASOF-HIJACK.",
      "maps_to_ac": "AC-4",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/immutability-asof-no-forgery.test.ts"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "Privilege inventory shows holocron_app cannot UPDATE/DELETE beliefs and cannot complete closed-history INSERT; EXECUTE remains on seed_open_belief and revise_belief.",
      "maps_to_ac": "AC-5",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/immutability-insert-closed-rejected.test.ts"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "RED evidence artifact exists showing closed INSERT as holocron_app succeeded before the fix (or the new test fails against pre-0006 schema).",
      "maps_to_ac": "AC-1",
      "verify": "ls .tmp/ledger-2/REDHAT-FIX-H1-red* .spec/evidence/redhat-fix-h1* 2>/dev/null | head -5"
    }
  ]
}
-->
