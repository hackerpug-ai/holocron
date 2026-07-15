# Gate Results: sprint-02-convex-source-catalog-asset-inventory

## VERIFIED — recomputed pass == claimed pass; 6/6 recomputed; 0 discrepancies

Proof: /Users/justinrich/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-02-convex-source-catalog-asset-inventory/gate-verification.json
Run: 2026-07-14T16:10:43.866Z
Exec pane: surface:68 (DE42BCE4-4499-4A4F-855C-AAA2906D037A)
UI driver: none (terminal-only gate)
Environment: real Convex export at /tmp/sprint02-live-export-9759/export-dir

## Summary

- Passed: 6/6
- Failed: 0
- Wiring gaps: 0
- Deterministic proof: verified=true, zero discrepancies

## Per-Step Results

| # | Gate | Method | Result | Evidence | Log |
|---:|---|---|---|---|---|
| 1 | Run holo catalog:verify against a real convex export — reports 60/60 tables each with an approved disposition. | real-cli | PASS | 60/60 tables approved | /tmp/holocron-gate-sprint-02-convex-source-catalog-asset-inventory-rerun-20260714T1612Z/step1.log |
| 2 | Run holo catalog:coverage — every field and storage reference maps to preserve/merge/drop/regenerate/archive with owner+approval. | real-cli | PASS | fields_mapped: 797 | /tmp/holocron-gate-sprint-02-convex-source-catalog-asset-inventory-rerun-20260714T1612Z/step2.log |
| 3 | Delete one table's entry and re-run holo catalog:verify — exits non-zero naming the unmapped table. | real-cli | PASS | - unmapped table: voiceCommands | /tmp/holocron-gate-sprint-02-convex-source-catalog-asset-inventory-rerun-20260714T1612Z/step3.log |
| 4 | Run holo catalog:reconcile --dry-run — prints per-table expected-target count formulas and approved exceptions. | real-cli | PASS | agentPlans: source=0 expected=0 variance=0 disposition=preserve | /tmp/holocron-gate-sprint-02-convex-source-catalog-asset-inventory-rerun-20260714T1612Z/step4.log |
| 5 | Run holo catalog:assets — lists every retained storage object with legacy-ID, SHA-256, byte-length, MIME, target, disposition. | real-cli | PASS | retained_objects: 1192 | /tmp/holocron-gate-sprint-02-convex-source-catalog-asset-inventory-rerun-20260714T1612Z/step5.log |
| 6 | Run holo catalog:merges — reports business 12→3 and research 5→3 collapses with no per-domain shells in the targets. | real-cli | PASS | business: 12 → 3 (analysis_sessions, analysis_items, analysis_evidence) | /tmp/holocron-gate-sprint-02-convex-source-catalog-asset-inventory-rerun-20260714T1612Z/step6.log |

## Failures

None.

## Session Video

None; all documented steps were terminal CLI actions.

Raw evidence directory: /tmp/holocron-gate-sprint-02-convex-source-catalog-asset-inventory-rerun-20260714T1612Z

