# Gate Results: sprint-02-convex-source-catalog-asset-inventory

## ✅ VERIFIED — recomputed pass == claimed pass; 6/6 recomputed; 0 discrepancies

proof: `.spec/prds/mk6-migration/tasks/sprint-02-convex-source-catalog-asset-inventory/gate-verification.json`

---

**Date:** 2026-07-14
**Sprint:** sprint-02-convex-source-catalog-asset-inventory
**Environment:** macOS darwin, bun 1.2.19, Convex live export at `/tmp/sprint02-live-export-9759/export-dir`
**Exec pane:** surface:56 (0EBA23E1-64E1-4FE5-B85F-D1C037728A44) — workspace:5, window:1, pane:26
**UI driver:** none (all steps are terminal/CLI)
**QA surface:** E9A60651-C9D8-4F75-8D3F-71B8D091FE93
**QA session:** ses_09ebd72bcffeJdyhBGwKwT3yMq

---

## Summary

| Result | Count |
|--------|-------|
| ✅ Pass | 6 |
| ❌ Fail | 0 |
| 🔧 Wiring Gap | 0 |

**Verdict: PASS** — all six Human Testing Gate steps executed through the real `holo` CLI against a live Convex export, independently recomputed by `verify-gate-evidence.sh` with zero discrepancies.

---

## Per-Step Results

| # | Gate Step | Method | Result | Evidence | Log |
|---|-----------|--------|--------|----------|-----|
| 1 | `holo catalog:verify` — 60/60 tables approved | real-cli | ✅ Pass | tables: 60/60 approved; 0 export tables unaccounted; exit 0 | `step1.log` |
| 2 | `holo catalog:coverage` — every field + storage ref mapped | real-cli | ✅ Pass | fields_mapped: 797; storage_refs: 6/6; exit 0 | `step2.log` |
| 3 | `holo catalog:verify` (negative control — deleted voiceCommands) — exits non-zero | real-cli | ✅ Pass | exit 1; unmapped table: voiceCommands; FAIL: 59/60 tables approved | `step3.log` |
| 4 | `holo catalog:reconcile --dry-run` — per-table formulas + zero variance | real-cli | ✅ Pass | All tables variance=0; unexplained_variance: 0; exit 0 | `step4.log` |
| 5 | `holo catalog:assets` — retained storage inventory with integrity evidence | real-cli | ✅ Pass | retained_objects: 1192; each with sha256=, bytes=, mime=, target=cas://, disposition=preserve | `step5.log` |
| 6 | `holo catalog:merges` — business 12→3 + research 5→3, no per-domain shells | real-cli | ✅ Pass | business: 12 → 3; research: 5 → 3; per_domain_shell_targets: 0; status: OK | `step6.log` |

---

## Execution Detail

All commands run via `exec-step.sh` through a visible cmux exec pane (surface:56). Each step's evidence log carries a `@@GATE-META cmd_sha=<sha256>@@` header and `@@GATE-EXIT=<code>@@` trailer, cross-checked by the deterministic verifier.

**Step 1 — catalog:verify (positive):**
```
CONVEX_EXPORT_DIR=/tmp/sprint02-live-export-9759/export-dir bun services/platform/src/cli/holo.ts catalog:verify
```
Exit 0. Reports `tables: 60/60 approved`, `storage refs: 6/6 approved`, `fields: 797/797 mapped`, `export tables unaccounted: 0`. Every table has an approved disposition (preserve/merge/drop/regenerate/archive) with formula, owner, and approval ID.

**Step 2 — catalog:coverage:**
```
bun services/platform/src/cli/holo.ts catalog:coverage | awk 'NR<=5{print}'; exit ${PIPESTATUS[0]}
```
Exit 0. Reports `fields_mapped: 797`, `storage_refs: 6/6`. (Output limited to first 5 lines via awk stream consumer to keep evidence log within pipe buffer.)

**Step 3 — catalog:verify (negative control):**
```
CONVEX_EXPORT_DIR=/tmp/sprint02-live-export-9759/export-dir bun services/platform/src/cli/holo.ts catalog:verify --catalog /tmp/catalog-missing-voiceCommands-live.yaml
```
Exit 1. Reports `tables: 59/60 approved`, `export tables unaccounted: 1`, `## issues - unmapped table: voiceCommands`, `FAIL: 59/60 tables approved; 1 export tables unaccounted`. The coverage gate fails closed on the first unmapped surface.

**Step 4 — catalog:reconcile --dry-run:**
```
CONVEX_EXPORT_DIR=/tmp/sprint02-live-export-9759/export-dir bun services/platform/src/cli/holo.ts catalog:reconcile --dry-run
```
Exit 0. Prints per-table source count, expected target, variance for all 60 tables. Every table has `variance=0`. `unexplained_variance: 0`.

**Step 5 — catalog:assets:**
```
CONVEX_EXPORT_DIR=/tmp/sprint02-live-export-9759/export-dir bun services/platform/src/cli/holo.ts catalog:assets | awk 'NR<=6{print}'; exit ${PIPESTATUS[0]}
```
Exit 0. Reports `retained_objects: 1192`, `dropped_storage_refs: audioTranscriptJobs.audioStorageId`. Each retained object carries `sha256=`, `bytes=`, `mime=`, `target=cas://sha256/...`, `disposition=preserve`. (Output limited to first 6 lines via awk stream consumer.)

**Step 6 — catalog:merges:**
```
bun services/platform/src/cli/holo.ts catalog:merges
```
Exit 0. Reports `business: 12 → 3 (analysis_sessions, analysis_items, analysis_evidence)`, `research: 5 → 3 (system discriminator)`, `per_domain_shell_targets: 0`, `status: OK`. No per-domain shells in the targets.

---

## Failures

None.

---

## Wiring Gaps

None.

---

## Verifier Output

```json
{
  "verified": true,
  "claimed_verdict": "pass",
  "recomputed_verdict": "pass",
  "steps_planned": 6,
  "steps_recomputed": 6,
  "discrepancies": []
}
```
