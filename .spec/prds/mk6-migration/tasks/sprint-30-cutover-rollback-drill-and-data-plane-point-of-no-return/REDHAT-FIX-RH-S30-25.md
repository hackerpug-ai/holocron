# REDHAT-FIX-RH-S30-25 — M-3 residual: independent HTTP-201 ID capture + durable per-branch identity evidence

> **Task ID:** REDHAT-FIX-RH-S30-25
> **Sprint:** [Sprint 30](./SPRINT.md)
> **Agent:** `mastra-implementer`
> **Priority:** P1
> **Type:** FIX
> **Severity:** MEDIUM
> **Source finding:** M-3 residual
> **Source:** `.spec/reviews/red-hat-sprint-30-20260807T101142Z-independent-final-closeout.md` (independent final closeout @ fe79d37)
> **Proposed by:** `mastra-planner`
> **TDD:** red_first · RED_GREEN_REQUIRED=yes · seeded_evidence=yes
> Status: Backlog — plan only (do not treat as fixed until dual-lens APPROVED + landed + durable evidence present)

## Finding

**M-3 — source-level identity assertions are present, but the reselect identity oracle and remediation evidence are incomplete.** Severity: **MEDIUM**. Confidence: **HIGH**.

### What improved (RH-S30-22 source)

- `non_201` and `transport` use `allowFileFallback:false` and assert injected ID in `accepted_writes` (`sprint30-redhat-rh-s30.test.ts:305-314`, `:365-372`).
- `reselect` retains internal HTTP-201 ID for recovery (`ponr.ts:810-839`); test asserts not the synthetic probe id and that the ledger contains the reported id (`:420-435`).
- Prior count-only gap closed in source.

### What remains broken

1. Test derives asserted `acceptedWriteRowId` from `report.write_row_id`, which is set by the **same implementation under test** — does **not** independently capture the actual HTTP-201 ID at the server/client boundary and compare that value to both report and durable ledger.
2. Current tree has **no** `.tmp/REDHAT-FIX-RH-S30-22/` RED log, green transcript, per-branch identity artifact, or branch-oracle map required by RH-S30-22.
3. Review-channel suite run is not a substitute for durable evidence.

### Current reselect anti-pattern (must fix)

```ts
expect(report.write_row_id).toBeTruthy();
expect(report.write_row_id).not.toBe(reselectProbeId);
const acceptedWriteRowId = String(report.write_row_id); // SELF-CORRELATED
// ...
expect(writeIds).toContain(acceptedWriteRowId);
```

## Preferred design

**Option A (preferred):** test harness wraps `fetch` / Hono response path and records `status===201` `body.document.id` into a local `captured201Ids[]` **independent** of `EnableWritesReport`. Then assert:

```
independent201Id === report.write_row_id
AND ledger.accepted_writes[].id contains independent201Id
AND independent201Id !== reselectProbeId
```

**Option B (fallback):** product report gains explicit `http_201_document_id` populated from response body before any inject rewrite; still prefer independent capture when possible. Document why if only B is used.

Product already keeps real 201 id for audit (RH-S30-22 policy A in `ponr.ts:810-839`); residual is **observation independence** + **durable evidence**, not product rewrite.

## Scope (WRITE-ALLOWED)

- `services/platform/tests/integration/sprint30-redhat-rh-s30.test.ts`
- `services/platform/tests/integration/sprint30-cutover-harness.ts` (only if capture helper needed)
- `services/platform/src/cutover/ponr.ts` ONLY if design B required (prefer test-side capture)
- `.tmp/REDHAT-FIX-RH-S30-25/**` (may complete/cross-link missing RH-S30-22 artifacts)
- This task file / status notes
- **Does not** expand into C-2 packaging or C-3 probe

## Acceptance Criteria

- [ ] **AC-1** `reselect_miss`: integration observable independently captures the real HTTP-201 document ID at the server/client boundary (`captured201Ids` from fetch/Hono wrap, **not** `report.write_row_id`). Capture occurs on the real `POST /api/documents` path exercised by `runEnableWrites` before reselect inject recovery. At least one captured 201 id must exist after the case.
- [ ] **AC-2** Identity equality: `independent201Id === report.write_row_id` AND durable ledger (`loadPostExportWriteAuditAsync` with `allowFileFallback:false`) `accepted_writes[].id` contains `independent201Id` AND `independent201Id !== reselectProbeId`. Fence re-armed; rollback refuses with `POST_EXPORT_WRITE_ACCEPTED` or `POST_PONR_INELIGIBLE`. Self-correlated `report.write_row_id` alone is **insufficient** for pass.
- [ ] **AC-3** Regression of RH-S30-22 source identity for `non_201_accepted_id` and `transport_error`: still assert inject-supplied `documentId` appears in `accepted_writes[].id` (and `report.write_row_id` equals inject id for non_201 when present); `allowFileFallback:false`; count ≥ 1 alone remains insufficient.
- [ ] **AC-4** Durable evidence package under `.tmp/REDHAT-FIX-RH-S30-25/`: RED log (independent-capture / triple-equality oracle fails when only self-correlated report path used or wrong id), GREEN suite log, per-branch identity JSON for all three inject kinds, `branch-oracle-map.md` mapping inject kind → independent oracle source → expected id → ledger field → refuse coupling. Hand-written evidence JSON is not a substitute for suite output.
- [ ] **AC-5** RH-S30-05 `injectPonrInsertFailure` still green; full focused suite green under `PLATFORM_IT=1`; `recoverEnableWritesCrashWindow` and `runRollbackRepoint` not mocked; inject cases still go through `runEnableWrites` with real Postgres + real Hono enable-writes path.

## Test Criteria

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | reselect installs HTTP-201 capture; capture.ids length ≥ 1 with real body.document.id | AC-1 | capture asserts + oracle JSON |
| TC-2 | independent201Id === report.write_row_id | AC-2 | expect |
| TC-3 | ledger accepted_writes ids contain independent201Id; not reselectProbeId; allowFileFallback:false | AC-2 | ledger expect |
| TC-4 | independent201Id !== reselectProbeId; fence re-armed; rollback refuse with required codes | AC-2 | fence + refuse JSON |
| TC-5 | non_201: writeIds contains inject documentId; report.write_row_id === inject documentId | AC-3 | identity oracle JSON |
| TC-6 | transport_error: writeIds contains inject recovery documentId | AC-3 | identity oracle JSON |
| TC-7 | RH-S30-05 injectPonrInsertFailure still green | AC-5 | suite / green txt |
| TC-8 | No mock of recoverEnableWritesCrashWindow / runRollbackRepoint / Hono documents route | AC-5 | code review |
| TC-9 | RED evidence log non-empty under .tmp/REDHAT-FIX-RH-S30-25/ | AC-4 | red log |
| TC-10 | GREEN suite log + branch-oracle-map.md + per-branch identity JSON present | AC-4 | artifacts |
| TC-11 | Source uses independent capture variable in reselect expects (not solely report.write_row_id) | AC-1 | rg on test file |
| TC-12 | reselect-miss-identity-oracle.json records independent_http_201_document_id, report_write_row_id, ledger_write_ids, equality booleans | AC-2 | JSON schema |

## Anti-stub

- Self-correlated `report.write_row_id` alone is **NOT** a pass for reselect identity.
- `countAcceptedPostExportWrites(...) >= 1` alone is **NOT** a pass for any inject branch.
- Hand-written evidence JSON / invented identity artifacts are not a pass.
- Do not mock `recoverEnableWritesCrashWindow`, `runRollbackRepoint`, fetch that fakes 201 without Hono, or Postgres ledger.
- Do not use `allowFileFallback:true` or file-mirror-only ledger as the identity oracle.
- Do not claim M-3 closed without durable RED+GREEN under `.tmp/REDHAT-FIX-RH-S30-25/`.
- Do not expand into C-2 packaging or C-3 probe.
- Do not re-break RH-S30-22 product policy A (reselect must continue auditing real HTTP 201 id, not synthetic probe id).

## Critical Constraints

- **MUST** capture HTTP-201 document id independently of `EnableWritesReport` for reselect_miss
- **MUST** assert `independent201Id === report.write_row_id` and ledger membership and `!== reselectProbeId`
- **MUST** keep non_201/transport inject-id identity asserts (RH-S30-22 regression)
- **MUST** emit real RED then GREEN evidence under `.tmp/REDHAT-FIX-RH-S30-25/` with per-branch identity JSON + `branch-oracle-map.md`
- **MUST** keep RH-S30-05 green; serialize with `withCutoverSharedLock`; `PLATFORM_IT=1`
- **NEVER** treat self-correlated report field or count ≥ 1 as M-3 closed
- **NEVER** invent evidence
- **STRICTLY** identity match is exact string equality on UUID ids
- **STRICTLY** out of scope: C-2 packaging, C-3 probe

## Evidence

`.tmp/REDHAT-FIX-RH-S30-25/`

| Artifact | Proves |
|----------|--------|
| `red-independent-identity-oracle-fail.log` | AC-4 RED: independent-capture oracle fails before fix |
| `green-identity-oracle-pass.log` | AC-4 GREEN focused suite |
| `suite-vitest.log` | Full focused file suite exit 0 |
| `non-201-identity-oracle.json` | AC-3 inject documentId identity |
| `transport-error-identity-oracle.json` | AC-3 transport inject identity |
| `reselect-miss-identity-oracle.json` | AC-1/AC-2 independent 201 + report + ledger equality |
| `branch-oracle-map.md` | inject kind → oracle source → expected id → ledger → refuse |
| `rh-s30-05-still-green.txt` | AC-5 regression |
| `capture-design-note.md` | Design A implementation; why report.write_row_id alone is rejected |
| `crosslink-rh-s30-22-residual.md` | Optional: RH-S30-22 source landed; observation independence closed here |

## Reading List

- Closeout review M-3 section @ fe79d37 — `.spec/reviews/red-hat-sprint-30-20260807T101142Z-independent-final-closeout.md`
- `REDHAT-FIX-RH-S30-22.md` — prior residual (source identity without independent capture + missing `.tmp` evidence)
- `REDHAT-FIX-RH-S30-19.md` — original three-branch inject oracles
- `services/platform/tests/integration/sprint30-redhat-rh-s30.test.ts` — reselect anti-pattern `:420-435`
- `services/platform/src/cutover/ponr.ts` — reselect_miss keeps real 201 id `:810-839`
- `services/platform/tests/integration/sprint30-cutover-harness.ts` — preferred home for `createHttp201DocumentIdCapture`
- `services/platform/src/cutover/post-export-write-audit.ts` — `accepted_writes[].id` mapping
- `services/platform/src/cutover/rollback-repoint.ts` — refuse codes

## Implementation hints

```ts
// Preferred capture helper (harness or test-local)
function createHttp201DocumentIdCapture() {
  const ids: string[] = [];
  const prior = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const res = await prior(input as any, init as any);
    try {
      const url = String(typeof input === 'string' ? input : (input as Request).url);
      if (url.includes('/api/documents') && (init?.method ?? 'GET').toUpperCase() === 'POST' && res.status === 201) {
        const body = (await res.clone().json()) as { document?: { id?: string } };
        if (body.document?.id) ids.push(body.document.id);
      }
    } catch { /* ignore parse */ }
    return res;
  };
  return { ids, restore: () => { globalThis.fetch = prior; } };
}

// Reselect asserts
const capture = createHttp201DocumentIdCapture();
try {
  const report = await runEnableWrites({
    /* ... */
    injectFirstWriteFailure: { kind: 'reselect_miss', documentId: reselectProbeId },
  });
  const independent201Id = capture.ids[0];
  expect(independent201Id).toBeTruthy();
  expect(independent201Id).not.toBe(reselectProbeId);
  expect(report.write_row_id).toBe(independent201Id);
  const ledger = await loadPostExportWriteAuditAsync({ /* ... */, allowFileFallback: false });
  const writeIds = (ledger.audit?.accepted_writes ?? []).map((w) => w.id).filter(Boolean);
  expect(writeIds).toContain(independent201Id);
  expect(writeIds).not.toContain(reselectProbeId);
} finally {
  capture.restore();
}
```

- non_201 / transport: keep inject-supplied IDs as independent oracles (test constants, not report-derived).
- Evidence cmd: `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-redhat-rh-s30.test.ts 2>&1 | tee .tmp/REDHAT-FIX-RH-S30-25/suite-vitest.log`

## Disposition

TEST-ORACLE (+ optional harness capture helper; product change only if design B) FIX for M-3 residual after RH-S30-22. Source already asserts identity and reselect audits real HTTP 201 id, but reselect observation is self-correlated via `report.write_row_id` and durable RH-S30-22 evidence is absent. Close with independent HTTP-201 capture, triple equality independent/report/ledger, retain non_201/transport identity regression, emit real RED/GREEN package under `.tmp/REDHAT-FIX-RH-S30-25/`. Out of scope: C-2 packaging, C-3 probe.

AGENT: implementer=mastra-implementer | technical-reviewer=mastra-reviewer | product-reviewer=product-manager  
planned_at: 2026-08-07T10:20:35Z  
finding_ids: [M-3, REDHAT-FIX-RH-S30-25, REDHAT-FIX-RH-S30-22, REDHAT-FIX-RH-S30-19]

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-RH-S30-25",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "proposed_by": "mastra-planner",
  "touches_capabilities": ["CAP-CUT-01"],
  "fixtures": {
    "platform_it_disposable": {
      "description": "PLATFORM_IT=1 real Postgres + live Hono enable-writes path under withCutoverSharedLock",
      "seed_method": "cli"
    }
  },
  "requirements": [
    {"id": "AC-1", "type": "acceptance_criterion", "description": "reselect_miss independently captures real HTTP-201 document id at boundary (not report.write_row_id)", "verify": "capture.ids + TC-11 rg"},
    {"id": "AC-2", "type": "acceptance_criterion", "description": "independent201Id === report.write_row_id and ledger contains independent201Id and !== reselectProbeId", "verify": "reselect-miss-identity-oracle.json"},
    {"id": "AC-3", "type": "acceptance_criterion", "description": "non_201/transport still identity-assert inject documentId (RH-S30-22 regression)", "verify": "non-201/transport identity oracle JSON"},
    {"id": "AC-4", "type": "acceptance_criterion", "description": "Durable RED/GREEN + per-branch identity JSON + branch-oracle-map under .tmp/REDHAT-FIX-RH-S30-25/", "verify": "artifact list"},
    {"id": "AC-5", "type": "acceptance_criterion", "description": "RH-S30-05 injectPonrInsertFailure still green; no recovery/Hono mocks", "verify": "suite green + code review"},
    {"id": "TC-1", "type": "test_criterion", "maps_to_ac": "AC-1", "description": "capture.ids has real 201 body.document.id", "verify": "reselect capture"},
    {"id": "TC-2", "type": "test_criterion", "maps_to_ac": "AC-2", "description": "independent201Id equals report.write_row_id", "verify": "expect"},
    {"id": "TC-3", "type": "test_criterion", "maps_to_ac": "AC-2", "description": "ledger contains independent201Id not probe id", "verify": "ledger expect"},
    {"id": "TC-4", "type": "test_criterion", "maps_to_ac": "AC-2", "description": "fence re-arm + rollback refuse with identity coupling", "verify": "fence/refuse JSON"},
    {"id": "TC-5", "type": "test_criterion", "maps_to_ac": "AC-3", "description": "non_201 inject id identity", "verify": "non-201-identity-oracle.json"},
    {"id": "TC-6", "type": "test_criterion", "maps_to_ac": "AC-3", "description": "transport inject id identity", "verify": "transport-error-identity-oracle.json"},
    {"id": "TC-7", "type": "test_criterion", "maps_to_ac": "AC-5", "description": "RH-S30-05 still green", "verify": "rh-s30-05-still-green.txt"},
    {"id": "TC-8", "type": "test_criterion", "maps_to_ac": "AC-5", "description": "no mock recovery/Hono; real PLATFORM_IT", "verify": "code review"},
    {"id": "TC-9", "type": "test_criterion", "maps_to_ac": "AC-4", "description": "RED independent-identity fail log present", "verify": "red-independent-identity-oracle-fail.log"},
    {"id": "TC-10", "type": "test_criterion", "maps_to_ac": "AC-4", "description": "GREEN suite + branch-oracle-map + per-branch JSON", "verify": "artifact paths"},
    {"id": "TC-11", "type": "test_criterion", "maps_to_ac": "AC-1", "description": "source uses independent capture variable in reselect expects", "verify": "rg"},
    {"id": "TC-12", "type": "test_criterion", "maps_to_ac": "AC-2", "description": "reselect identity oracle JSON records triple fields", "verify": "reselect-miss-identity-oracle.json"}
  ]
}
-->
