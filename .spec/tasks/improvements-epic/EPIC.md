# Epic: Holocron Improvements Implementation

> Epic Sequence: 1
> Source: Holocron MCP Improvements List
> Tasks: 11
> Created: 2026-04-03

## Overview

This epic addresses all 11 pending improvement items from the Holocron MCP improvements system. The improvements span UI/UX enhancements, research system improvements, and new feature development.

**Key Themes:**
1. **Research Experience** - Making research reports more scannable and context-aware
2. **Content Import** - Multi-source text import capabilities
3. **Discovery & Subscriptions** - Subscriptions redesign with AI customization
4. **Input UX** - Assistant button placement and menu consistency
5. **Specialist Agents** - Product/service finder specialists

## Human Test Steps

When this epic is complete, users should be able to:

1. **View research reports** in outline format that are easy to scan and skim
2. **Import research text** from other AI platforms via chat agent or "+" button in articles
3. **Access redesigned What's New** section as card-based stream with multimedia images
4. **Configure subscriptions** from settings with "more/less like this" feedback
5. **Use assistant button** located inside the input field (ChatGPT-style)
6. **Open 3-dot menus** that raise bottom sheets consistently across the app
7. **Request specialist research** with product/service finder agents

## Acceptance Criteria (from Improvements)

- [x] All 11 improvement items have corresponding tasks
- [ ] Research reports display in outline/skimmable format
- [ ] Sequential research maintains context across sessions
- [ ] Text can be added to holocron articles via chat or "+" button
- [ ] Subscription management moved to settings
- [ ] What's New redesigned as card-based stream with multimedia
- [ ] "More/less like this" feedback adjusts news suggestions
- [ ] Assistant button appears inside input field
- [ ] 3-dot menu raises bottom sheet consistently

## Task List

| Task ID | Title | Type | Priority | Blocked By |
|---------|-------|------|----------|------------|
| US-IMP-001 | Research Reports Outline Format | FEATURE | P1 | - |
| US-IMP-002 | Research Agent Specialists | FEATURE | P2 | - |
| US-IMP-003 | Sequential Research Context | FEATURE | P1 | - |
| US-IMP-004 | Multi-Source Text Import | FEATURE | P1 | - |
| US-IMP-005 | Subscriptions Redesign - What's New | FEATURE | P1 | - |
| US-IMP-006 | Subscriptions Redesign - Settings Management | FEATURE | P1 | US-IMP-005 |
| US-IMP-007 | AI Feedback System for News | FEATURE | P2 | US-IMP-005 |
| US-IMP-008 | Assistant Button Placement | FEATURE | P2 | - |
| US-IMP-009 | 3-Dot Menu Bottom Sheet | FEATURE | P2 | - |
| US-IMP-010 | Job/Network Crawling Agent Research | FEATURE | P3 | - |
| US-IMP-011 | Product/Service Finder Specialists | FEATURE | P3 | US-IMP-002 |

## Dependencies

- US-IMP-006 depends on US-IMP-005 (settings management after What's New redesign)
- US-IMP-007 depends on US-IMP-005 (AI feedback after What's New redesign)
- US-IMP-011 depends on US-IMP-002 (product specialists after general specialist system)

## Notes

- 3 items already marked as "done" in improvements system (status simplification, loader fix, bottom sheet animation)
- These completed items are excluded from task generation
- Focus is on the 8 pending_review items from the improvements list
