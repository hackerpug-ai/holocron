---
sequence: 32
timeline: Phase 7 — Cutover and Decommission
status: Blocked
planned_from_roadmap_sha: 69e4d2e0f3d3b7af03fb646bb706848d575b7b37c0199488beff185534335b0f
planned_from_source_sha: 13f93dc53c8516efd93368a9f0c0627aeb3af6f6
source_kind: prd-git
planned_at: 2026-08-09T20:32:57Z
capability_coverage: [CAP-CUT-01, CAP-BAK-01, CAP-DEP-01]
---

# Sprint 32: Convex Decommission and Portable Holocron Handoff

**Sequence:** 32
**Timeline:** Phase 7 — Cutover and Decommission
**Status:** Blocked
> Progress: 0/9 tasks completed · updated 2026-08-12
> Status-Note: D08-03 needs_ops: post-PONR restore ok; fk-audit orphans=2; no deletion-gate pass. D08-09 additionally needs an authorized second real tailnet device and operator drill window.
**Proposed by:** devops-engineer + integrator
**Milestone:** — (`sprint-32`)
**Branch:** `mk6-decommission`
**PR:** —

## Overview

This final migration sprint removes the remaining Convex code and dependencies, proves the app and MCP server operate without them, reruns the fresh-hardware restore, and completes a portable Apple-silicon server handoff before deleting the Convex cloud deployment. The handoff packages only the existing Bun server image and exact `postgres`, `mastra`, `scheduler`, and `zero-cache` Compose graph; exposes the backend only on `127.0.0.1:44111`; serves it privately on Tailscale HTTPS port 44111; and enforces a configurable aggregate container ceiling of 50 GiB with separate Docker Desktop VM and macOS headroom checks.

Source destruction is hard-blocked on Sprint 31's decommission-readiness inventory reporting zero capabilities whose sole implementation is Convex, the Sprint 28 recovery gate, and D08-09's two-real-device private deployment/recovery proof.

## Human Testing Gate

**Gate:** Before an operator deletes the Convex cloud deployment, a fresh restore and a two-real-device tailnet drill prove the portable `holocron` server is private, exact, persistent, recoverable, and independent of Convex.

## Human Test Deliverable

An operator-executed, evidence-backed sequence proving the repository, builds, restore path, portable M1 Docker runtime, private Tailscale Serve path, and post-deletion runtime have no reachable Convex surface.

## Test Steps

1. Run `holo verify:no-convex` over app/components/hooks/screens/lib/holocron-mcp/src and both package.json — zero hits.
2. Build the app, start the MCP server — both succeed with Convex/Cohere deps removed.
3. Check `python/` and `cli/` — both deleted; `ratatui-playground/` archived out of the repo.
4. Re-run the fresh-hardware fire-drill restore — passes as the final pre-deletion gate.
5. On the serving Mac, run portable host preflight: `linux/arm64`, target `holocron`, exact four services, loopback backend port 44111, two named volumes, safe secret paths, and selected container limits ≤50 GiB all pass before mutation.
6. Deploy the immutable release, configure private Tailscale Serve on HTTPS 44111 → `http://127.0.0.1:44111`, and verify the redacted deployment receipt against live Docker/Serve state.
7. Run the cold-host/lifecycle proof: four services recover, background Serve resumes, Postgres/blob sentinels persist, rollback preflight is non-destructive, and volume deletions remain zero.
8. From an authorized second real tailnet device, prove private health 200 and authenticated MCP 44 tools before/after Mastra restart; prove Postgres 503/recovery 200, no Funnel, and all three negative controls.
9. Delete the Convex cloud deployment only after D08-09 passes — confirm zero Convex surface reachable afterward.

## Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| D08-01 | RED: grep-clean + build-without-Convex-deps is the acceptance oracle | red-test-generator | 60 min |
| D08-02 | Remove Convex code/deps, delete dead clients, archive ratatui-playground | integrator | 180 min |
| D08-03 | Re-run the fresh-hardware fire-drill restore as the final pre-deletion gate | devops-engineer | 90 min |
| D08-04 | Author the decommission runbook (ordered, gated checklist) | devops-engineer | 60 min |
| D08-06 | Portable ARM64 private Compose runtime contract | mastra-implementer | 1–2 days |
| D08-07 | Portable host preflight, receipt, and private Serve verification | devops-engineer | 1 day |
| D08-08 | Cold-host bootstrap and managed macOS lifecycle | devops-engineer | 1 day |
| D08-09 | Cross-tailnet cold-host recovery drill | devops-engineer | 90 min + operator window |
| D08-05 | Delete the Convex cloud deployment (Operator-executed, irreversible; after D08-09) | devops-engineer | 45 min |

## Source Coverage

- UC-SYNC-05
- T-SYNC-015
- T-SYNC-016
- T-SYNC-017
- T-SYNC-018
- imp-plan-holocron-as-a-whole-1786510841 (binding `strategic` option; effective IMP-AC-1 through IMP-AC-20)

## Capability Coverage

- CAP-CUT-01: irreversible source-destruction (code + deps + cloud deployment) after recovery proof
- CAP-BAK-01: the final pre-deletion fresh restore drill re-run against post-PONR data
- CAP-DEP-01: immutable server image → portable ARM64 Compose → private Tailscale Serve → receipt-driven two-node recovery proof

## Improvement Requirement Coverage

The binding strategic option recursively requires moderate AC-1 through AC-15, and moderate recursively requires minimum AC-1 through AC-11. Sprint 32 resolves that inheritance into stable source IDs `IMP-AC-1` through `IMP-AC-20`; task-local AC IDs remain contiguous for the requirement-contract parser and carry an explicit source map.

| Task | Binding source requirements | Outcome |
|------|-----------------------------|---------|
| D08-06 | IMP-AC-1, 2, 3, 4, 6, 8, 9 | Server-only ARM64 artifact, portable identity, loopback port, bounded memory, exact graph, secret-safe auth |
| D08-07 | IMP-AC-7, 10, 12, 13, 14, 15 | Host/VM preflight, operator docs, authorization, receipt, private Serve, one-command verification |
| D08-08 | IMP-AC-16, 17, 20 | Cold-host bootstrap, managed reboot/Serve/rollback lifecycle, 50 GiB/VM/headroom contract |
| D08-09 | IMP-AC-5, 11, 18, 19 | Two-real-device private reachability, readiness/recovery/persistence, no Funnel, negative controls |

Each binding requirement is owned exactly once. Aggregate implementation budget: **1080 LOC** across the 14 files authorized by the binding ScopeState.

## Blocks

- None — this is the final migration sprint; Fulcrum re-plans onto the completed platform next.

## Dependencies

- Sprint 28: Point-in-Time Restore and Fresh-Hardware Fire Drill
- Sprint 30: Cutover Rollback Drill and Data-Plane Point of No Return
- Sprint 31: Migration Integrity Remediation
- D08-06 waits for D08-02 and reconciliation of the active D06-06 overlapping deployment/test worktrees.
- D08-07 → D08-08 → D08-09 execute sequentially because they share deployment, verification, documentation, and test surfaces.
- D08-09 requires a human-selected authorized second tailnet device and approved disruption window.
- D08-05 depends on D08-01 through D08-04 **and D08-09**; it remains the only irreversible task.

## Task Detail Files

Generated by /kb-sprint-tasks-plan on 2026-08-09T22:16:33Z

- D08-01-red-grep-clean-build-without-convex-deps-is-the-acceptance-oracle.md
- D08-02-remove-convex-code-deps-delete-dead-clients-archive-ratatui-playground.md
- D08-03-re-run-the-fresh-hardware-fire-drill-restore-as-the-final-pre-deletion-gate.md
- D08-04-author-the-decommission-runbook-ordered-gated-checklist.md
- D08-05-delete-the-convex-cloud-deployment-operator-executed-irreversible.md
- D08-06-portable-arm64-private-compose-runtime-contract.md
- D08-07-portable-host-preflight-receipt-and-private-serve-verification.md
- D08-08-cold-host-bootstrap-and-managed-macos-lifecycle.md
- D08-09-cross-tailnet-cold-host-recovery-drill.md

## Planning provenance

- Binding source: `/Users/inference1/.config/brain/improvements/imp-plan-holocron-as-a-whole-1786510841.json`
- Chosen option: `strategic`
- Generated/bridged by: `/kb-improvement-tasks-plan` with the user-directed Sprint 32 destination override
- Fakeability gate: 20 scenarios, 0 CRITICAL/HIGH violations
- UI pre-pass: skipped — no UI files are in scope
