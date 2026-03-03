# Epic 5: Deep Research

> Epic Sequence: 5
> PRD: .spec/prd/08-uc-deep-research.md
> PRD Version: 3.1.0
> Appetite: 2 weeks
> Tasks: 20

## Overview

Multi-iteration deep research using Ralph Loop pattern with real-time progress streaming, session resumption, and detailed iteration cards showing coverage scores and findings.

## Human Test Steps

When this epic is complete, users should be able to:

1. Type `/deep-research quantum computing` and see confirmation card with session ID
2. Watch iteration cards appear with coverage scores and feedback
3. Type `/cancel` during research to stop after current iteration
4. Interrupt session, type `/resume`, select incomplete session from list
5. Tap completed result card to see full report with iteration timeline

## Acceptance Criteria (from PRD)

- User can initiate `/deep-research` with topic and max iterations
- Agent streams iteration progress to chat with coverage scores
- User can resume interrupted sessions via `/resume`
- Completed research shown as expandable iteration cards

## PRD Sections Covered

- UC-DR-01
- UC-DR-02
- UC-DR-03
- UC-DR-04

## Dependencies

No epic dependencies.

## Task List

| Task ID | Title | Type | Priority | Stability | Status |
|---------|-------|------|----------|-----------|--------|
| US-051 | [DESIGN] Deep Research Confirmation Card Component | feature:design | P0 | stable | ✅ Complete |
| US-052 | [DESIGN] Resume Session List Component | feature:design | P1 | stable | ✅ Complete |
| US-053 | [DESIGN] Deep Research Result Detail View Component | feature:design | P2 | stable | ✅ Complete |
| US-054 | [BACKEND] Deep Research Session Database Schema | task | P0 | stable | ✅ Complete |
| US-055 | [BACKEND] Deep Research Slash Command Handler | task | P1 | stable | ✅ Complete |
| US-056 | [BACKEND] Resume Session Slash Command Handler | task | P2 | stable | ✅ Complete |
| US-057 | [BACKEND] Deep Research Iteration Streaming | task | P3 | evolving | ✅ Complete |
| US-058 | [INTEGRATION] Wire Deep Research Confirmation to Chat | feature:integration | P4 | stable | ✅ Complete |
| US-059 | [INTEGRATION] Wire Resume Session List to Chat | feature:integration | P5 | stable | ✅ Complete |
| US-060 | [INTEGRATION] Wire Deep Research Detail View Navigation | feature:integration | P6 | stable | ✅ Complete |
| US-061 | [BACKEND] Implement `/cancel` Command Handler | task | P0 | stable | 🔴 NEW |
| US-062 | [BACKEND] Add Citations Storage to Schema | task | P0 | stable | 🔴 NEW |
| US-063 | [BACKEND] Implement User Authentication with RLS | task | P0 | stable | 📝 Pending |
| US-064 | [BACKEND] Fix Restart to Clear Iterations | task | P1 | stable | 📝 Pending |
| US-065 | [BACKEND] Implement Supabase Realtime Streaming | task | P1 | evolving | 📝 Pending |
| US-066 | [INTEGRATION] Wire `/cancel` Command to Chat | feature:integration | P1 | stable | 📝 Pending |
| US-067 | [INTEGRATION] Add Estimated Duration to Confirmation Card | feature:integration | P2 | stable | 📝 Pending |
| US-068 | [INTEGRATION] Implement Session ID Copy-to-Clipboard | feature:integration | P2 | stable | 📝 Pending |
| US-069 | [INTEGRATION] Add Iteration Failure/Error States | feature:integration | P2 | stable | 📝 Pending |
| US-070 | [INTEGRATION] Wire Final Result Card Navigation | feature:integration | P2 | stable | 📝 Pending |

## Parallel Execution Groups

**Group 1** (can start immediately):
- US-051: Confirmation Card Design
- US-052: Resume Session List Design
- US-053: Detail View Design
- US-054: Database Schema
- US-061: /cancel Command Handler
- US-062: Citations Storage Schema
- US-063: User Authentication with RLS

**Group 2** (after Group 1):
- US-055: /deep-research Command Handler
- US-056: /resume Command Handler
- US-057: Iteration Streaming
- US-064: Fix Restart to Clear Iterations
- US-065: Supabase Realtime Streaming

**Group 3** (after Groups 1 & 2):
- US-058: Confirmation Integration
- US-059: Resume Integration
- US-060: Detail View Integration
- US-066: Wire /cancel Command
- US-067: Add Estimated Duration
- US-068: Session ID Copy-to-Clipboard
- US-069: Iteration Failure/Error States
- US-070: Final Result Card Navigation
