# Epic: Open Improvements April 2026

> Epic Sequence: 2
> Source: Holocron MCP Improvements (open items) + What's New screen bug
> Tasks: 5
> Created: 2026-04-06

## Overview

This epic addresses the 4 open improvement requests from the holocron MCP improvements system plus 1 critical bug fix for the What's New screen being unreachable.

**Key Themes:**
1. **Navigation Bug** - What's New screen can't be reached (missing drawer route + wrong nav handler)
2. **Data Integrity** - agentPlans messageId validation error from unsafe ID cast
3. **Research Reliability** - Timeout handling for AI providers lacks differentiation and retry
4. **Voice Recording** - Assistant audio not captured, only transcripts stored
5. **Research Architecture** - Redesign research agents with composable patterns (deferred to PRD)

## Human Test Steps

When this epic is complete, users should be able to:

1. **Navigate to What's New** from the drawer and see the report list
2. **Tap a What's New report** and see the full detail view
3. **Create agent plans** without risk of invalid messageId references
4. **See research timeout errors** with provider attribution and retry behavior
5. **Record voice sessions** that capture assistant audio for playback

## Task List

| Task ID | Title | Type | Priority | Blocked By |
|---------|-------|------|----------|------------|
| US-OI-001 | Fix What's New Screen Navigation | BUG | P0 | - |
| US-OI-002 | Fix agentPlans messageId Validation | BUG | P1 | - |
| US-OI-003 | Research Timeout Provider Attribution | FEATURE | P1 | - |
| US-OI-004 | Voice Assistant Audio Recording | FEATURE | P2 | - |
| US-OI-005 | Research Agents React Redesign (Spike) | SPIKE | P3 | - |

## Dependencies

- No inter-task dependencies - all tasks are independent (Wave 0)
- US-OI-005 is a spike that produces a design document, not code

## Notes

- US-OI-001 is the critical bug fix - screen exists but can't be navigated to
- US-OI-005 is scoped as a spike (design doc only) since the full redesign needs a PRD
- Improvement IDs from MCP: ps71wx6phj9e3trb2mkxdycnfh84a4ph, ps779azyngw82y6x3hk18h5d5584a809, ps78njyxrqb4wajm9xnza97f4184a538, ps7eywc2639rgawnn7g50rf9fn84asq9
