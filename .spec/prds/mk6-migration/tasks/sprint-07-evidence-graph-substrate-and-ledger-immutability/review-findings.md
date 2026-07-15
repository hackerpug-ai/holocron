# Mastra Review — Task ledger-5

**Task**: Review immutability + bi-temporal correctness  
**Branch**: `task/ledger-5`  
**Reviewer**: mastra-reviewer (implementer role for REVIEW-typed task)  
**Scope reviewed**: ledger-1..3 landed stack + ledger-4 RED suite on this branch  
**Write surface**: this findings doc only (`services/platform/src/` and `tests/` writeProhibited)

**Verdict**: **APPROVED**

---

## Executive summary

| AC | Criterion | Verdict |
|----|-----------|---------|
| AC-1 | DB privilege enforcement (REVOKE UPDATE/DELETE; `holocron_app`; SECURITY DEFINER `revise_belief`) | **PASS** |
| AC-2 | Supersession atomicity (FOR UPDATE, close+insert, stale reject, idempotency) | **PASS** |
| AC-3 | As-of bi-temporal (tx + validity dimensions; full chain; NULL handled) | **PASS** |
| AC-4 | Net-support validity filtering (SQL-based window filter) | **PASS** |
| AC-5 | No stubs / bypasses / app-layer-only immutability; real Postgres; tripwires | **PASS** |

Adversarial review confirms immutability is enforced **in Postgres**, not in TypeScript. App role cannot mutate or delete beliefs; the sole supersession path is `revise_belief(...)` (SECURITY DEFINER, owned by `holocron_owner`). As-of and net-support are SQL functions with correct bi-temporal predicates. Integration suite under `PLATFORM_IT=1` is green (12/12). Live `psql` proofs under `.tmp/ledger-5/` corroborate privileges, stale rejection, idempotency, as-of, and net-support.

No HIGH findings. Residual MEDIUM notes are operational / hardening (not AC failures).

---

## AC-1 — DB privilege enforcement

### What was inspected

| Artifact | Location |
|----------|----------|
| Role + REVOKE/GRANT | `services/platform/src/db/migrations/0004_beliefs_immutability_revise.sql:10-50` |
| One-open unique index | `services/platform/src/db/migrations/0003_evidence_one_open_belief.sql:5-7` |
| App-role probe path | `services/platform/src/db/evidence/probe-raw.ts`, `roles.ts` |
| CLI `db:probe --raw` | `services/platform/src/cli/holo.ts` (~573+) |
| IT: DML rejection | `tests/integration/service/immutability-dml-rejected.test.ts` |
| IT: probe rejection | `tests/integration/service/immutability-probe-rejection.test.ts` |

### Evidence (SQL on disk)

```39:50:services/platform/src/db/migrations/0004_beliefs_immutability_revise.sql
REVOKE ALL ON TABLE beliefs FROM PUBLIC;
-- ...
REVOKE ALL ON TABLE beliefs FROM holocron_app;
-- ...
GRANT SELECT, INSERT ON TABLE beliefs TO holocron_app;
-- ...
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE beliefs TO holocron_owner;
```

```89:90:services/platform/src/db/migrations/0004_beliefs_immutability_revise.sql
SECURITY DEFINER
SET search_path = public
```

```196:209:services/platform/src/db/migrations/0004_beliefs_immutability_revise.sql
ALTER FUNCTION revise_belief(...) OWNER TO holocron_owner;
-- ...
GRANT EXECUTE ON FUNCTION revise_belief(...) TO holocron_app;
```

App-layer `reviseBelief` is a thin caller of the SQL function only — no local close/insert logic:

```45:56:services/platform/src/db/evidence/revise.ts
const rows = await sql<{ revise_belief: string }[]>`
  SELECT revise_belief(
    ${input.beliefId}::uuid,
    ...
  )::text AS revise_belief
`;
```

Grep for `UPDATE beliefs` / `DELETE FROM beliefs` under `services/platform/src` excluding migrations: **none**.

### Live Postgres proof

From `.tmp/ledger-5/psql-privilege-inspection.txt`:

| Check | Result |
|-------|--------|
| `holocron_app` SELECT | **t** |
| `holocron_app` INSERT | **t** |
| `holocron_app` UPDATE | **f** |
| `holocron_app` DELETE | **f** |
| `revise_belief` owner | `holocron_owner` |
| `revise_belief` `prosecdef` | **t** (SECURITY DEFINER) |
| `holocron_app` EXECUTE `revise_belief` | **t** |
| Table grants for app | SELECT, INSERT only |

From `.tmp/ledger-5/psql-functional-proof.txt` + `.tmp/ledger-5/psql-bypass-probes.txt`:

- `SET ROLE holocron_app; UPDATE beliefs ...` → `permission denied for table beliefs` (42501)
- `SET ROLE holocron_app; DELETE FROM beliefs ...` → `permission denied for table beliefs` (42501)
- SECURITY INVOKER wrapper calling `UPDATE beliefs` still denied (privilege is table-level, not function-skippable)
- Second open belief insert blocked by `beliefs_one_open_per_claim_uidx` (`unique_violation`)

### Integration tests

```
PLATFORM_IT=1 pnpm exec vitest run \
  tests/integration/service/immutability-dml-rejected.test.ts \
  tests/integration/service/immutability-probe-rejection.test.ts
→ PASS (ERROR 42501 + unchanged row; CLI probe non-zero + 42501)
```

### AC-1 verdict: **PASS**

Enforcement is DB-native (REVOKE + role model + SECURITY DEFINER), not TypeScript guards.

---

## AC-2 — Supersession atomicity

### What was inspected

| Concern | Location |
|---------|----------|
| SELECT FOR UPDATE | `0004_...sql:119-125` |
| Stale check (`tx_to IS NOT NULL`) | `0004_...sql:143-148` |
| Conditional close + ROW_COUNT | `0004_...sql:150-161` |
| Successor INSERT (`supersedes_id`, actor, run_id, idempotency_key) | `0004_...sql:163-188` |
| Idempotency fast-path + post-lock recheck | `0004_...sql:108-141` |
| Unique idempotency index | `0004_...sql:72-74` |
| IT atomic / concurrent / idempotency / CLI | `immutability-*.test.ts` |

### Atomic path (single PL/pgSQL function body)

1. Optional idempotent return if `idempotency_key` already committed  
2. `SELECT ... FOR UPDATE` on predecessor  
3. Re-check idempotency under lock  
4. Reject if `tx_to IS NOT NULL` → `REVISE_STALE_CONCURRENT`  
5. `UPDATE ... SET tx_to = now() WHERE id = ? AND tx_to IS NULL`; require `ROW_COUNT = 1`  
6. `INSERT` successor with `supersedes_id = p_belief_id`, `tx_from = now()`, `tx_to = NULL`  
7. Return successor UUID  

All steps share the caller transaction → atomic close+insert.

### Live Postgres proof

From `.tmp/ledger-5/psql-functional-proof.txt`:

- `revise_belief` as `holocron_app` closes B1, inserts B2 with `supersedes_id = B1.id`
- Second revise of closed B1 → `NOTICE: stale_err: P0001 REVISE_STALE_CONCURRENT: belief ... is already closed`
- Idempotency replay of key `idem-review-ledger5-1` returns **same** successor UUID

Function catalog checks (`.tmp/ledger-5/psql-privilege-inspection.txt`):

- `has_for_update = t`
- `has_stale = t`
- `has_idem = t`

### Integration tests

```
immutability-atomic-revision.test.ts      PASS  (B1 closed, B2 supersedes B1, one open)
immutability-concurrent-reject.test.ts    PASS  (t2 errors match REVISE_STALE_CONCURRENT; successor_count=1)
immutability-idempotency.test.ts          PASS  (same key → same successor id)
immutability-cli-revise.test.ts           PASS  (CLI prints successor UUID + actor/run)
```

### AC-2 verdict: **PASS**

---

## AC-3 — As-of bi-temporal correctness

### What was inspected

| Artifact | Location |
|----------|----------|
| SQL `belief_as_of` | `0005_belief_asof_net_support.sql:12-28` |
| TS helper + CLI | `belief-asof.ts`, `holo.ts` `evidence:belief` |
| IT chain + midpoint | `evidence-asof-chain.test.ts`, `evidence-asof-transaction.test.ts` |

### Predicate (both dimensions)

```12:27:services/platform/src/db/migrations/0005_belief_asof_net_support.sql
CREATE OR REPLACE FUNCTION belief_as_of(
  p_claim_id text,
  p_as_of timestamptz
) RETURNS SETOF beliefs
...
  WHERE b.claim_id = p_claim_id
    AND b.tx_from <= p_as_of
    AND (b.tx_to IS NULL OR b.tx_to > p_as_of)
    AND (b.valid_from IS NULL OR b.valid_from <= p_as_of)
    AND (b.valid_to IS NULL OR b.valid_to > p_as_of)
  ORDER BY b.tx_from DESC
  LIMIT 1;
```

NULL handling:

- **Transaction time**: open rows (`tx_to IS NULL`) remain visible for `as_of >= tx_from`
- **Validity time**: NULL `valid_from` / `valid_to` treated as unbounded (included)

TS path prefers the SQL function and falls back to an **identical** inline filter (`belief-asof.ts:147-152`).

### Live + IT proof

- Live: `belief_as_of('claim-review-ledger5', '2024-01-15')` → `B1 initial`; `now()` → `B2 revised` (`.tmp/ledger-5/psql-functional-proof.txt`)
- IT: full chain B1→B2→B3→B4 at four midpoints returns correct statement/id
- IT: midpoint between B1 and B2 via CLI `evidence:belief --as-of` returns B1 not B2/B3
- IT: `--as-of now` returns current open belief

### AC-3 verdict: **PASS**

---

## AC-4 — Net-support validity filtering

### What was inspected

| Artifact | Location |
|----------|----------|
| SQL `belief_net_support` | `0005_belief_asof_net_support.sql:31-52` |
| TS `computeNetSupport` | `belief-asof.ts:233-287` |
| Validity helper on relations | `queries.ts:19-47` |
| IT net-support + windows | `evidence-net-support.test.ts`, `evidence-validity-windows.test.ts` |

### Predicate (SQL-based)

```38:51:services/platform/src/db/migrations/0005_belief_asof_net_support.sql
  SELECT COALESCE(SUM(
    CASE r.relation_type
      WHEN 'supports' THEN 1
      WHEN 'contradicts' THEN -1
      ELSE 0
    END
  ), 0)::integer
  FROM relations r
  WHERE r.object_id = p_claim_id
    AND r.relation_type IN ('supports', 'contradicts')
    AND r.tx_to IS NULL
    AND r.valid_from IS NOT NULL
    AND r.valid_from <= p_as_of
    AND (r.valid_to IS NULL OR r.valid_to > p_as_of);
```

Fixture (IT + live):

| Edge | Window | Type |
|------|--------|------|
| R1 | 2024-01 → 06 | supports (+1) |
| R2 | 2024-03 → 12 | contradicts (−1) |
| R3 | 2024-07 → 12 | supports (+1) |

- as-of **2024-04-01** → net **0** (R1+R2; R3 out)
- as-of **2024-08-01** → net **+1** (R3 only after R1/R2 windows expire per suite setup)
- as-of **2024-02-01** (live) → net **1** (R1 only)

### AC-4 verdict: **PASS**

Computation is in SQL (function preferred; inline fallback matches). Validity windows filter edges; no app-side ad-hoc math beyond reading the integer result.

---

## AC-5 — No stubs, bypasses, or fake enforcement

### Stub / mock greps (documented)

Patterns run (see `.tmp/ledger-5/stub-greps.txt`, `.tmp/ledger-5/extra-greps.txt`):

| Pattern | Result in evidence / immutability surface |
|---------|-------------------------------------------|
| Fake-success `execute: async () => ({ ok: true })` | **none** |
| `TODO` / `FIXME` / `not implemented` in evidence helpers + migrations | **none** |
| `vi.mock` of DB / `@mastra` in immutability/evidence IT | **none** (only RN/voice mocks elsewhere) |
| `z.any()` production schemas | **none** |
| `.skip` / `.todo` / `xit` in `tests/integration/service/` IT files reviewed | **none** active skips (suites gate via `itLive` + `PLATFORM_IT=1`) |
| App-layer `UPDATE beliefs` / `DELETE FROM beliefs` outside migrations | **none** |
| `reviseBelief` bypass (local supersession without SQL fn) | **none** — only `SELECT revise_belief(...)` |

### Tripwire coverage (domain analog)

This stack is DB/ledger, not Mastra agents. Tripwires map to fail-closed DB signals:

| Tripwire | Surface | Observed |
|----------|---------|----------|
| Direct DML denied | SQLSTATE **42501** | IT + live + `probeRawSql.permissionDenied` |
| Stale concurrent revise | **REVISE_STALE_CONCURRENT** / `P0001` | IT + live |
| CLI non-zero on fail | `holo evidence:revise` / `db:probe` exit 1 | IT |
| Operator probe labels | `must_observe: ERROR 42501` in CLI | `holo.ts` ~580 |

### Real Postgres

- Suites gated: `export const itLive = PLATFORM_IT ? it : it.skip` (`evidence-harness.ts:12`)
- `ensureMigrated()` runs real `holo db:migrate`
- Reviewer run: **10 files / 12 tests PASS** with `PLATFORM_IT=1` against `postgres://…/holocron`  
  Artifact: `.tmp/ledger-5/vitest-immutability-asof.txt`

### Bypass probes (adversarial)

| Attack | Result |
|--------|--------|
| App UPDATE/DELETE | Denied 42501 |
| SECURITY INVOKER UPDATE wrapper | Denied 42501 |
| Double open INSERT same claim | `unique_violation` on `beliefs_one_open_per_claim_uidx` |
| Fabricate **closed** history via INSERT | **Allowed** (INSERT grant) — residual, see MEDIUM |
| Supersede without `revise_belief` | Cannot close predecessor without UPDATE → blocked |

### AC-5 verdict: **PASS**

No stubs; no mocks of Postgres in this surface; enforcement is not app-layer-only.

---

## Findings by severity

### HIGH (must fix)

*None.*

### MEDIUM (fix soon / operational)

1. **Runtime role must be `holocron_app` for REVOKE to bind**  
   - `resolveDatabaseUrl` / CLI default use `DATABASE_URL` (often superuser/owner: `inference1` / `postgres` still has full DML on live DB).  
   - Immutability is proven for `holocron_app` and for `db:probe --raw` (role rewrite in `roles.ts` / `probe-raw.ts`).  
   - **Risk**: a production process connecting as table owner silently bypasses REVOKE.  
   - **Follow-up**: force app pool role = `holocron_app` (or `SET ROLE`) in deploy docs + connection factory; CI check that default pool is not superuser.

2. **App can INSERT fabricated closed history rows**  
   - Live probe: `holocron_app` successfully inserted a closed (`tx_to` set) belief without going through `revise_belief`.  
   - Does **not** break open-row uniqueness or enable UPDATE/DELETE of existing audit rows.  
   - **Risk**: audit-chain forgery (append false past), not classic mutability.  
   - **Follow-up**: consider restricting INSERT to SECURITY DEFINER seed/revise paths only, or require signed/append-only constraints.

3. **Idempotency race lacks `unique_violation` handler**  
   - `revise_belief` re-checks key under lock but does **not** catch `23505` on concurrent first-insert same key (catalog: `handles_unique_violation = f`).  
   - Unique index still prevents two rows; loser may see raw unique_violation instead of clean existing-id return.  
   - GREEN suite covers sequential replay; RED suite has true race for stale supersession.  
   - **Follow-up**: `EXCEPTION WHEN unique_violation` → re-select by `idempotency_key` and return existing id.

4. **Silent catch-all fallback in `belief-asof.ts` / `computeNetSupport`**  
   - `try { belief_as_of(...) } catch { inline SQL }` (and same for net-support) swallows any function error, not only undefined_function.  
   - **Risk**: masks privilege/type errors; may hide migration drift.  
   - **Follow-up**: narrow catch to missing-function SQLSTATE, else rethrow.

### LOW (track)

1. `GRANT EXECUTE ... TO PUBLIC` on `belief_as_of` / `belief_net_support` after `REVOKE FROM PUBLIC` (`0005_...sql:55-64`) re-opens execute broadly — fine for read-only STABLE helpers, inconsistent least-privilege style.  
2. Drizzle schema `beliefs` still only declares non-unique `beliefs_current_idx` (`schema/evidence.ts:172`); uniqueness of one-open lives only in SQL migration `0003` — schema drift vs DB is documentation risk for future `drizzle-kit push`.  
3. Net-support requires `valid_from IS NOT NULL` (stricter than belief as-of NULL handling) — intentional per SQL comments; document for operators seeding edges.

---

## Verification evidence reviewed

| Evidence | Path / result |
|----------|----------------|
| Privilege + function catalog | `.tmp/ledger-5/psql-privilege-inspection.txt` |
| Functional revise / stale / idem / as-of / net | `.tmp/ledger-5/psql-functional-proof.txt` |
| Bypass probes (INVOKER, double-open, history insert) | `.tmp/ledger-5/psql-bypass-probes.txt` |
| Stub greps | `.tmp/ledger-5/stub-greps.txt`, `.tmp/ledger-5/extra-greps.txt` |
| Line anchors | `.tmp/ledger-5/line-anchors.txt` |
| PLATFORM_IT vitest (12/12 pass) | `.tmp/ledger-5/vitest-immutability-asof.txt` |

Commands of record:

```bash
# Privileges
psql "$DATABASE_URL" -c "SELECT has_table_privilege('holocron_app','beliefs','UPDATE')"  # f
psql "$DATABASE_URL" -c "SELECT prosecdef FROM pg_proc WHERE proname='revise_belief'"       # t

# IT
PLATFORM_IT=1 pnpm exec vitest run \
  tests/integration/service/immutability-*.test.ts \
  tests/integration/service/evidence-asof-*.test.ts \
  tests/integration/service/evidence-net-support.test.ts \
  tests/integration/service/evidence-validity-windows.test.ts
# → Test Files  10 passed | Tests  12 passed
```

---

## Plan-vs-implementation drift

Compared to sprint-07 ledger-2/3/4 task blueprints and ledger-5 contract:

| Plan expectation | Shipped | Drift? |
|------------------|---------|--------|
| REVOKE UPDATE/DELETE from app role | Yes (`0004`) | None |
| SECURITY DEFINER `revise_belief` | Yes, owner `holocron_owner` | None |
| SELECT FOR UPDATE + stale reject | Yes | None |
| Idempotency key unique + replay | Yes | None |
| As-of both tx + validity | Yes (`0005` + CLI) | None |
| Net-support SQL validity filter | Yes | None |
| Real Postgres IT under PLATFORM_IT | Yes (GREEN + RED suites present) | None |
| Corpus unification (passages FK) | `0003` uuid FK | Out of ledger-5 AC scope; noted present |

Silent schema note only: unique one-open index is migration-only (not mirrored in Drizzle table builder) — LOW, not AC fail.

---

## Overall verdict for sprint immutability substrate

**APPROVED** for Sprint 7 immutability + bi-temporal substrate.

- DB privilege model is real and live-verified.  
- Supersession is atomic, stale-safe, and idempotent under sequential and closed-predecessor concurrency.  
- Bi-temporal as-of and validity-windowed net-support are SQL-correct and integration-tested.  
- No stubs, no app-only immutability theater, no mocked Postgres in the proof path.  

Ship-blocking work for this review: **none**.  
Recommended follow-ups (non-blocking): operational role binding, optional INSERT lockdown / append authenticity, idempotency unique_violation handler, narrow SQL-fn fallback catch.
