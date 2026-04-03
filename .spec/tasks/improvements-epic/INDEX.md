# Task Index: Holocron Improvements Implementation

> Generated: 2026-04-03
> Source: Holocron MCP Improvements List
> Total Epics: 1
> Total Tasks: 11

## Epic Structure

## Epic 1: Holocron Improvements Implementation

**Folder:** `improvements-epic/`

**Human Test:**
1. View research reports in outline format that are easy to scan and skim
2. Import research text from other AI platforms via chat agent or "+" button in articles
3. Access redesigned What's New section as card-based stream with multimedia images
4. Configure subscriptions from settings with "more/less like this" feedback
5. Use assistant button located inside the input field (ChatGPT-style)
6. Open 3-dot menus that raise bottom sheets consistently across the app
7. Request specialist research with product/service finder agents

**Tasks:**
- [US-IMP-001](improvements-epic/US-IMP-001.md): Research Reports Outline Format
- [US-IMP-002](improvements-epic/US-IMP-002.md): Research Agent Specialists
- [US-IMP-003](improvements-epic/US-IMP-003.md): Sequential Research Context
- [US-IMP-004](improvements-epic/US-IMP-004.md): Multi-Source Text Import
- [US-IMP-005](improvements-epic/US-IMP-005.md): Subscriptions Redesign - What's New
- [US-IMP-006](improvements-epic/US-IMP-006.md): Subscriptions Redesign - Settings Management
- [US-IMP-007](improvements-epic/US-IMP-007.md): AI Feedback System for News
- [US-IMP-008](improvements-epic/US-IMP-008.md): Assistant Button Placement
- [US-IMP-009](improvements-epic/US-IMP-009.md): 3-Dot Menu Bottom Sheet
- [US-IMP-010](improvements-epic/US-IMP-010.md): Job/Network Crawling Agent Research
- [US-IMP-011](improvements-epic/US-IMP-011.md): Product/Service Finder Specialists

## Usage

These task files are designed for execution with `/kb-run-epic`.

Each task file contains:
- Complete task specification following TASK-TEMPLATE.md v5.0
- All required sections for agent execution
- CRITICAL CONSTRAINTS, ACCEPTANCE CRITERIA, TEST CRITERIA, GUARDRAILS

To execute:
1. `/kb-run-epic improvements-epic` to run the epic
2. Tasks are dispatched to assigned agents in dependency order
3. Reviewers verify each completion before marking done

## Dependencies

- US-IMP-006 depends on US-IMP-005 (settings management after What's New redesign)
- US-IMP-007 depends on US-IMP-005 (AI feedback after What's New redesign)
- US-IMP-011 depends on US-IMP-002 (product specialists after general specialist system)

## PRD Coverage

100% of pending improvements covered (8 pending_review items → 11 tasks with dependencies).
