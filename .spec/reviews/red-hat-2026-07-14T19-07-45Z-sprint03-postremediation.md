# Red-Hat Review Report (Post-Remediation) — Sprint 3: MCP Compatibility Manifest and Frozen Fixtures

**Report Date**: 2026-07-14T19:07:45Z
**Target**: Sprint 3 — MCP Compatibility Manifest and Frozen Fixtures (`.spec/prds/mk6-migration/tasks/sprint-03-mcp-compatibility-manifest-frozen-fixtures/`)
**Reviewed At**: commit `2ae4960` (post-redhat-remediation on `main`)
**Reviewed By**: mcp-reviewer, mastra-reviewer
**Prior Report**: `.spec/reviews/red-hat-2026-07-14T19-30-00Z-sprint03.md` (12 findings: 1 CRITICAL, 2 HIGH, 5 MEDIUM, 4 LOW)
**Prior Verdict**: NEEDS_FIXES

## Executive Summary

The remediation (commits `f4309fd` → `7a47ec6` → `5870fe1` → `2ae4960`) made genuine progress: the CRITICAL replay tautology was eliminated for 2/21 tools via real cross-source validation (fixture ↔ manifest YAML ↔ Zod schema), the verify-manifest gate expanded from 4 to 9 field checks, fixture coverage expanded from 3→22 error and 2→21 replay files, all 89 fixtures are annotated `representative_example: true`, and the fixture-file-removed negative control properly exercises the `fixtures_missing` branch. Of 9 prior findings re-verified, 5 are RESOLVED, 2 are PARTIALLY_RESOLVED, and 3 remain UNRESOLVED. Two new HIGH issues were identified: 19/21 replay fixtures have zero cross-source idempotency validation, and error fixture codes are not validated against manifest error catalogs (proven by `shop_products` mismatch).

**Verdict: NEEDS_FIXES** (improved from prior — no remaining CRITICAL, but 2 new HIGH findings)

---

## Human Testing Gate Pre-Check (Deterministic — skill-emitted)

### Executability Check
All 6 gate steps reference real entry points confirmed in code:
1. `bun services/platform/src/cli/holo.ts mcp:verify-manifest` — CLI exists, command wired ✓
2. `--manifest manifest-missing-store_document.yaml` — fixture file exists ✓
3. `holo mcp:manifest-schema store_document` — command exists ✓
4. `holo mcp:manifest-replay add_subscription` — command exists ✓
5. `holo mcp:verify-manifest --protocol` — flag parsed in `holo.ts` ✓
6. `holo mcp:list-mutations` — command exists ✓

**Gate executability: PASS** — no auto-findings.

### Evidence Freshness Check
- `gate-results.json` exists with `verdict: "pass"`, `steps_executed: 6`, `steps_total: 6` ✓
- `executed_at: 2026-07-14T12:55:00Z`, `remediation_cycle: 1` ✓
- File committed in `2ae4960` (final sprint commit), fresh relative to source ✓
- Claims 306/306 tests across 7 test files — 7 test files confirmed on disk ✓

**Gate evidence: PASS** — no auto-findings.

---

## Prior Finding Disposition (Re-verified Against Current Code at `2ae4960`)

### Finding 1 (was CRITICAL) — Replay contract tests were pure tautology → **PARTIALLY_RESOLVED**

- **Confidence**: HIGH (both agents agree)
- **Evidence of fix**: `tests/integration/mcp-replay-contract.test.ts:1-131` — now imports real `AddSubscriptionSchema` and `StoreDocumentSchema` from `holocron-mcp/src/config/validation` (line 16-19), loads the manifest YAML via `loadManifestReplayKey()` (lines 41-54), and cross-validates:
  1. Fixture `idempotency_key` === manifest `replay.idempotency_key` (lines 60-61, 92-93)
  2. Manifest key fields exist in real Zod `.shape` (lines 64-68, 96-100)
  3. Fixture key fields exist in real Zod `.shape` (lines 70-74, 102-106)
- **Old tautological pattern**: eliminated — `rg -n 'first_call_result.*===.*second_call_result' tests/` returns CLEAN
- **Remaining gap**: Cross-source validation covers only **2 of 21** mutation tools (`add_subscription`, `store_document`). The other 19 replay fixtures have **no** cross-source idempotency validation. The `mcp-fixture-schema-validation.test.ts:106-112` assertion (`second_call_result === first_call_result`) across all 21 fixtures is inherently tautological (both values from the same JSON file) — it validates fixture internal shape, not behavioral idempotency.
- **Downgrade**: CRITICAL → **HIGH** (the pattern was proven correct for 2 tools; the gap is coverage breadth, not fundamental test theatre)

---

### Finding 2 (was HIGH) — All fixtures were hand-authored synthetic data without annotation → **RESOLVED**

- **Confidence**: HIGH (both agents agree)
- **Evidence**: All 89 JSON fixture files (44 success + 22 error + 21 replay + 2 other) contain `"representative_example": true` at top level. Verified via `rg -c 'representative_example' services/platform/tests/fixtures/mcp-manifest/ | wc -l` = 89. The `mcp-fixture-placeholder-audit.test.ts:52-88` enforces the binary: either annotated OR no placeholder patterns. Pattern list (lines 18-41) is comprehensive (covers `kg_doc_store_`, `B0XXXXX`, `fake-id`, `placeholder`, `dummy`, etc.).
- **Note**: Fixtures are still synthetic (not captured from real tool execution), but now honestly labeled. The AC was satisfied by annotation, not capture.

---

### Finding 3 (was HIGH) — verify-manifest gate validated only 4 of 10+ fields → **RESOLVED**

- **Confidence**: HIGH (both agents agree)
- **Evidence**: `services/platform/src/mcp/verify-manifest.ts:64-117` now checks 9 issue kinds:
  1. `not_in_manifest` (line 56-62)
  2. `input_schema_null` (line 64-70)
  3. **`output_schema_null`** (line 71-77) — NEW
  4. `transports_null` (line 78-84)
  5. **`errors_empty_mutation`** (line 86-92) — NEW (mutations only)
  6. **`replay_null_mutation`** (line 93-99) — NEW (mutations only)
  7. `fixtures_missing` (success fixture, line 100-107)
  8. **`error_fixture_missing`** (line 108-117) — NEW (mutations only)
  - The covered-count computation (lines 142-158) mirrors all checks — a tool with null output_schema is excluded from coverage.
- `isMutation` detection at line 85 (`entry.side_effects != null && entry.side_effects !== ''`) is correct: verified all 21 mutations have descriptive strings, all 23 non-mutations have `null`.
- Field-validation test at `tests/integration/mcp-verify-manifest-field-validation.test.ts:47-94` proves each new check fails closed via real malformed YAML manifests.
- **Minor gap**: `defaults`, `pagination`, `idempotency` text content, and the `fixtures` field (still `null` on all 44 entries) remain unchecked. Non-blocking for the AC contract.

---

### Finding 4 (was MEDIUM) — Error fixtures covered only 3/21 mutation tools → **RESOLVED**

- **Confidence**: HIGH (both agents agree)
- **Evidence**: 22 `*_error.json` files on disk (up from 3). `mcp-fixture-coverage.test.ts:39-48` enforces every mutation tool has `{tool_id}_error.json`. Error codes: NOT_FOUND (13), VALIDATION_ERROR (5), BAD_REQUEST (2), CONFLICT (1), TIMEOUT (1). All 22 have non-empty code + message. Schema validation test enforces structure.
- **Note**: `store_document_validation_error.json` (old fixture from pre-remediation) co-exists with the new `store_document_error.json` — see NEW-4 below.

---

### Finding 5 (was MEDIUM) — Replay fixtures covered only 2/21 mutation tools → **RESOLVED** (count) / **PARTIALLY** (validation)

- **Confidence**: HIGH (both agents agree)
- **Evidence**: 21 `*_replay.json` files on disk (up from 2). `mcp-fixture-coverage.test.ts:62-72` enforces every mutation tool has `{tool_id}_replay.json`. Each fixture has `idempotency_key` array, `stored_result` string, `first_call_result`, `second_call_result`.
- **Remaining gap**: Only 2/21 fixtures have cross-source idempotency validation (see Finding 1 disposition).

---

### Finding 6 (was MEDIUM) — Fixture-missing control tested manifest-entry-missing, not fixture-file-missing → **RESOLVED**

- **Confidence**: HIGH (both agents agree)
- **Evidence**: `tests/integration/mcp-manifest-negative-controls.test.ts:81-105` — creates a temp directory via `mkdtempSync`, copies all fixtures via `cpSync`, removes `store_document_success.json` via `rmSync`, asserts file is deleted, runs `holo mcp:verify-manifest --manifest MANIFEST --fixtures-dir tmpDir`, asserts exit ≠ 0, output matches `store_document`, output matches `fixtures missing`. Properly cleans up in `finally` block. This exercises the `fixtures_missing` code path at `verify-manifest.ts:100-107`, distinct from the manifest-entry-missing test at line 63.

---

### Finding 7 (was MEDIUM) — list-mutations test accepts 21-99 range → **UNRESOLVED**

- **Confidence**: HIGH (both agents agree)
- **Location**: `tests/integration/mcp-verify-manifest.test.ts:108`
- **Evidence**: `expect(out).toMatch(/21|2[2-9]|[3-9]\d/)` — still matches any count from 21 to 99. A manifest with 50 fake mutation tools would pass.
- **Mitigating factor**: `mcp-fixture-coverage.test.ts:76-79` independently asserts `mutationTools.length >= 21`. Neither test pins the exact count.

---

### Finding 8 (was LOW-MEDIUM) — auth_policy has null fields → **UNRESOLVED**

- **Confidence**: HIGH (both agents agree)
- **Location**: `14-mcp-compatibility-manifest.yaml:24-25`
- **Evidence**: `allowed_origins: null  # mcp-manifest-02 to populate` and `rate_limit: null  # mcp-manifest-02 to populate`. mcp-manifest-02 is marked complete but these remain null. The gate's `buildProtocolReport` passes because it checks `authKeys.length > 0`, not value population.

---

### Finding 9 (was LOW) — SPRINT.md status metadata contradiction → **UNRESOLVED**

- **Confidence**: HIGH (both agents agree)
- **Location**: `SPRINT.md:6` (`status: Completed`) vs `SPRINT.md:15` (`**Status:** In Progress`)
- **Evidence**: Direct contradiction unchanged by remediation.

---

## NEW HIGH Confidence Findings (Both Agents Agree)

### NEW-1 — HIGH: 19/21 replay fixtures have ZERO cross-source idempotency validation

- **Severity**: HIGH
- **Confidence**: HIGH (both agents agree)
- **Location**: `tests/integration/mcp-replay-contract.test.ts:56-118` — only `add_subscription` (line 56) and `store_document` (line 88) have describe blocks
- **Evidence**: `loadManifestReplayKey()` is called at exactly 2 call sites. The remaining 19 mutation tools' replay fixtures exist on disk with `idempotency_key` arrays, but those arrays are never validated against the manifest's `replay.idempotency_key` or the real Zod schema. A wrong idempotency key in `start_assimilation_replay.json`, `assimilate_creator_replay.json`, etc. would go undetected by all tests.
- **Risk**: Sprint 19's rehost trusts replay contracts for all 21 mutation tools. 90.5% of those contracts are presence-on-disk checks only.
- **Fix**: Parameterize the cross-source validation across all 21 mutation tools using `it.each(mutationTools)` with per-tool Zod schema loading.

---

### NEW-2 — HIGH: Error fixture codes are NOT validated against manifest error catalogs (proven mismatch)

- **Severity**: HIGH
- **Confidence**: HIGH (both agents agree; mcp-reviewer found the proof)
- **Location**: No test exists; proven mismatch in `shop_products`
- **Evidence**: 
  - `shop_products_error.json:3` has `"code": "VALIDATION_ERROR"`
  - `14-mcp-compatibility-manifest.yaml` declares `shop_products` errors as `INTERNAL_SERVER_ERROR` and `TIMEOUT` only
  - `VALIDATION_ERROR` is NOT in the manifest's error catalog for `shop_products`
  - No test in any of the 7 test files reads the manifest's `errors[]` array and cross-checks the fixture's `code` field
  - This mismatch survives all 306 tests
- **Risk**: Any error fixture could contain any arbitrary error code and pass the entire suite. Sprint 19 contract tests comparing against frozen fixtures would test the wrong error path.
- **Fix**: Add a cross-check test that loads each tool's manifest `errors[]` array and asserts the `{tool_id}_error.json` fixture's `code` is in that array.

---

## NEW MEDIUM Confidence Findings (Both Agents Agree)

### NEW-3 — MEDIUM: Tautological assertion in fixture-schema-validation across ALL 21 replay fixtures

- **Severity**: MEDIUM
- **Confidence**: HIGH (both agents agree)
- **Location**: `tests/integration/mcp-fixture-schema-validation.test.ts:106-112`
- **Evidence**: `it.each(replayFiles)` asserts `second_call_result === first_call_result` by reading both from the SAME JSON file. The comment claims "would fail if the two calls returned different results (breaking idempotency)" — this is misleading. No real tool calls are made. The assertion can only fail if the fixture author accidentally writes mismatched JSON.
- **Assessment**: Acceptable as a structural shape check, but the comment is false and should be corrected to "validates fixture internal consistency." The real behavioral proof lives in `mcp-replay-contract.test.ts` (for 2/21 tools only — see NEW-1).

---

### NEW-4 — MEDIUM: `store_document_validation_error.json` is a stale orphan duplicate

- **Severity**: MEDIUM
- **Confidence**: HIGH (both agents agree)
- **Location**: `services/platform/tests/fixtures/mcp-manifest/store_document_validation_error.json`
- **Evidence**: This file predates remediation. The gate only checks `{toolId}_error.json` = `store_document_error.json`. The `_validation_error.json` naming does NOT match `*_error.json` glob in `mcp-fixture-schema-validation.test.ts` (which uses `endsWith('_error.json')`), so it's not even validated by the schema test. Zero test references outside the fixtures directory. It is dead weight that inflates the file count to 22 instead of 21.
- **Fix**: Delete `store_document_validation_error.json`.

---

### NEW-5 — MEDIUM: Error code diversity is low — NOT_FOUND dominates at 59%

- **Severity**: MEDIUM
- **Confidence**: HIGH (mcp-reviewer primary, mastra-reviewer confirms)
- **Evidence**: 13 of 22 error fixtures use `NOT_FOUND`. Only 4 distinct codes exist (NOT_FOUND, VALIDATION_ERROR, BAD_REQUEST, CONFLICT, TIMEOUT). The manifest declares richer error codes (EMBEDDING_FAILED, INTERNAL_SERVER_ERROR) that no fixture exercises.
- **Risk**: Sprint 19 contract tests comparing against frozen fixtures only test the NOT_FOUND path. EMBEDDING_FAILED and INTERNAL_SERVER_ERROR regressions won't be caught.

---

## NEW LOW Confidence Findings

### NEW-6 — LOW: Malformed test manifests produce noisy output (43 false-positive errors per run)

- **Severity**: LOW
- **Location**: `services/platform/tests/fixtures/mcp-manifest/malformed/*.yaml`
- **Evidence**: Each malformed YAML contains only ONE tool entry. When the gate runs, it flags ALL 43 other registered tools as `not_in_manifest` in addition to the intended field violation. Tests pass (they match specific tool + field), but a human running this manually sees 44 issues, not 1.

---

### NEW-7 — LOW: `defaults`, `pagination`, `idempotency` text fields still unchecked by gate

- **Severity**: LOW
- **Location**: `services/platform/src/mcp/verify-manifest.ts` — no checks for defaults/pagination/idempotency content
- **Evidence**: The gate now validates output_schema, errors, replay, and fixture existence. But it does not validate the `defaults` object, `pagination` block, `idempotency` text field, or the `fixtures` field (still `null` on all 44 entries). Non-blocking for the current AC contract.

---

## Agent Contradictions & Debates

| Topic | mcp-reviewer | mastra-reviewer | Assessment |
|-------|-------------|-----------------|------------|
| Finding 2 (fixture annotation) | PARTIALLY_RESOLVED — annotation present but shop_products code mismatch proves quality gap | RESOLVED — annotation universal and enforced | **Resolved as RESOLVED** — the annotation requirement is met; the code mismatch is a separate finding (NEW-2) |
| Finding 4 (error fixtures) | PARTIALLY_RESOLVED — 22 fixtures exist but error code cross-check gap + orphan | RESOLVED — 22 files, all mutation tools covered | **Resolved as RESOLVED with caveats** — the coverage requirement is met; quality gaps are NEW-2, NEW-4, NEW-5 |
| Error code cross-check severity | HIGH — proven mismatch | LOW-MEDIUM — spot-checked 4 tools, no mismatch found | **Resolved as HIGH** — mcp-reviewer's shop_products proof is irrefutable; mastra-reviewer's spot-check missed it |
| Overall sprint readiness for Sprint 19 | NEEDS_FIXES — 19/21 gap is blocking | REQUEST CHANGES — not blocking, but 19/21 should be fixed | **Not blocking, but should fix** — the pattern works for 2 tools, Sprint 19 can trust field presence but not full replay correctness |

---

## Prior AC Verdict Summary (Re-verified)

| Task | AC | Prior Verdict (1st review) | Remediation Verdict (2nd review) | Key Evidence |
|------|-----|---------------------------|----------------------------------|--------------|
| 01-AC-1 | 44/44 skeleton vs live registry | PASS | **PASS** | Unchanged — registry reader still genuine |
| 01-AC-2 | Protocol/transports/policy header | PASS | **PASS** | Unchanged |
| 01-AC-3 | All 44 IDs have skeleton entries | PASS | **PASS** | Unchanged |
| 01-AC-4 | Skeleton populate-ready | PASS | **PASS** | Unchanged |
| 02-AC-1 | All tools have input+output+defaults | PARTIAL | **PASS** | Gate now validates output_schema |
| 02-AC-2 | List tools document pagination | PASS | **PASS** | Unchanged |
| 02-AC-3 | Mutations document side_effects + idempotency | PASS | **PASS** | Unchanged |
| 02-AC-4 | All tools declare transports | PASS | **PASS** | Unchanged |
| 02-AC-5 | Error codes documented | PARTIAL | **PARTIAL** | Error fixtures exist but codes not cross-checked vs manifest (NEW-2) |
| 03-AC-1 | Fixture-missing control has teeth | PARTIAL | **PASS** | Fixture-file-removed test added |
| 03-AC-2 | Replay contract control has teeth | FAIL | **PARTIAL** | Tautology fixed for 2/21; 19/21 still structural-only (NEW-1) |
| 03-AC-3 | 44 success + mutation error fixtures | PARTIAL | **PASS** | 44 success + 22 error + 21 replay; all annotated |
| 03-AC-4 | GREEN vs absent, no skip guards | PASS | **PASS** | No skip guards; confirmed CLEAN |
| 04-AC-1 | verify-manifest 44/44 covered | PASS | **PASS** | Gate now validates 9 fields; coverage count enforces all |
| 04-AC-2 | Protocol pin 2025-11-25 | PASS | **PASS** | Unchanged |
| 04-AC-3 | Missing entry → non-zero naming | PASS | **PASS** | Unchanged |
| 04-AC-4 | Orphan entry → non-zero naming | PASS | **PASS** | Unchanged |
| 05-AC-1 | Reviewer reproduces fixture-missing | PARTIAL | **PASS** | Both manifest-entry and fixture-file controls now tested |
| 05-AC-2 | Reviewer reproduces orphan-entry | PASS | **PASS** | Unchanged |
| 05-AC-3 | Reviewer confirms protocol | PASS | **PASS** | Unchanged |
| 05-AC-4 | Reviewer confirms 44 + fixtures + replay | PARTIAL | **PARTIAL** | Coverage expanded; cross-validation still 2/21 |

**Summary**: 15 PASS, 3 PARTIAL, 0 FAIL out of 20 ACs (improved from 12 PASS, 7 PARTIAL, 1 FAIL)

---

## Recommendations by Category

### 1. Blocking for Sprint 19 trust (should fix before rehost)

- **NEW-1**: Parameterize the cross-source replay validation (`mcp-replay-contract.test.ts`) across all 21 mutation tools. The pattern is proven for 2 tools — convert the 2 hardcoded `describe` blocks into `it.each(mutationTools)` with per-tool Zod schema loading.
- **NEW-2**: Add a cross-check test that loads each tool's manifest `errors[]` array and asserts the fixture's `code` field is in that array. Fix the `shop_products` mismatch.

### 2. Non-blocking improvements (should fix, not Sprint 19 blocking)

- **NEW-4**: Delete `store_document_validation_error.json` stale orphan.
- **NEW-3**: Correct the misleading comment at `mcp-fixture-schema-validation.test.ts:106` to "validates fixture internal consistency" (not "would fail if calls returned different results").
- **Finding 7**: Assert exact mutation count (21) in `mcp-verify-manifest.test.ts:108`, not a 21-99 range.
- **Finding 8**: Populate `allowed_origins` and `rate_limit` in the manifest, or document why they remain null.
- **Finding 9**: Fix SPRINT.md status metadata contradiction (line 6 vs line 15).
- **NEW-5**: Diversify error fixture codes — add at least one EMBEDDING_FAILED or INTERNAL_SERVER_ERROR fixture.
- **NEW-7**: Populate the `fixtures` field in the manifest, or remove the vestigial field.

### 3. What works well (preserve)

- The registry reader genuinely cross-checks against live `stdio.ts` source — not self-referential
- The gate's 9 issue kinds have real teeth — malformed YAML fixtures prove each fails closed
- The fixture-file-removed negative control (tmpdir + rmSync + --fixtures-dir) is well-designed
- The placeholder audit test is comprehensive and actively enforces annotation
- The cross-source replay validation pattern (fixture ↔ YAML ↔ Zod) is correct for the 2 tools it covers
- No `it.skip`/`test.skip` guards anywhere — confirmed CLEAN
- Malformed YAML manifests are real, structured test artifacts (not empty files)
- 306 tests across 7 files is a genuine test suite (not padded)

---

## Metadata

- **Agents**: mcp-reviewer (protocol compliance, stub detection, TDD evidence), mastra-reviewer (agent/tool correctness, stub detection, tripwire coverage)
- **Confidence Framework**: HIGH (both agents agree), MEDIUM (both agents agree, lower severity), LOW (single agent)
- **Gate Pre-Check**: Executability PASS, Evidence PASS — no auto-findings
- **Independent Verification**: All code verified against current `main` at `2ae4960`; no reliance on prior gate files or remediation commit messages
- **Prior Review Verdict**: NEEDS_FIXES (12 findings)
- **Current Verdict**: NEEDS_FIXES (7 findings: 2 HIGH, 3 MEDIUM, 2 LOW — down from 1 CRITICAL + 2 HIGH + 5 MEDIUM + 4 LOW)
- **Report Generated**: 2026-07-14T19:07:45Z
- **Next Steps**: Fix NEW-1 (parameterize replay cross-validation) and NEW-2 (error code cross-check) before Sprint 19 can fully trust replay contracts
