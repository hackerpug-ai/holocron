---
sequence: 24
timeline: Phase 5 — Client Rewrite
status: In Progress
planned_from_roadmap_sha: ba669cff6df8fb1fdbba927e1e64a856364afce0eb48b553eff623753f460386
planned_from_source_sha: 3885e9100ea6999d8702e4a79fc3289278f44cd1
source_kind: git-head
planned_at: 2026-07-23T02:16:55Z
---

# Sprint 24: Full RN App Rewrite off Convex onto Zero

**Sequence:** 24
**Timeline:** Phase 5 — Client Rewrite
**Status:** In Progress
> Progress: 0/6 tasks completed · updated 2026-07-24T01:00:21Z
**Proposed by:** react-native-ui-planner
**Milestone:** — (`sprint-24`)
**Branch:** `mk6-app-rewrite`
**PR:** —

## Overview

Sprint 24 is the **full client rewrite** — the deep client build the proven-reference-flow gate (Sprint 20) unlocks and the client-data-contract (Sprint 21) maps. It swaps the last `ConvexProvider` and every remaining `convex/react` hook call-site in the RN app for Zero reactive hooks over Postgres (and authoritative Hono commands for the mutations Zero does not own), so the app reads and writes entirely off Convex. This closes UC-SYNC-01 and the four SYNC test criteria the rewrite owns: T-SYNC-001, T-SYNC-002, T-SYNC-004, T-SYNC-019.

**What is already proven before this sprint.** Sprint 20 stood up the cold-boot reference flow — the Zero provider replaces `ConvexProvider` in `app/_layout.tsx`, the app boots without `EXPO_PUBLIC_CONVEX_URL` set, and a thin chat vertical sends via a Hono command and reads the durable message back via Zero against real Postgres. Sprint 21 produced the approved `13-client-data-contract.yaml` mapping every legacy Convex hook/action call-site (~105 across ~47 files) to its Zero query, Zero mutator, or Hono command target, each declaring its offline, optimistic, conflict, rejection, and identifier behavior — the contract this sprint executes. Sprint 16 ships the public `/article/{shareToken}` endpoint on Hono, the host the share-URL builder must now point at.

**What this sprint does.** Execute that contract across four screen clusters — (1) Chat + conversations, (2) Documents + articles + narration with the share-URL re-point, (3) Subscriptions + feed + whats-new + settings, (4) Research + assimilate + improvements + toolbelt + notifications — each rewired from `convex/react` hooks onto the approved Zero/Hono targets while preserving the existing theme, accessibility, and `ScreenLayout` conventions. A grep-verified `holo verify:no-convex-client` gate (S-REWRITE-05) proves zero `convex/react` imports remain in `app/`, `components/`, `hooks/`, `screens/`, wired into CI; a reviewer pass (S-REWRITE-06) audits theme/a11y/contract compliance across every rewired surface.

The gate is one un-fakeable outcome: opening the rewritten app against a seeded Postgres shows the 3 seeded conversations (plus 12 documents and 5 feed items) loading via Zero with no Convex client hook remaining on the path. The sprint owns three capability-chain segments: **CAP-SYNC-01** (every app read/write off Convex hooks onto Zero queries/mutators/Hono commands), **CAP-CUT-01** (the client half of the flip — no `convex/react` remaining), and **CAP-PUB-01** (the share-URL builder re-pointed to the Mastra `/article/` host).

## Human Testing Gate

**Gate:** Opening the rewritten app against a seeded Postgres shows the 3 seeded conversations loading via Zero with no Convex client hook remaining on the path.

## Human Test Deliverable

1. Run `holo seed:e2e --reset` — seeds 3 conversations, 12 documents, 5 feed items.
2. Cold-boot the app — the drawer chat list shows the 3 seeded conversations via Zero.
3. Open Articles — the 12 seeded documents load via Zero grouped by category.
4. Open the What's New feed — the 5 seeded feed items appear via Zero.
5. Rename a conversation from the drawer — the new title reflects within the 5s SLO via Zero.
6. Run `holo verify:no-convex-client` — exits 0 with zero convex/react hooks in app/components/hooks/screens.
7. Share a seeded public document — the URL points at the Mastra `/article/` host, not `.convex.site`.

## Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| S-REWRITE-01 | Rewire Chat + conversations cluster to Zero/Hono | react-native-ui-implementer | 300 min |
| S-REWRITE-02 | Rewire Documents + articles + narration cluster; re-point share URL | react-native-ui-implementer | 360 min |
| S-REWRITE-03 | Rewire Subscriptions + feed + whats-new + settings cluster to Zero | react-native-ui-implementer | 300 min |
| S-REWRITE-04 | Rewire Research + assimilate + improvements + toolbelt + notifications cluster | react-native-ui-implementer | 300 min |
| S-REWRITE-05 | `holo verify:no-convex-client` gate (grep-verified, wired to CI) | red-test-generator | 90 min |
| S-REWRITE-06 | Reviewer pass: theme/a11y/contract compliance across rewired surfaces | react-native-ui-reviewer | 150 min |

## Source Coverage

- UC-SYNC-01
- T-SYNC-001, T-SYNC-002, T-SYNC-004, T-SYNC-019
- `.spec/prds/mk6-migration/08-uc-sync.md`
- `.spec/prds/mk6-migration/11-e2e-testing-criteria.md`
- `.spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml`
- `.spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json`
- `.spec/prds/mk6-migration/README.md`

## Capability Coverage

- CAP-SYNC-01: every app read/write off Convex hooks onto Zero queries/mutators/Hono commands
- CAP-CUT-01: the client half of the flip (no `convex/react` remaining)
- CAP-PUB-01: the share-URL builder re-pointed to the Mastra `/article/` host

## Blocks

- Blocks: Sprint 25, Sprint 26, Sprint 29
- Depends on: Sprint 04, Sprint 16, Sprint 20, Sprint 21

## Specialist Proposals

- `react-native-ui-planner` — sole dispatched planning specialist (resolved set: `[react-native-ui-planner]`). This is a single-domain React Native client-rewiring sprint with no new visual design surface, so no design planner is consulted (mirrors Sprint 21's resolution). The planner authors all six task definitions (S-REWRITE-01..06) and remediates every fakeable scenario to `validate_scenario.py` exit 0. **Proposed By: `react-native-ui-planner`** attribution is preserved in every task file per the NEVER-TIER `proposed_by` tripwire.
- `react-native-ui-implementer` (S-REWRITE-01..04), `red-test-generator` (S-REWRITE-05), and `react-native-ui-reviewer` (S-REWRITE-06) are the **execution** agents — their task *specs* are authored by `react-native-ui-planner`, exactly as in prior RN sprints (Sprints 20, 21).

## Task Detail Files

Generated by /kb-sprint-tasks-plan on 2026-07-23T02:16:55Z (specialist proposal: react-native-ui-planner). Avg quality ≥80/115 (all 13 rubric sections present per task); fakeability audit: **0 CRITICAL / 0 HIGH** — `validate_scenario.py` exit 0 on every task's requirement contract, independently re-verified against the written files. Topological order: S-REWRITE-01 ∥ S-REWRITE-02 ∥ S-REWRITE-03 ∥ S-REWRITE-04 (the four screen clusters, sharing the `app/zero/` seam) → S-REWRITE-05 (the no-convex gate can only pass once all four land) → S-REWRITE-06 (review across all rewired surfaces). Status remains 🔵 Planned at the roadmap level — expanded and ready for `/kb-run-sprint`, not yet executing.

- S-REWRITE-01-rewire-chat-conversations-cluster-to-zero-hono.md
- S-REWRITE-02-rewire-documents-articles-narration-cluster-re-point-share-url.md
- S-REWRITE-03-rewire-subscriptions-feed-whats-new-settings-cluster-to-zero.md
- S-REWRITE-04-rewire-research-assimilate-improvements-toolbelt-notifications-cluster.md
- S-REWRITE-05-holo-verify-no-convex-client-gate-grep-verified-wired-to-ci.md
- S-REWRITE-06-reviewer-pass-theme-a11y-contract-compliance-across-rewired-surfaces.md
