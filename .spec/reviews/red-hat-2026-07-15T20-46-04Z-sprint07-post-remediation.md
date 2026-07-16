# Red-Hat Review Report

**Report Date**: 2026-07-15T20:46:04Z  
**Target**: Sprint 7 — Evidence-Graph Substrate and Ledger Immutability (`sprint-07-evidence-graph-substrate-and-ledger-immutability`)  
**Artifact Path**: `.spec/prds/mk6-migration/tasks/sprint-07-evidence-graph-substrate-and-ledger-immutability/`  
**Branch / HEAD reviewed**: `main` @ `b4ac1603fbe17673afbc442ae034a86d449b9c0f`  
**Reviewed By**: `mastra-reviewer`, `security-reviewer`, `code-reviewer` (+ orchestrator gate pre-check + live re-probe)  
**Product code modified**: **None** (report-only)  
**Prior review**: `.spec/reviews/red-hat-2026-07-15T20-00-07Z-sprint07.md` (SEVERITY GATE **FAIL**, 3 HIGH open)  
**This review**: fresh post-remediation re-verification after REDHAT-FIX-H1/H2/H3

---

## Explicit Severity Verdict

| Field | Value |
|-------|-------|
| **SEVERITY GATE** | **PASS** |
| **CRITICAL** | **0** |
| **HIGH (open)** | **0** |
| **MEDIUM (open)** | **7** |
| **LOW (open)** | **5** |
| **Ship-as-complete** | **YES** — beliefs ledger immutability + H1/H2/H3 remediation claims hold under live adversarial probe |
| **Mechanism quality** | **Real** (not stub theatre): REVOKE INSERT/UPDATE/DELETE for `holocron_app`, `SECURITY DEFINER` `seed_open_belief` + `revise_belief`, product pool bind to app role, as-of / net-support SQL, CLI wiring, PLATFORM_IT + 7/7 gate |
| **Control effectiveness** | **Complete for product path** — app role cannot forge closed history, cannot UPDATE/DELETE beliefs, product seed→belief continuous without gate scaffold; residual risks are owner/admin surface, non-belief graph mutability, and test/gate hygiene |

**Verdict one-liner:** Prior HIGH findings (H1 closed-history INSERT, H2 owner-pool product bypass, H3 seed→belief scaffold) are **closed and re-verified live**. Ship-as-complete for Sprint 07 beliefs immutability; residual MEDIUM items are hardening / edge-corpus integrity / test quality, not ship blockers under AP-7.

---

## Executive Summary

Three independent adversarial reviewers plus orchestrator live re-probes on this host converge: Sprint 07 post-remediation delivers a **product-true, DB-enforced** immutable beliefs ledger. Migrations `0003`–`0007` install one-open uniqueness, REVOKE + DEFINER revision, as-of/net-support SQL, insert authenticity (no app INSERT on `beliefs`), and seed-table operability grants. All evidence product helpers bind via `resolveProductDatabaseUrl` → `holocron_app`. Live `evidence:seed` returns an open `beliefId` with actor `evidence:seed` and `sessionRole: holocron_app`; immediate `evidence:belief --as-of now` succeeds without any gate-setup insert. Closed-history INSERT and raw open INSERT as `holocron_app` both fail with permission denied (`42501`).

The prior red-hat (20:00Z) severity gate **FAIL** with **3 HIGH** is **superseded**. This fresh review finds **0 CRITICAL / 0 HIGH**. Residual MEDIUM risks remain (relations net-support forgeability, owner-admin history rewrite, silent as-of fallback, sequential concurrent IT, HT-5 sequential fallback, HT-7 document_id prep opacity, generic `createSql` owner default) — track as hardening for Sprints 14/17/23 consumers, not blockers for this sprint’s stated ACs.

**Severity gate: PASS** — ship-as-complete **YES**.

---

## Gate Pre-Check (skill-emitted, deterministic)

| Check | Result | Evidence |
|-------|--------|----------|
| Human Testing Gate present | Yes | `SPRINT.md` § Human Test Deliverable / Human Testing Gate |
| Step entry points executable as documented | **PASS** | All steps resolve via `bun services/platform/src/cli/holo.ts` (`evidence:seed`, `evidence:belief`, `db:probe --raw`, `evidence:revise`, `evidence:register-doc`); cases in `services/platform/src/cli/holo.ts` (~1005–1155, ~571+) |
| Migrations present | **PASS** | `0003_evidence_one_open_belief.sql` … `0007_app_role_seed_operability_grants.sql` |
| Sprint claims complete | **Yes** | `sprint-goal-state.json` → `goal.met: true`; tasks 8/8 completed; gate/e2e/build PASS; REDHAT-FIX-H1/H2/H3 completed |
| `gate-results.json` | **PASS** | `verdict: "pass"`, `steps_executed == steps_total == 7`, run_id `2026-07-15T20:38:16Z`, `main_sha` = HEAD `b4ac160…`, `post_redhat_remediation: true`, `scaffold_free_ht1_ht2: true` |
| Freshness vs task files | **PASS** | Gate mtime `14:38:48` after newest REDHAT-FIX-*.md `14:36:31` |
| `gate-verification.json` | **PASS** | `verified: true`, `discrepancies: []`, recomputed verdict pass |
| Auto-findings (wiring gap / missing gate) | **None** | Deterministic pre-check does not emit HIGH for missing entry points or absent/stale gate |

---

## Live re-probe (this run)

```text
$ git rev-parse HEAD
  b4ac1603fbe17673afbc442ae034a86d449b9c0f

$ has_table_privilege(holocron_app, beliefs, SELECT|INSERT|UPDATE|DELETE)
  t | f | f | f

$ SET ROLE holocron_app; INSERT closed history (tx_to set)
  → ERROR: permission denied for table beliefs

$ SET ROLE holocron_app; raw INSERT open belief
  → ERROR: permission denied for table beliefs

$ SET ROLE holocron_app; SELECT seed_open_belief(...)
  → UUID returned; tx_to NULL; actor=probe

$ bun … holo.ts evidence:seed --json
  → ok:true, beliefId=<uuid>, sessionRole=holocron_app, actor=evidence:seed

$ bun … holo.ts evidence:belief --claim-id <seed-claim> --as-of now --json
  → ok:true, same beliefId, netSupport=-1, actor=evidence:seed  (scaffold-free HT-1→HT-2)

$ gate post-redhat steps 1–7 under /tmp/...-post-redhat/
  → all pass; step1 beliefId present; step3 42501; step5 concurrent_exits=1,0 open_count=1
```

---

## Prior HIGH findings — closure status

| ID | Prior finding | Status | Live evidence |
|----|---------------|--------|---------------|
| **H1** | App can INSERT closed historical beliefs (as-of forgery) | **CLOSED** | `0006` REVOKE INSERT; closed INSERT as `holocron_app` → `42501`; `seed_open_belief` forces `tx_to=NULL` |
| **H2** | Default runtime/owner pool bypasses REVOKE | **CLOSED (product path)** | All evidence helpers use `resolveProductDatabaseUrl`; gate/CLI `sessionRole: holocron_app`; product UPDATE/DELETE → `42501` |
| **H3** | HT-1→HT-2 broken without gate-setup scaffold | **CLOSED** | Product seed returns open `beliefId` actor `evidence:seed`; continuous belief as-of; gate-plan has no intermediate insert |

---

## HIGH Confidence Findings (3+ Agents Agree)

Severity gate: only **CRITICAL/HIGH** block ship. All three panel agents agree:

- [x] **Prior H1 CLOSED** | Severity was HIGH → **closed**  
      Agents: mastra-reviewer, security-reviewer, code-reviewer  
      Evidence: `0006_beliefs_insert_authenticity.sql:10-14`; live closed INSERT denied; IT `immutability-insert-closed-rejected.test.ts`

- [x] **Prior H2 CLOSED (product evidence path)** | Severity was HIGH → **closed**  
      Agents: mastra-reviewer, security-reviewer, code-reviewer  
      Evidence: `roles.ts:43-46`; seed/revise/belief-asof/register-doc/probe-raw bind; live `sessionRole: holocron_app`

- [x] **Prior H3 CLOSED** | Severity was HIGH → **closed**  
      Agents: mastra-reviewer, security-reviewer, code-reviewer  
      Evidence: `seed.ts:203-232` `seed_open_belief`; gate step1/2 + live continuous seed→belief

- [ ] **No open CRITICAL or HIGH findings** | Severity gate: **PASS**  
      Agents: all three  
      Ship-as-complete: **YES** for stated Sprint 07 + remediation ACs

---

## MEDIUM Confidence Findings (2+ Agents Agree)

- [ ] **M1 — Relations INSERT lets app forge net-support** | Severity: **MEDIUM**  
      Agents: mastra-reviewer, security-reviewer, code-reviewer  
      Evidence: `0007_app_role_seed_operability_grants.sql:19` GRANT INSERT on `relations`; live app INSERT supports edge flips netSupport. Beliefs DML immutable; edge ledger is not.  
      Fix (non-blocking): DEFINER-only relation writes or restricted edge admission if net-support is trusted input for Sprint 17/23.

- [ ] **M2 — Owner/admin can still rewrite or forge closed history** | Severity: **MEDIUM** (by design under AP-7)  
      Agents: mastra-reviewer, security-reviewer, code-reviewer  
      Evidence: table owner/superuser retains INSERT/UPDATE/DELETE; live owner closed INSERT / in-place UPDATE of history still possible. Product path is app-bound; admin surface is absolute.  
      Fix (optional hardening): BEFORE UPDATE trigger allowing only `tx_to` open→closed close, or require DEFINER session GUC.

- [ ] **M3 — Silent catch-all fallback in as-of / net-support** | Severity: **MEDIUM**  
      Agents: mastra-reviewer, security-reviewer, code-reviewer  
      Evidence: `belief-asof.ts:125-169`, `266-287` catch **any** error → inline SQL; masks privilege/migration drift (only surfaces `belief_as_of(inline)`).  
      Fix: catch only missing-function SQLSTATE; log/warn on fallback.

- [ ] **M4 — Named concurrent IT is sequential + often owner-bound** | Severity: **MEDIUM**  
      Agents: mastra-reviewer, code-reviewer (+ security notes gate honesty)  
      Evidence: `immutability-concurrent-reject.test.ts:42-60` awaits T1 then T2; may pass `DEFAULT_DATABASE_URL` (owner). True race proven by gate step5 (`concurrent_exits=1,0`).  
      Fix: parallel revise under `resolveProductDatabaseUrl`; rename/clarify stale-only IT.

- [ ] **M5 — HT-5 gate script has sequential fallback** | Severity: **MEDIUM**  
      Agents: mastra-reviewer, code-reviewer  
      Evidence: `step5-concurrent-revise.sh` falls back to sequential revise if concurrent pair fails; this run used concurrent path. Soft assertion risk on flaky machines.  
      Fix: fail-hard unless concurrent-only path succeeds.

- [ ] **M6 — Generic `createSql()` / non-evidence platform defaults remain owner** | Severity: **MEDIUM**  
      Agents: mastra-reviewer, security-reviewer, code-reviewer  
      Evidence: `client.ts:12-14` defaults to `resolveDatabaseUrl` (raw); `probe.ts` / `verify.ts` / `withDb` not rewritten. H2 closed evidence helpers only.  
      Fix: product factory `createProductSql()`; document override as break-glass.

- [ ] **M7 — HT-7 continuous human path / document_id prep opacity** | Severity: **MEDIUM** (mastra elevates; code/security pass product code)  
      Agents: mastra-reviewer (HIGH-adjacent continuity), code-reviewer (product PASS), security-reviewer (operability PASS)  
      Evidence: `register-doc` requires pre-bound `document_id` on passages; seed does not stamp it; gate uses pre-bound `DOC_ID`. Product implementation is real; operator story is not seed-only continuous.  
      Fix: document prep step or productize document_id stamping in seed/register flow.

---

## LOW Confidence Findings (Single Agent / residual)

- [ ] **L1 — Free-form `actor`/`run_id` spoofable by app role** | Severity: LOW  
      Agent: security-reviewer  
      Any principal with `holocron_app` can revise with arbitrary actor attribution (authorized append, not rewrite).

- [ ] **L2 — Idempotency key global uniqueness UX** | Severity: LOW  
      Agents: mastra (M8), security (L2)  
      Same key across different predecessors returns existing successor id without error; unique index still prevents double-insert.

- [ ] **L3 — `seed_open_belief` does not FK-check claim_id** | Severity: LOW  
      Agent: security-reviewer  
      Orphan open beliefs possible for arbitrary claim_id strings.

- [ ] **L4 — Weak gate regex assertions** | Severity: LOW  
      Agents: mastra, code  
      e.g. step6 `beliefId|Quarterly revenue` OR-loose; live payloads still correct.

- [ ] **L5 — Drizzle schema drift / entities grants** | Severity: LOW  
      Agent: mastra-reviewer  
      `evidence.ts` type notes vs DB uuid; `entities` unusable under app (may be out of sprint scope).

---

## Agent Contradictions & Debates

| Topic | Agent A | Agent B | Assessment |
|-------|---------|---------|------------|
| HT-7 continuity | mastra: PARTIAL (scaffold opacity MEDIUM) | code + security: product PASS | **Resolve as M7 MEDIUM process/UX** — product code real; documented human continuous path incomplete without prep |
| Owner history forgery severity | All note residual | security: MEDIUM under AP-7 not HIGH | **Agree MEDIUM** — product path closed; admin surface intentional |
| Ship-as-complete | All three YES | — | **Consensus YES** |
| Concurrent safety | code: HIGH (SQL) / MED (IT) | mastra: gate true-parallel | **Agree** — SQL + gate hold; named IT residual |

---

## Recommendations by Category

1. **Gaps (non-blocking)**: Document HT-7 `document_id` prep or productize stamping; align concurrent IT with product role + true parallelism.
2. **Risks (hardening backlog)**: Restrict relations INSERT if net-support becomes a trust input; optional owner UPDATE trigger for closed-row rewrite defense-in-depth; product-default SQL factory.
3. **Assumptions**: AP-7 single-user tailnet remains the trust boundary — owner forgery is admin risk, not multi-tenant isolation failure. Loopback trust auth enables `holocron_app` username rewrite without password.
4. **Contradictions**: Prior goal-state “0 HIGH / APPROVED” after first closeout was wrong; post-H1/H2/H3 state now matches reality. 0004 comments about app INSERT are superseded by 0006.

---

## Agent Reports (Summary)

| Agent | Key findings | Severity counts | Ship? |
|-------|--------------|-----------------|-------|
| **mastra-reviewer** | H1–H3 hold live; 8 MEDIUM residual (net-support, owner forge, createSql, HT-7, catch-all, corpus UPDATE, entities, idempotency UX) | C0 / H0 / M8 / L4 | YES (with residual MEDIUM) |
| **security-reviewer** | Attack surfaces blocked for app; DEFINER posture acceptable; 5 MEDIUM admin/footgun/edge risks | C0 / H0 / M5 / L4 | YES |
| **code-reviewer** | No product stubs; test/gate hygiene MEDIUM; migrations 0003–0007 complete | C0 / H0 / M4 / L3 | YES (APPROVED) |
| **gate-pre-check** | Wiring PASS; complete claim + fresh 7/7 gate PASS | Auto-HIGH: 0 | n/a |

---

## AC Snapshot (sprint-level)

| AC theme | Verdict |
|----------|---------|
| UC-DATA-02 seed + contradicting passages | **PASS** |
| UC-DATA-02 as-of belief | **PASS** |
| UC-DATA-02 authorized revise only | **PASS** |
| UC-DATA-02 register-doc no-dup corpus | **PASS** (product); HT continuous path **PARTIAL** (M7) |
| UC-DATA-02 net-support validity windows | **PASS** (computation); integrity under app edge INSERT **PARTIAL** (M1) |
| Immutability REVOKE UPDATE/DELETE | **PASS** |
| Atomic supersession + stale reject | **PASS** (SQL + gate concurrent) |
| As-of audit chain | **PASS** |
| H1 insert authenticity | **PASS** |
| H2 product role bind | **PASS** |
| H3 seed→belief product path | **PASS** |

---

## Metadata

- **Agents**: `mastra-reviewer` (backend/Postgres/Mastra), `security-reviewer` (privilege/DEFINER/bypass), `code-reviewer` (stubs/wiring/tests)
- **Confidence Framework**: HIGH (3+ agents), MEDIUM (2 agents), LOW (1 agent)
- **Report Generated**: 2026-07-15T20:46:04Z
- **Duration**: ~6m (parallel panel + live probes)
- **Gate evidence**: `/tmp/holocron-gate-sprint-07-evidence-graph-substrate-and-ledger-immutability-post-redhat/`
- **Prior FAIL report**: `.spec/reviews/red-hat-2026-07-15T20-00-07Z-sprint07.md`
- **Next Steps**:
  1. Accept ship-as-complete for Sprint 07 beliefs immutability + H1/H2/H3
  2. Optionally file hardening backlog for M1–M7 (non-blocking)
  3. Do **not** re-open H1/H2/H3 without new live counter-evidence

---

## Final Severity Gate

```
SEVERITY GATE: PASS
CRITICAL: 0
HIGH:     0
MEDIUM:   7
LOW:      5
SHIP-AS-COMPLETE: YES
```
