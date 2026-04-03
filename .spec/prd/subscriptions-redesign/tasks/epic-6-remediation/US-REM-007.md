# US-REM-007: Update INDEX.md with Actual Status

> Task ID: US-REM-007
> Type: DOCUMENTATION
> Priority: P2
> Estimate: 20 minutes
> Assignee: product-manager

## CRITICAL CONSTRAINTS

### MUST
- Reflect actual code completion status (not claimed status)
- Update Epic 2 status from "COMPLETE" to actual state
- Add Epic 6 to the index
- Update task counts and completion percentages
- Maintain existing INDEX.md format

### NEVER
- Claim tasks are complete without verification
- Remove existing epics or tasks
- Change format/structure of INDEX.md

### STRICTLY
- Base status on actual code audit findings
- Update all 5 epics + add Epic 6
- Recalculate total tasks and completion %
- Include reference to audit report

## SPECIFICATION

**Objective:** Update INDEX.md to reflect the actual state of implementation based on the red-hat audit findings.

**Success looks like:** INDEX.md accurately represents what's actually complete vs claimed, enabling proper project tracking.

## ACCEPTANCE CRITERIA

| # | Given | When | Then | Verify |
|---|-------|------|------|--------|
| 1 | INDEX.md claims Epic 2 "COMPLETE" | Audit shows gaps | Update to reflect actual status | Epic 2 shows accurate status |
| 2 | Epic 6 tasks created | INDEX.md exists | Add Epic 6 to index | Epic 6 appears in index |
| 3 | Task completion percentages calculated | All epics reviewed | Update totals to match reality | Totals are accurate |
| 4 | Audit report exists | INDEX.md updated | Add reference to audit | Audit report linked |

## TEST CRITERIA

| # | Boolean Statement | Maps To AC | Verify | Status |
|---|-------------------|------------|--------|--------|
| 1 | Epic 2 status reflects actual implementation (not "COMPLETE") | AC-1 | Status matches audit findings | [ ] TRUE [ ] FALSE |
| 2 | Epic 6 appears in INDEX.md with task list | AC-2 | Epic 6 section exists | [ ] TRUE [ ] FALSE |
| 3 | Total task count and completion % are accurate based on audit | AC-3 | Math checks out | [ ] TRUE [ ] FALSE |
| 4 | Reference to audit report included in INDEX.md | AC-4 | Link to red-hat report | [ ] TRUE [ ] FALSE |

## GUARDRAILS

### WRITE-ALLOWED
- `.spec/prd/subscriptions-redesign/tasks/INDEX.md` (MODIFY)

### WRITE-PROHIBITED
- Individual epic EPIC.md files - keep those unchanged
- Individual task files - keep those unchanged
- `.spec/reviews/red-hat-prd-audit-2026-04-02.md` - audit is read-only

## DESIGN

### References
- `.spec/prd/subscriptions-redesign/tasks/INDEX.md` - current index
- `.spec/reviews/red-hat-prd-audit-2026-04-02.md` - audit findings
- Epic 6 EPIC.md - new epic details

### Interaction Notes
- This is documentation only (no code changes)
- Update status columns to match audit
- Add Epic 6 to the epic summary table
- Add note about audit findings

### Code Pattern

Source: INDEX.md format (maintain existing structure)

```markdown
# Task Index: Subscriptions Redesign

> Generated: 2026-04-01
> Last Updated: 2026-04-02 (audit remediation)
> PRD: .spec/prd/subscriptions-redesign/README.md
> Total Epics: 6
> Total Tasks: 32

## Audit Note

**⚠️ STATUS UPDATED**: Following red-hat audit 2026-04-02, task statuses have been corrected to reflect actual implementation. Previous INDEX.md claimed Epic 2 was "COMPLETE" but audit found critical gaps.

See: `.spec/reviews/red-hat-prd-audit-2026-04-02.md` for full audit report.

## Epic Summary

| Epic | Title | Tasks | Priority | Status |
|------|-------|-------|----------|--------|
| [Epic 1](./epic-1-navigation/INDEX.md) | Navigation Restructuring | 4 | P0 | **PARTIAL** |
| [Epic 2](./epic-2-cards/INDEX.md) | Multimedia Card Stream | 7 | P0 | **MOSTLY** |
| [Epic 3](./epic-3-summaries/INDEX.md) | AI Summaries | 4 | P0 | To Do |
| [Epic 4](./epic-4-feedback/INDEX.md) | Feedback-Driven Recommendations | 6 | P1 | **PARTIAL** |
| [Epic 5](./epic-5-infrastructure/INDEX.md) | Cross-Feature Requirements | 24 | P0/P1/P2 | Partial |
| [Epic 6](./epic-6-remediation/) | Remediation (Audit Gaps) | 7 | P0 | To Do |

## Actual Completion Status

| Epic | Claimed | Actual | Gap |
|------|---------|---------|-----|
| Epic 1 | To Do | PARTIAL - Label changed, missing redirects/tooltip | 2 tasks |
| Epic 2 | COMPLETE | MOSTLY - Missing ArticleCard + feedback integration | 2 tasks |
| Epic 3 | To Do | NOT STARTED | 4 tasks |
| Epic 4 | Partial | PARTIAL - Component exists, no backend | 5 tasks |
| Epic 5 | 6/24 done | 6/24 done (quality filtering only) | 18 tasks |
| Epic 6 | N/A | NEW - Addresses audit gaps | 7 tasks |

**Total: ~13% complete (not 60% as previously claimed)**
```

### Anti-pattern (DO NOT)
```markdown
# ❌ WRONG: Keep claiming "COMPLETE" when it's not
| Epic 2 | Multimedia Card Stream | COMPLETE |

# ✅ CORRECT: Reflect reality
| Epic 2 | Multimedia Card Stream | MOSTLY - Missing ArticleCard + feedback |
```

## CODING STANDARDS

- **Documentation best practices**:
  - Maintain markdown formatting
  - Keep tables aligned and readable
  - Use consistent status terminology

## DEPENDENCIES

This task depends on:
- **US-REM-001** through **US-REM-006** - All remediation tasks should be complete

## REQUIRED READING

1. `.spec/prd/subscriptions-redesign/tasks/INDEX.md` - Current index (before changes)
2. `.spec/reviews/red-hat-prd-audit-2026-04-02.md` - Audit findings
3. `epic-6-remediation/EPIC.md` - New epic details

## NOTES

This task is about truth in advertising. The INDEX.md was claiming Epic 2 was "COMPLETE" when it actually had missing components and no feedback integration. This documentation update ensures everyone has accurate visibility into what's actually done.

After this update, project tracking will be accurate and stakeholders will have realistic expectations.
