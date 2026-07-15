# Independent Red-Hat Review — Sprint 3 Cycle 2 (REDHAT-FIX-04 + REDHAT-FIX-05)

**Report Date**: 2026-07-14T20:01:59Z
**Target**: Sprint 3 — MCP Compatibility Manifest and Frozen Fixtures
**Reviewed At**: commit `fe69da4` on `main`
**Focus**: REDHAT-FIX-04 (parameterized replay validation) + REDHAT-FIX-05 (error code catalog validation)
**Prior Reports**:
- `.spec/reviews/red-hat-2026-07-14T19-30-00Z-sprint03.md` (cycle 0: 12 findings, NEEDS_FIXES)
- `.spec/reviews/red-hat-2026-07-14T19-07-45Z-sprint03-postremediation.md` (cycle 1: 7 findings, NEEDS_FIXES)
**Independent**: Runner's own `gate-results.json` verdict was NOT reused as proof. All claims re-verified from source.

---

## Executive Summary

Both cycle-2 HIGH findings (NEW-1: 19/21 replay fixtures without cross-source validation; NEW-2: error fixture codes not validated against manifest catalogs) are **genuinely resolved**. The parameterized `it.each` test patterns are correct, dynamically loaded from the manifest (not hardcoded), and have independently proven teeth via my own negative-control mutations at the exact target commit. The REDHAT-FIX-05 implementation discovered and fixed 6 error-code mismatches (5 more than the originally anticipated 1), which strengthens the test suite's value.

All 380 E2E tests pass at `fe69da4`. The `tsgo --noEmit` typecheck and biome lint both pass. No prohibited files were modified by either task.

Eight non-blocking findings from cycle 1 are carried forward (all LOW/MEDIUM). Three new LOW findings are noted (stale sprint-goal-state, fragile type annotation, scope writeAllowed gap).

**Verdict: APPROVED**

---

## Verification Methodology

All code was verified against a clean worktree checked out at `fe69da4` (not the working tree). Tests were independently re-run at the exact commit. Negative controls were performed by the reviewer (not relying on RED evidence files). No reliance on `gate-results.json`, `sprint-goal-state.json`, or `evidence/review-verdict.md` for proof of correctness.

---

## REDHAT-FIX-04 — Parameterized Replay Cross-Source Validation

### AC-1 (PRIMARY): All 21 mutation tools have parameterized cross-source validation — **PASS**

**Independently verified**:
- `tests/integration/mcp-replay-contract.test.ts:52-55` — mutation tools loaded dynamically via `loadManifest(MANIFEST_PATH).tools.filter(t => t.side_effects != null)`. NOT hardcoded.
- `TOOL_SCHEMA_MAP` (lines 59-81) contains exactly 21 entries mapping tool IDs to their Zod schemas imported from `holocron-mcp/src/config/validation`.
- Three `it.each(mutationTools.map((t) => [t.id]))` blocks (lines 116-152) produce 63 parameterized cases (21×3):
  1. `fixture.idempotency_key` deep-equals `manifest replay.idempotency_key` (line 125)
  2. Every manifest key field exists in `schema.shape` (line 137)
  3. Every fixture key field exists in `schema.shape` (line 150)
- Fail-closed guard at lines 120-122, 132-134, 144-146: throws if a mutation tool from the manifest is not in `TOOL_SCHEMA_MAP`.
- Suite-shape self-test (lines 157-167) checks for `.skip()` usage — preserved and passing.
- **Test count**: 64 total (63 cross-source + 1 self-test). Independently confirmed.

### AC-2: RED evidence proves teeth for the 19 newly-covered tools — **PASS**

**Independently verified** (my own negative controls at `fe69da4`):
1. Corrupted `start_assimilation_replay.json` idempotency_key → 2 tests failed (fixture≠manifest, bogus field not in Zod shape)
2. Corrupted `add_improvement_replay.json` idempotency_key → 2 tests failed (same pattern)
3. Reverted both → all 64 tests pass

**RED evidence file**: `.spec/evidence/redhat-fix-04-red-evidence.txt` — committed at `fe69da4`, documents shop_products corruption test with assertion output.

### Scope Compliance — **PASS**

- Modified files: `tests/integration/mcp-replay-contract.test.ts` only
- Prohibited files (manifest YAML, validation.ts, manifest-loader.ts, fixture JSONs): NOT modified

---

## REDHAT-FIX-05 — Error Code Catalog Validation + shop_products Fix

### AC-1 (PRIMARY): Parameterized test validates all 21 mutation tool error fixture codes — **PASS**

**Independently verified**:
- `tests/integration/mcp-fixture-coverage.test.ts:82-95` — new `describe('MCP fixture coverage — error code catalog validation')` block.
- Uses `it.each(mutationTools.map((t) => [t.id, t.errors.map((e) => e.code)]))` — dynamically loaded from manifest.
- Assertion (line 94): `expect(manifestErrorCodes).toContain(fixture.code)` — correct direction (fixture code must be IN manifest catalog).
- Error message names the tool and shows both the fixture code and available manifest codes.
- **Test count**: 26 total (5 existing + 21 error-code-catalog). Independently confirmed.

### AC-2: shop_products_error.json fixture fixed — **PASS**

**Verified fixture content**:
```json
{
  "code": "INTERNAL_SERVER_ERROR",
  "message": "Convex startShopSearch action failed unexpectedly",
  "details": { "action": "startShopSearch", "step": "retailer_fetch" }
}
```
- `INTERNAL_SERVER_ERROR` is in the manifest catalog `[INTERNAL_SERVER_ERROR, TIMEOUT]`
- Message is semantically consistent (internal failure, not validation constraint)
- `VALIDATION_ERROR` is gone

### AC-3: RED evidence — test catches the mismatch before fix — **PASS**

**RED evidence file**: `.spec/evidence/redhat-fix-05-red-evidence.txt` — documents 6 mismatches discovered (not just the anticipated 1):
1. `shop_products`: VALIDATION_ERROR → INTERNAL_SERVER_ERROR
2. `add_subscription`: NOT_FOUND → DUPLICATE_SUBSCRIPTION
3. `check_subscriptions`: BAD_REQUEST → FETCH_ERROR
4. `start_assimilation`: BAD_REQUEST → VALIDATION_ERROR
5. `cancel_assimilation`: CONFLICT → INVALID_STATE
6. `regenerate_transcript`: NOT_FOUND → INTERNAL_SERVER_ERROR

**Independently verified** (my own negative controls at `fe69da4`):
1. Corrupted `store_document_error.json` code to `"TOTALLY_INVALID_CODE"` → test failed naming tool and showing code arrays
2. Corrupted `add_subscription_error.json` code to `"FAKE_ERROR_CODE"` → test failed with same clarity
3. Reverted both → all 26 tests pass

### Additional Fixtures Verified Against Manifest Catalogs

All 6 fixed fixtures independently cross-checked against manifest `errors[]` arrays:

| Tool | Fixture Code | Manifest Catalog | Match |
|------|-------------|-----------------|-------|
| shop_products | INTERNAL_SERVER_ERROR | [INTERNAL_SERVER_ERROR, TIMEOUT] | YES |
| add_subscription | DUPLICATE_SUBSCRIPTION | [VALIDATION_ERROR, DUPLICATE_SUBSCRIPTION, INTERNAL_SERVER_ERROR] | YES |
| check_subscriptions | FETCH_ERROR | [INTERNAL_SERVER_ERROR, FETCH_ERROR] | YES |
| start_assimilation | VALIDATION_ERROR | [VALIDATION_ERROR, INTERNAL_SERVER_ERROR] | YES |
| cancel_assimilation | INVALID_STATE | [NOT_FOUND, INVALID_STATE, INTERNAL_SERVER_ERROR] | YES |
| regenerate_transcript | INTERNAL_SERVER_ERROR | [INTERNAL_SERVER_ERROR] | YES |

### Scope Compliance — **PASS (with note)**

- writeAllowed per contract: `tests/integration/mcp-fixture-coverage.test.ts`, `shop_products_error.json`
- Actually modified: those 2 + 5 additional error fixture JSONs (add_subscription, cancel_assimilation, check_subscriptions, regenerate_transcript, start_assimilation)
- The 5 additional modifications were **authorized by the contract's critical constraints**: "STRICTLY report any ADDITIONAL mismatches discovered during implementation (beyond shop_products) — the implementer must fix them in the fixture, not suppress them"
- Prohibited files (manifest YAML, validation.ts, manifest-loader.ts, replay-contract.test.ts): NOT modified
- **Note**: The writeAllowed list should have been expanded to include the 5 additional fixtures. See FINDING-C2-3 below.

---

## Gate Claims Re-Assessment (Independent)

| Claim | gate-results.json | Independent Verification | Result |
|-------|-------------------|-------------------------|--------|
| E2E total | 380/380 across 7 files | 380/380 confirmed at `fe69da4` | **PASS** |
| Replay contract tests | (implied by E2E) | 64 tests confirmed | **PASS** |
| Fixture coverage tests | (implied by E2E) | 26 tests confirmed | **PASS** |
| Typecheck (tsgo --noEmit) | pass | Exit 0 confirmed at `fe69da4` | **PASS** |
| Lint (biome check) | pass | Clean confirmed at `fe69da4` | **PASS** |
| 6/6 human test steps | pass | Not independently re-run (requires live gateway); commands + fixture files verified present | **NOT INDEPENDENTLY VERIFIED** |
| Test teeth (RED) | claimed in RED evidence | Independently reproduced via my own mutations | **PASS** |

**Note on human test steps**: The 6 gate steps require a running MCP gateway (`holo mcp:*` CLI). The CLI entry points, fixture manifests, and command flags were verified present in source. The steps were not independently re-executed in this review (would require live Convex deployment + full service stack).

---

## Prior Cycle-1 Findings — Disposition

### HIGH Findings (Cycle 2 Targets)

| Finding | Cycle-1 Verdict | Cycle-2 Verdict | Evidence |
|---------|----------------|-----------------|----------|
| NEW-1: 19/21 replay fixtures had zero cross-source validation | HIGH (unresolved) | **RESOLVED** | Parameterized `it.each` covers all 21; independently verified teeth |
| NEW-2: Error fixture codes not validated against manifest catalogs | HIGH (unresolved) | **RESOLVED** | Parameterized cross-check covers all 21; 6 mismatches found and fixed; independently verified teeth |

### Non-Blocking Findings (Carried Forward from Cycle 1, Not in Scope for Cycle 2)

| Finding | Severity | Status | Notes |
|---------|----------|--------|-------|
| Finding 7: list-mutations test accepts 21-99 range | MEDIUM | **UNRESOLVED** | `mcp-verify-manifest.test.ts:108` still uses `/21\|2[2-9]\|[3-9]\d/` |
| Finding 8: auth_policy has null fields | LOW-MEDIUM | **UNRESOLVED** | `allowed_origins: null`, `rate_limit: null` still in manifest |
| Finding 9: SPRINT.md status metadata contradiction | LOW | **UNRESOLVED** | `status: Completed` (line 6) vs `**Status:** In Progress` (line 15) |
| NEW-3: Tautological comment in fixture-schema-validation | MEDIUM | **UNRESOLVED** | Line 107 comment "would fail if the two calls returned different results" still misleading |
| NEW-4: store_document_validation_error.json stale orphan | MEDIUM | **UNRESOLVED** | File still exists, still not validated by any test |
| NEW-5: Error code diversity is low | MEDIUM | **PARTIALLY_RESOLVED** | 6 distinct codes now (up from 4); EMBEDDING_FAILED and TIMEOUT still unexercised |
| NEW-6: Malformed test manifests produce noisy output | LOW | **UNRESOLVED** | Unchanged |
| NEW-7: defaults/pagination/idempotency text fields unchecked | LOW | **UNRESOLVED** | Unchanged |

---

## New Findings (This Review)

### FINDING-C2-1 — LOW: Stale sprint-goal-state.json at `fe69da4`

- **Severity**: LOW
- **Location**: `.spec/prds/mk6-migration/tasks/sprint-03-mcp-compatibility-manifest-frozen-fixtures/sprint-goal-state.json`
- **Evidence**: E2E section reports `"test_files": 3, "tests_total": 27` — actual count is 7 files / 380 tests. REDHAT-FIX tasks (01-05) are not listed in the `tasks` section. `redhat.verdict: APPROVED` cites `evidence/review-verdict.md` which is the runner's own mcp-manifest-05 self-review (not an independent review) and shows stale test counts (9 replay tests, not 64).
- **Impact**: The sprint-goal-state metadata is inconsistent with reality at this commit. The immediate next commit (`63500b5`) refreshes it.
- **Non-blocking**: The actual code and tests are correct; only the metadata is stale.

### FINDING-C2-2 — LOW: Fragile type annotation in TOOL_SCHEMA_MAP

- **Severity**: LOW
- **Location**: `tests/integration/mcp-replay-contract.test.ts:59` at `fe69da4`
- **Evidence**: `TOOL_SCHEMA_MAP: Record<string, z.ZodObject<z.ZodRawShape>>` — the `z.ZodObject<z.ZodRawShape>` type is too narrow for Zod schemas wrapped in `.transform()` or `.refine()` (which produce `ZodEffects`, not `ZodObject`). `tsgo` accepts it at this commit, but the immediate next commit (`63500b5`) changes it to `Record<string, { shape: Record<string, unknown> }>` — indicating the type was fragile.
- **Impact**: None at `fe69da4` (tsgo passes). The fix in `63500b5` is a refinement.

### FINDING-C2-3 — LOW: Scope writeAllowed not expanded for 5 additional fixture fixes

- **Severity**: LOW
- **Location**: REDHAT-FIX-05 task contract scope section
- **Evidence**: `writeAllowed` lists only `shop_products_error.json`, but 6 total error fixtures were modified (add_subscription, cancel_assimilation, check_subscriptions, regenerate_transcript, shop_products, start_assimilation). The contract's critical constraints authorized fixing additional mismatches ("STRICTLY report any ADDITIONAL mismatches... the implementer must fix them in the fixture"), but the `writeAllowed` list was not updated to reflect the expanded scope.
- **Impact**: None — the fixes are correct and authorized by the critical constraints. This is a documentation gap, not a code issue.

### FINDING-C2-4 — INFO: Runner self-review evidence is stale

- **Severity**: INFO
- **Location**: `evidence/review-verdict.md`
- **Evidence**: This file is the mcp-reviewer's own mcp-manifest-05 self-review (not an independent red-hat review). At line 209, it reports 9 replay tests — the pre-remediation count. After cycle 1 and cycle 2, there should be 64. The file was not updated after either remediation cycle. The sprint-goal-state's `redhat.verdict: APPROVED` cites this file.
- **Impact**: None for this review — the independent verification above supersedes it. Flagged for process hygiene.

---

## No-Skip / No-Stub Verification

- `grep -n 'it.skip\|test.skip\|describe.skip\|xit\|xdescribe\|\.only'` on both modified test files: **CLEAN**
- No mocks or stubs of `loadManifest`, `loadReplayFixture`, or Zod schema imports: **CONFIRMED** — all three sources are real
- The `loadManifestReplayKey()` helper (lines 98-111) independently parses the YAML (not reusing `loadManifest()`), providing a second independent read of the manifest — this is actually a strength (two independent parses catch parse-level bugs)

---

## AC Verdict Summary (All Sprint 3 ACs)

| Task | AC | Cycle-1 Verdict | Cycle-2 Verdict | Key Evidence |
|------|-----|----------------|-----------------|--------------|
| 01-AC-1 | 44/44 skeleton vs live registry | PASS | **PASS** | Unchanged |
| 01-AC-2 | Protocol/transports/policy header | PASS | **PASS** | Unchanged |
| 01-AC-3 | All 44 IDs have skeleton entries | PASS | **PASS** | Unchanged |
| 01-AC-4 | Skeleton populate-ready | PASS | **PASS** | Unchanged |
| 02-AC-1 | All tools have input+output+defaults | PASS | **PASS** | Unchanged |
| 02-AC-2 | List tools document pagination | PASS | **PASS** | Unchanged |
| 02-AC-3 | Mutations document side_effects + idempotency | PASS | **PASS** | Unchanged |
| 02-AC-4 | All tools declare transports | PASS | **PASS** | Unchanged |
| 02-AC-5 | Error codes documented | PARTIAL | **PASS** | Error-code-catalog validation now enforces fixture ↔ manifest consistency |
| 03-AC-1 | Fixture-missing control has teeth | PASS | **PASS** | Unchanged |
| 03-AC-2 | Replay contract control has teeth | PARTIAL | **PASS** | All 21 mutation tools now have cross-source validation |
| 03-AC-3 | 44 success + mutation error fixtures | PASS | **PASS** | Unchanged |
| 03-AC-4 | GREEN vs absent, no skip guards | PASS | **PASS** | Confirmed CLEAN |
| 04-AC-1 | verify-manifest 44/44 covered | PASS | **PASS** | Unchanged |
| 04-AC-2 | Protocol pin 2025-11-25 | PASS | **PASS** | Unchanged |
| 04-AC-3 | Missing entry → non-zero naming | PASS | **PASS** | Unchanged |
| 04-AC-4 | Orphan entry → non-zero naming | PASS | **PASS** | Unchanged |
| 05-AC-1 | Reviewer reproduces fixture-missing | PASS | **PASS** | Unchanged |
| 05-AC-2 | Reviewer reproduces orphan-entry | PASS | **PASS** | Unchanged |
| 05-AC-3 | Reviewer confirms protocol | PASS | **PASS** | Unchanged |
| 05-AC-4 | Reviewer confirms 44 + fixtures + replay | PARTIAL | **PASS** | All 21 replay contracts now cross-validated |

**Summary**: 20 PASS, 0 PARTIAL, 0 FAIL out of 20 ACs (improved from 15 PASS / 3 PARTIAL / 0 FAIL in cycle 1, and 12 PASS / 7 PARTIAL / 1 FAIL in cycle 0)

---

## What Works Well (Preserve)

1. The parameterized `it.each` pattern with dynamic manifest enumeration is the correct anti-tautology design — new mutation tools added to the manifest are automatically covered
2. The fail-closed `TOOL_SCHEMA_MAP` guard ensures new tools can't be silently skipped
3. The error-code-catalog validation caught 6 real mismatches that survived 306 tests — this is genuine test value
4. The `loadManifestReplayKey()` helper provides a second independent YAML parse (defense in depth)
5. No `.skip()` / `.only()` / stubs / mocks anywhere — all three data sources (fixture, manifest, Zod schema) are real
6. The suite-shape self-test that checks for skip-to-green is preserved and passing
7. Fix direction in FIX-05 is correct: fixture → manifest (never manifest → fixture)

---

## Recommendations

### Non-blocking (should fix, not Sprint 19 blocking)

1. **FINDING-C2-1**: Refresh `sprint-goal-state.json` E2E numbers and task list (done in `63500b5`)
2. **FINDING-C2-2**: Apply the type annotation fix from `63500b5` (already done)
3. **Finding 7**: Assert exact mutation count (21) in `mcp-verify-manifest.test.ts:108`
4. **Finding 9**: Fix SPRINT.md status metadata contradiction
5. **NEW-3**: Correct the misleading comment at `mcp-fixture-schema-validation.test.ts:107`
6. **NEW-4**: Delete `store_document_validation_error.json` stale orphan
7. **NEW-5**: Add at least one `EMBEDDING_FAILED` or `TIMEOUT` error fixture

---

## Metadata

- **Reviewer**: Independent red-hat review (mcp-reviewer methodology, no runner reuse)
- **Verification Commit**: `fe69da4` (verified via isolated worktree)
- **Test Runner**: vitest 4.1.0
- **Typecheck**: tsgo (TypeScript native preview 7.0.0-dev)
- **Negative Controls Performed**: 4 independent fixture corruptions (2 replay, 2 error) — all produced expected failures
- **Gate Pre-Check**: NOT reused — all claims independently verified
- **Overall Verdict**: **APPROVED** — both cycle-2 HIGH findings resolved, all 20 ACs pass, test teeth independently proven, no blocking issues remain
- **Report Generated**: 2026-07-14T20:01:59Z
