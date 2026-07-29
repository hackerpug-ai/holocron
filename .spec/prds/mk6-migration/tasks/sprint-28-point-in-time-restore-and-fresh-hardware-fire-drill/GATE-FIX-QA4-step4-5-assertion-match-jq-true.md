# GATE-FIX-QA4 — Align step4/step5 gate assertions with jq -e scalar `true` output

> Status: ⬜ Pending  
> Sprint: [Sprint 28](./SPRINT.md)  
> Agent: devops-engineer  
> Reviewer: code-reviewer + product-manager  
> Priority: P0  
> Proposed By: independent Terra High QA fail `20260729T064907Z` on main `407fadb2` (verified, zero discrepancies)  
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes · PRODUCT_CODE: **no**  

## Outcome

Gate-plan step4 and step5 **assertions** match the actual successful output of their immutable `literal_cmd`s (jq -e prints only `true` on success). Deterministic recompute of preserved raw evidence `20260729T064907Z` yields **pass** for steps 4–5 under the corrected manifest; false jq / nonzero exit still fail.

This is **not** product code and **not** a weakening: command-fidelity SHA already proves the exact jq predicates ran (`LEDGER_CHECKSUM_MATCH==true` + 64-hex ledger; `BLOB_PARITY_PASS==true` + matched_objects≥1). Assertions must validate that success output, not demand tokens never printed by those commands.

## Evidence (immutable — do not rewrite)

| Item | Path |
|------|------|
| Fail run | `.gate-evidence/20260729T064907Z/` · `gate-results.json` run_id `20260729T064907Z` · 4/6 |
| Step4 log | exit 0 · body `true` · assert fails `require_all_regex: LEDGER_CHECKSUM_MATCH` |
| Step5 log | exit 0 · body `true` · assert fails `require_all_regex: BLOB_PARITY_PASS` |
| Verification | `gate-verification.json` verified:true, recomputed_verdict:fail, discrepancies:[] |
| QA | surface `F7197FC0-F556-499D-B09E-528FB3575F40` · session `019fac9f-c42c-7c92-b211-295f63d51fe1` |

All six `literal_cmd`s already executed with exit 0; product path green. Fail is **manifest assertion mismatch only**.

## MUST

- MUST preserve all six `literal_cmd` strings **byte-for-byte** (no edit)
- MUST change only step4 and step5 `assertion` objects in `gate-plan.json` so they match success output (`expected_exit: 0` + require match of anchored `true` / `^true$`)
- MUST add deterministic regression: recompute `.gate-evidence/20260729T064907Z` with corrected plan → steps 4–5 pass; inject false/nonzero still fails
- MUST NOT edit product code under `services/**`
- MUST NOT edit `gate-results.json`, `gate-verification.json`, `GATE-RESULTS.md`, or any prior `.gate-evidence/**` (including 20260729T064907Z)
- MUST NOT hand-write a green gate-results verdict
- NEVER `--no-verify` / hook bypass

## ACs

### AC-1 [PRIMARY] — Step4 assertion matches jq success output
GIVEN step4 `literal_cmd` unchanged  
WHEN assertion is applied to historical `step4.log` (contains `true`, exit 0)  
THEN step recompute result is pass  
AND assertion does not require substring `LEDGER_CHECKSUM_MATCH` in stdout  

### AC-2 — Step5 assertion matches jq success output  
Same for step5 / `BLOB_PARITY_PASS` token  

### AC-3 — Negative: false jq / exit 1 still fails
GIVEN synthetic false output for the same assertion kind  
WHEN recompute runs  
THEN step fails  

### AC-4 — All six literal_cmd strings unchanged byte-for-byte  

## VERIFY

Use `verify-gate-evidence.sh` (discover flags via `--help`) against evidence dir `20260729T064907Z` and corrected `gate-plan.json`; write recompute output under `.tmp/GATE-FIX-QA4/` only — never overwrite authoritative `gate-results.json`.

## WRITE-ALLOWED

- `gate-plan.json` (**assertion objects for steps 4 and 5 only**; literal_cmd frozen)
- Regression test/script under sprint dir, `scripts/`, or tests that does not mutate evidence
- Task file / SPRINT.md row / `.spec/reviews/*`
- `.tmp/GATE-FIX-QA4/**` local only

## WRITE-PROHIBITED

- `services/**` product code
- `gate-results.json`, `gate-verification.json`, `GATE-RESULTS.md`, `.gate-evidence/**`
- Changing any `literal_cmd`

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "GATE-FIX-QA4",
  "qa_run_id": "20260729T064907Z",
  "requirements": [{"id":"AC-1"},{"id":"AC-2"},{"id":"AC-3"},{"id":"AC-4"}],
  "tdd_mode": "red_first",
  "product_code": false
}
-->
