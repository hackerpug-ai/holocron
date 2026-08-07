# REDHAT-FIX-RH-S30-09 — Close full post-fence-lift first-write failure window (pre-PONR)

> **Task ID:** REDHAT-FIX-RH-S30-09
> **Sprint:** [Sprint 30](./SPRINT.md)
> **Agent:** `devops-engineer`
> **Priority:** P0
> **Type:** FIX
> **Severity:** CRITICAL
> **Source finding:** C-1 (independent remediation red-hat)
> **Source:** `.spec/reviews/red-hat-sprint-30-20260807T085706Z-independent-remediation.md` (independent red-hat @ 2ff0e6c4)
> Status: Finalized on main with tip-bound gate 20260807T091354Z (awaiting independent dual-lens + fresh QA — not release-approved)

## Finding

**C-1 — First-write failures before PONR insertion can leave writes enabled after a committed document.** Confidence: HIGH.

`runEnableWrites` lifts the durable fence (`ponr.ts` fence-lift step), then POSTs a real document. On non-201 responses (including Hono's `post_export_write_audit_failed` after a successful document INSERT that returns HTTP 500 with an accepted `documentId`), and on fetch/JSON/reselect failures, the function returns `baseFail` without calling `recoverEnableWritesCrashWindow`. Recovery is invoked only from the later PONR INSERT catch. An accepted write can therefore leave `HOLO_MIGRATION_READ_ONLY=0` with neither PONR nor a durable production-audit refuse path. RH-S30-05 only injects PONR-insert failure and cannot catch this regression.

## Scope (WRITE-ALLOWED)

- `services/platform/src/cutover/ponr.ts` (every post-fence-lift failure path before successful PONR commit)
- `services/platform/src/http/hono-app.ts` only if needed to make accepted-document/non-201 surfaces observable without weakening audit
- Integration/unit tests covering non-201-with-accepted-id, lost/invalid response, and reselect-miss paths
- `.tmp/REDHAT-FIX-RH-S30-09/**`

## Acceptance Criteria

- [x] **AC-1** After fence lift, any POST `/api/documents` outcome that is not a verified happy path (non-201 **or** 201 without a bound reselected row **or** fetch/JSON/timeout failure **or** body missing `document.id`) invokes the same crash-window recovery as PONR-insert failure: durable `HOLO_MIGRATION_READ_ONLY` is re-armed to `1`/`true`, and a durable post-export accepted-write / refusal audit record exists when a document was accepted or when acceptance cannot be disproved.
- [x] **AC-2** PLATFORM_IT (or equivalent real Postgres + secrets path): inject/simulate the Hono path where the document INSERT succeeds but the audit write fails (HTTP 500 with accepted `documentId`). `runEnableWrites` returns fail-closed (`ok:false`); durable fence is re-armed; subsequent `cutover:rollback-repoint --json` exits non-zero with `POST_EXPORT_WRITE_ACCEPTED` or `POST_PONR_INELIGIBLE` (not a clean re-open).
- [x] **AC-3** PLATFORM_IT: inject lost/invalid response after fence lift (network throw, non-JSON body, or reselect miss for a claimed id). Fence is re-armed; no half-open write window remains (`readDurableMigrationReadOnly` observes armed).
- [x] **AC-4** Existing happy-path enable-writes still records PONR and remains idempotent; RH-S30-05 PONR-insert recovery remains green.
- [x] **AC-5** Evidence under `.tmp/REDHAT-FIX-RH-S30-09/` includes: failing RED log (or citation of pre-fix failure), GREEN run logs for AC-1..AC-3, and a one-line map of which `ponr.ts` branches call recovery.

## Anti-stub

- Real services / real Postgres / real secrets path for fence re-arm proofs.
- Do not "fix" by only expanding the PONR-insert catch comment; every post-lift return before successful PONR must be covered.
- Do not weaken RH-S30-05; this task widens the recovery window, not replaces it with docs.
- No forged gate-results; no hand-written `verified:true` without raw recompute.

## Evidence

`.tmp/REDHAT-FIX-RH-S30-09/`

Required artifacts (minimum):

| Artifact | Proves |
|----------|--------|
| `ac2-accepted-doc-non-201.json` | accepted documentId + non-201 → re-arm + refuse |
| `ac3-lost-or-invalid-response.json` | transport/parse/reselect failure → re-arm |
| `ac4-happy-and-ponr-insert-still-green.txt` | no regression on happy / RH-S30-05 paths |
| `branch-coverage-map.md` | list of post-lift failure returns → recovery call sites |

## Disposition

Sprint 30 must not be marked complete until this task is dual-lens APPROVED, landed on main, and a fresh tip-bound human gate passes with evidence committed in the same SHA (see REDHAT-FIX-RH-S30-10).

AGENT: implementer=devops-engineer | technical-reviewer=code-reviewer | product-reviewer=product-manager
planned_at: 2026-08-07T09:02:29Z
finding_ids: [C-1, REDHAT-FIX-RH-S30-09]
