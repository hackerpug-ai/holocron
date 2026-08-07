# REDHAT-FIX-RH-S30-13 — Close or audit owner-DDL trigger-disable escape for PONR immutability

> **Task ID:** REDHAT-FIX-RH-S30-13
> **Sprint:** [Sprint 30](./SPRINT.md)
> **Agent:** `devops-engineer`
> **Priority:** P0
> **Type:** FIX
> **Severity:** HIGH
> **Source finding:** H-3 (independent remediation red-hat)
> **Source:** `.spec/reviews/red-hat-sprint-30-20260807T085706Z-independent-remediation.md` (independent red-hat @ 2ff0e6c4)
> Status: Implemented on main (awaiting independent dual-lens + fresh QA — not release-approved)

## Finding

**H-3 — PONR immutability does not withstand the owner-DDL trigger-disable escape that the test harness itself uses.** Confidence: MEDIUM (release claim impact HIGH).

Normal app-role DML and bare owner TRUNCATE are defended by grants/triggers (`0030_data_plane_ponr.sql`, `0031_data_plane_ponr_truncate_guard.sql`). The owner/test connection can still `ALTER TABLE … DISABLE TRIGGER`, TRUNCATE, and re-enable (`sprint30-cutover-harness.ts`); migration 0031 documents this. D07-05 requires determining whether that escape is reachable/auditable under the real operator role model; the supplied gate has no role-provenance probe. Narrow RH-S30-01 ACs pass; the broader "DB-immutable" release claim remains unproved.

## Scope (WRITE-ALLOWED)

- Migrations / role grants for `data_plane_ponr` if app/operator roles can be tightened further
- Optional event-trigger / audit logging for `DISABLE TRIGGER` / TRUNCATE on PONR if retained as superuser-only
- Harness: ensure production role probes are separate from test-owner cleanup
- Gate or integration probe that records role identity + disable-trigger outcome
- Security review note updating D07-05 disposition
- `.tmp/REDHAT-FIX-RH-S30-13/**`

## Acceptance Criteria

- [x] **AC-1** Under the **application / non-superuser role** used by production platform connections, `ALTER TABLE data_plane_ponr DISABLE TRIGGER ALL` (or equivalent) is denied **or** is impossible because the role lacks ownership; evidence shows the exact role name and SQLSTATE/error.
- [x] **AC-2** Under that same production role, `TRUNCATE data_plane_ponr` and `UPDATE`/`DELETE` continue to fail closed (`PONR_IMMUTABLE` or privilege failure) after RH-S30-01.
- [x] **AC-3** If any operator-facing role can still disable triggers, the task must either (a) remove that capability from the operator role model, or (b) install an explicit audit/alert path that records disable/truncate attempts with role+timestamp, and document residual risk as accepted only with that audit proven live — not silent.
- [x] **AC-4** Test harness may still use a privileged cleanup path, but must not be conflated with the production role claim; evidence labels the two roles distinctly.
- [x] **AC-5** Evidence under `.tmp/REDHAT-FIX-RH-S30-13/` includes role-provenance probe transcripts (production role + optional owner role) and the chosen disposition (closed vs audited residual).

## Anti-stub

- Do not mark complete by re-running only RH-S30-01 TRUNCATE-as-owner-with-triggers-enabled.
- Do not claim "immutable" while the harness silently disables triggers without labeling that path non-production.
- Real Postgres roles; no mocked SQLSTATE.

## Evidence

`.tmp/REDHAT-FIX-RH-S30-13/`

Required artifacts (minimum):

| Artifact | Proves |
|----------|--------|
| `ac1-prod-role-disable-trigger.json` | production role cannot (or is audited when it can) disable triggers |
| `ac2-prod-role-dml-truncate.json` | UPDATE/DELETE/TRUNCATE still fail closed |
| `ac3-disposition.md` | closed vs audited residual with audit proof |
| `ac4-role-map.md` | production role vs harness owner role |

## Disposition

Sprint 30 must not be marked complete until this task is dual-lens APPROVED, landed on main, and the role-provenance evidence is present in the landed SHA.

AGENT: implementer=devops-engineer | technical-reviewer=security-reviewer | product-reviewer=product-manager
planned_at: 2026-08-07T09:02:29Z
finding_ids: [H-3, REDHAT-FIX-RH-S30-13]
