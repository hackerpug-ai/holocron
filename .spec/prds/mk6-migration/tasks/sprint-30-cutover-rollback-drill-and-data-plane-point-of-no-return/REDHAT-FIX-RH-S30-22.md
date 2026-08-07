# REDHAT-FIX-RH-S30-22 — PLATFORM_IT oracles prove accepted write-row identity not merely audit count (M-3 residual)

> **Task ID:** REDHAT-FIX-RH-S30-22
> **Sprint:** [Sprint 30](./SPRINT.md)
> **Agent:** `mastra-implementer`
> **Priority:** P1
> **Type:** FIX
> **Severity:** MEDIUM
> **Source finding:** M-3 residual
> **Source:** `.spec/reviews/red-hat-sprint-30-20260807T094841Z-independent-final-closeout.md` (independent final closeout @ a0edfdd)
> **Proposed by:** `mastra-planner`
> Status: Backlog — plan only (do not treat as fixed until dual-lens APPROVED + landed)

## Finding

**M-3 residual — tests count audit rows but do not prove accepted write-row identity.** Confidence: MEDIUM (PARTIAL).

Three PLATFORM_IT cases invoke `runEnableWrites` with `injectFirstWriteFailure` kinds (`non_201_accepted_id` | `transport_error` | `reselect_miss`), assert durable fence re-arm and rollback refuse; the focused suite is green (six cases). But every new case asserts only audit count `>= 1` — not the required accepted/write-row identity.

The reselect injection replaces the actual 201 id with its supplied synthetic id before recording recovery (`services/platform/src/cutover/ponr.ts` reselect_miss branch), so the test does not prove the audit represents the accepted write.

RH-S30-19 closed branch reachability; this residual closes accepted-write identity proof.

## Scope (WRITE-ALLOWED)

- `services/platform/tests/integration/sprint30-redhat-rh-s30.test.ts` (strengthen identity oracles on three inject cases)
- `services/platform/tests/integration/sprint30-cutover-harness.ts` (only if small helper needed)
- `services/platform/src/cutover/ponr.ts` (only if reselect_miss product identity must be fixed — policy A preferred)
- `.tmp/REDHAT-FIX-RH-S30-22/**`
- This task file / status notes

## Acceptance Criteria

- [ ] **AC-1** `non_201_accepted_id`: after inject, durable ledger (`loadPostExportWriteAuditAsync` with `allowFileFallback:false`) has `accepted_writes[].id ===` inject-supplied `documentId`; `report.write_row_id` equals that id when present; fence re-armed; rollback refuses with `POST_EXPORT_WRITE_ACCEPTED` or `POST_PONR_INELIGIBLE`. **count ≥ 1 alone is insufficient.**
- [ ] **AC-2** `transport_error`: durable audit contains `accepted_writes[].id ===` inject-supplied recovery `documentId`; fence re-armed; refuse codes fire. Identity equality required in addition to count.
- [ ] **AC-3** `reselect_miss`: prefer **policy A** product fix so `recoverEnableWritesCrashWindow` audits the real HTTP 201 `body.document.id` (save real id before any inject rewrite); test asserts ledger `id === real201Id` and refuse keys on that identity. **Policy B** only with written rationale: if product intentionally audits synthetic recovery id, assert exact identity match on that recovery identity + document why real 201 id is not audited. In all cases count ≥ 1 alone fails AC-3.
- [ ] **AC-4** Refuse latch identity coupling: after each inject path, `repointed:false` + refuse codes, and evidence includes the audited identity `I` that caused refuse (not only refuse code).
- [ ] **AC-5** Regression: RH-S30-05 `injectPonrInsertFailure` and prior fence/refuse assertions remain green; full focused suite green; `recoverEnableWritesCrashWindow` not mocked; inject cases go through `runEnableWrites`.
- [ ] **AC-6** Evidence package under `.tmp/REDHAT-FIX-RH-S30-22/`: RED log (identity oracle fails on count-only/wrong-id), GREEN suite log, per-branch identity-oracle JSON, `branch-oracle-map.md`, optional product patch note / reselect rationale.

## Test Criteria

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | non_201 ledger contains `accepted_writes[].id` equal to inject documentId | AC-1 | identity expect + oracle JSON |
| TC-2 | non_201 `report.write_row_id` equals inject documentId when present | AC-1 | report assert |
| TC-3 | transport_error ledger contains inject documentId | AC-2 | identity oracle JSON |
| TC-4 | reselect_miss audits real HTTP 201 id (preferred) or documented intentional recovery identity with exact match | AC-3 | identity-oracle.json + optional rationale |
| TC-5 | reselect_miss still completes real POST 201 before recovery (no mock of fetch/Hono) | AC-3 | enable-writes report |
| TC-6 | After each inject, rollback refuses with required codes and identity I present in durable ledger | AC-4 | refuse + oracle JSON |
| TC-7 | RH-S30-05 injectPonrInsertFailure still green | AC-5 | suite green / green txt |
| TC-8 | recoverEnableWritesCrashWindow is not mocked; cases call runEnableWrites | AC-5 | code review |
| TC-9 | RED evidence exists showing identity oracle fails without correct id match | AC-6 | red log non-empty |
| TC-10 | GREEN suite log + branch-oracle-map.md present after fix | AC-6 | artifacts |
| TC-11 | Source has identity equality asserts — not only `toBeGreaterThanOrEqual(1)` | AC-1 | `rg` on test file |

## Anti-stub

- `countAcceptedPostExportWrites(...) >= 1` alone is **NOT** a pass.
- Must assert `write_row_id` / `accepted_writes[].id` / `documentId` identity match per inject path.
- Do not mock `recoverEnableWritesCrashWindow` or `runRollbackRepoint`.
- Do not use `allowFileFallback:true` or file-mirror-only ledger as the identity oracle.
- Keep RH-S30-05 and prior RH-S30-19 fence/refuse coverage.
- Do not hand-write evidence JSON as a substitute for suite output.
- Do not expand into C-2 packaging or C-3 probe.
- Do not claim M-3 closed while reselect_miss silently audits a synthetic id without policy A fix or documented policy B + identity asserts.

## Critical Constraints

- **MUST** strengthen each of the three injectFirstWriteFailure PLATFORM_IT cases with accepted-write identity oracles
- **MUST** use real Postgres ledger (`allowFileFallback:false`) for identity
- **MUST** prefer product fix so reselect_miss audits real HTTP 201 id
- **MUST** keep RH-S30-05 green; serialize with `withCutoverSharedLock`; PLATFORM_IT=1
- **NEVER** treat count ≥ 1 as sufficient
- **NEVER** mock recovery or invent evidence
- **STRICTLY** identity match is exact string equality on UUID ids
- **STRICTLY** out of scope: C-2 packaging, C-3 probe

## Evidence

`.tmp/REDHAT-FIX-RH-S30-22/`

| Artifact | Proves |
|----------|--------|
| `non-201-identity-oracle.json` | AC-1 identity equality |
| `transport-error-identity-oracle.json` | AC-2 identity equality |
| `reselect-miss-identity-oracle.json` | AC-3 identity policy + equality |
| `reselect-miss-identity-rationale.md` | AC-3 policy B only (omit if policy A) |
| `*-fence-ledger.json` / `*-rollback-refuse.json` | fence + refuse coupling |
| `rh-s30-05-still-green.txt` | AC-5 regression |
| `red-identity-oracle-fail.log` | AC-6 red_first |
| `green-identity-oracle-pass.log` / `suite-vitest.log` | AC-6 green |
| `branch-oracle-map.md` | inject kind → expected identity → ledger field → refuse coupling |

## Reading List

- Closeout review M-3 section @ a0edfdd
- `REDHAT-FIX-RH-S30-19.md` — prior branch oracles (count-only residual)
- `REDHAT-FIX-RH-S30-09.md` — injectFirstWriteFailure product hooks
- `services/platform/tests/integration/sprint30-redhat-rh-s30.test.ts` — RH-S30-05 + RH-S30-19 cases
- `services/platform/src/cutover/ponr.ts` — inject + reselect_miss rewrite
- `services/platform/src/cutover/post-export-write-audit.ts` — accepted_writes[].id mapping
- `services/platform/src/cutover/rollback-repoint.ts` — refuse codes
- `services/platform/tests/integration/sprint30-cutover-harness.ts`

## Implementation hints

```ts
// Optional helper in test file
function assertLedgerContainsWriteId(audit: Audit, expectedId: string) {
  expect(audit).toBeTruthy();
  expect(countAcceptedPostExportWrites(audit)).toBeGreaterThanOrEqual(1);
  expect(audit.accepted_writes.some((w) => w.id === expectedId)).toBe(true);
}
```

- non_201 / transport: `expectedId = inject documentId`
- reselect_miss preferred product fix: keep `const realId = body.document.id`; pass `realId` to `recoverEnableWritesCrashWindow`; do not overwrite `writeRowId` with synthetic before audit
- RED first: add identity expects → capture fail → fix product/test → capture green

## Disposition

TEST-ORACLE (+ optional product identity) FIX for M-3 residual. RH-S30-19 landed three inject branches but only count≥1 audit oracles. Strengthen PLATFORM_IT identity equality for accepted write-row ids; prefer fixing reselect_miss to audit real HTTP 201 id. Out of scope: C-2 packaging, C-3 probe. Evidence under `.tmp/REDHAT-FIX-RH-S30-22/`.

AGENT: implementer=mastra-implementer | technical-reviewer=mastra-reviewer | product-reviewer=product-manager
planned_at: 2026-08-07T10:01:05Z
finding_ids: [M-3, REDHAT-FIX-RH-S30-22, REDHAT-FIX-RH-S30-19]

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-RH-S30-22",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "proposed_by": "mastra-planner",
  "touches_capabilities": ["CAP-CUT-01"],
  "requirements": [
    {"id": "AC-1", "type": "acceptance_criterion", "description": "non_201_accepted_id proves durable audit identity equals inject documentId"},
    {"id": "AC-2", "type": "acceptance_criterion", "description": "transport_error proves recovery audit identity equals inject documentId"},
    {"id": "AC-3", "type": "acceptance_criterion", "description": "reselect_miss proves audit identity equals accepted write used by refuse (prefer real 201 id)"},
    {"id": "AC-4", "type": "acceptance_criterion", "description": "Refuse latch identity-coupled to audited accepted write"},
    {"id": "AC-5", "type": "acceptance_criterion", "description": "RH-S30-05 and prior inject coverage remain green; no recovery mock"},
    {"id": "AC-6", "type": "acceptance_criterion", "description": "RED/GREEN evidence package under .tmp/REDHAT-FIX-RH-S30-22/"},
    {"id": "TC-1", "type": "test_criterion", "maps_to_ac": "AC-1", "description": "non_201 ledger id equality"},
    {"id": "TC-2", "type": "test_criterion", "maps_to_ac": "AC-1", "description": "non_201 report.write_row_id equality"},
    {"id": "TC-3", "type": "test_criterion", "maps_to_ac": "AC-2", "description": "transport ledger id equality"},
    {"id": "TC-4", "type": "test_criterion", "maps_to_ac": "AC-3", "description": "reselect identity policy + equality"},
    {"id": "TC-5", "type": "test_criterion", "maps_to_ac": "AC-3", "description": "real POST 201 still exercised"},
    {"id": "TC-6", "type": "test_criterion", "maps_to_ac": "AC-4", "description": "refuse coupled to identity I"},
    {"id": "TC-7", "type": "test_criterion", "maps_to_ac": "AC-5", "description": "RH-S30-05 still green"},
    {"id": "TC-8", "type": "test_criterion", "maps_to_ac": "AC-5", "description": "no mock recovery"},
    {"id": "TC-9", "type": "test_criterion", "maps_to_ac": "AC-6", "description": "RED evidence present"},
    {"id": "TC-10", "type": "test_criterion", "maps_to_ac": "AC-6", "description": "GREEN suite + branch map"},
    {"id": "TC-11", "type": "test_criterion", "maps_to_ac": "AC-1", "description": "source has identity expects not count-only"}
  ]
}
-->
