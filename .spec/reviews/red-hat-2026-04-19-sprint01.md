# Red-Hat Review Report

**Report Date**: 2026-04-19T12:00:00Z
**Target**: Sprint 1: Intelligence Briefing Screen
**Reviewed By**: react-native-ui-reviewer, feature-dev:code-reviewer
**Scope**: DESIGN-002, NEWSFEED-001, NEWSFEED-002, NEWSFEED-003, NEWSFEED-004 (completed tasks)

---

## Executive Summary

Two adversarial reviewers independently analyzed the 5 completed tasks in Sprint 1. Both flagged a **CRITICAL score calculation bug** in NewsfeedFindingCard where the implementation uses `score / 100 * 5` instead of the spec-mandated `score / 10 * 5`. Both also identified placeholder tests (`expect(true).toBe(true)`) in NEWSFEED-003 and a test infrastructure reliance on source-code string analysis instead of real component rendering. Verdict: **needs-revision** before continuing to NEWSFEED-005.

---

## HIGH Confidence Findings (Both Agents Agree)

- [x] **Score calculation bug** — `NewsfeedFindingCard.tsx:32` uses `score / 100 * 5` instead of `score / 10 * 5` per AC-2 | Severity: **CRITICAL**
      Agents: react-native-ui-reviewer, feature-dev:code-reviewer

- [x] **Placeholder tests in NEWSFEED-003** — AC-4 (onPress) and AC-6 (hairline separator) use `expect(true).toBe(true)` instead of real assertions | Severity: **HIGH**
      Agents: react-native-ui-reviewer, feature-dev:code-reviewer

- [x] **Test approach: source-code analysis vs real rendering** — NewsfeedHeader, NewsfeedHeroCard, and NewsfeedFindingCard tests use `readFileSync` string analysis instead of rendering components. This verifies code structure, not behavior | Severity: **HIGH**
      Agents: react-native-ui-reviewer, feature-dev:code-reviewer

- [x] **Duplicate formatRelativeTime** — Three separate implementations across NewsfeedHeader (Unix ms input), NewsfeedFindingCard (ISO string), and NewsfeedHeroCard (ISO string) | Severity: **MEDIUM**
      Agents: react-native-ui-reviewer, feature-dev:code-reviewer

- [x] **Score calculation shared by test and implementation** — Both use wrong formula, creating test theatre where the bug passes | Severity: **HIGH**
      Agents: react-native-ui-reviewer, feature-dev:code-reviewer

## MEDIUM Confidence Findings (Both Agents Agree)

- [x] **Hardcoded freshness colors** — `NewsfeedHeader.tsx:14-18` uses hex values '#22C55E', '#F59E0B', '#EF4444' instead of theme tokens. Won't respect dark mode | Severity: **MEDIUM**
      Agents: react-native-ui-reviewer, feature-dev:code-reviewer

- [x] **Missing accessibility label testing** — Components have accessibilityLabel/accessibilityRole props but tests don't verify them | Severity: **MEDIUM**
      Agents: react-native-ui-reviewer, feature-dev:code-reviewer

- [x] **PublishedAt timestamp format inconsistency** — NewsfeedHeader treats createdAt as Unix ms; NewsfeedFindingCard/HeroCard treat publishedAt as ISO string. No verification of actual Convex schema format | Severity: **MEDIUM**
      Agents: react-native-ui-reviewer, feature-dev:code-reviewer

- [x] **Score null handling gap** — `score !== undefined` passes null through (null !== undefined is true), causing NaN | Severity: **LOW**
      Agents: react-native-ui-reviewer, feature-dev:code-reviewer

## LOW Confidence Findings (Single Agent)

- [ ] **Lint blocked by worktree** — Nested biome.json in `.claude/worktrees/agent-a76a3e6e/` prevents lint from running | Severity: **MEDIUM**
      Agent: react-native-ui-reviewer

- [ ] **testID naming inconsistency** — Different prefix patterns across components ('newsfeed-header-' vs 'filter-pill-' vs 'newsfeed-finding-card-') | Severity: **LOW**
      Agent: feature-dev:code-reviewer

- [ ] **Missing TDD_STATE checkboxes** — Task spec files have unchecked TDD phase tracking | Severity: **LOW**
      Agent: feature-dev:code-reviewer

- [ ] **Category exhaustiveness not checked at runtime** — Components assume category is always valid CategoryKey | Severity: **LOW**
      Agent: feature-dev:code-reviewer

---

## Agent Contradictions & Debates

| Topic | react-native-ui-reviewer | feature-dev:code-reviewer | Assessment |
|-------|-------------------------|--------------------------|------------|
| Test infrastructure fixability | Questions if vitest limitation is real — NewsfeedFilterBar tests use real rendering successfully | Accepts limitation, recommends fixing config | **Agree on substance**: FilterBar proves real testing works. Other tests should follow its pattern. |
| Lint failure cause | Blames worktree biome.json conflict | Doesn't mention lint | **Worktree issue is real** — visible in git status, needs cleanup |
| DESIGN-002 AC status | All 4 AC PASS | All 4 AC PASS | **Full agreement** — token file is clean |

---

## Recommendations by Category

1. **Critical Bugs**: Fix score calculation in NewsfeedFindingCard.tsx:32 from `score / 100 * 5` to `score / 10 * 5`. Update test to match.

2. **Test Quality**: Replace placeholder `expect(true).toBe(true)` tests in NEWSFEED-003 with real assertions. Follow NewsfeedFilterBar's testing pattern (actual rendering with @testing-library/react-native).

3. **Code Duplication**: Extract formatRelativeTime to `components/whats-new/utils/formatRelativeTime.ts`. Accept both Unix ms and ISO string input.

4. **Theme Compliance**: The hardcoded freshness colors are spec-permitted (spec says "use inline style for dynamic freshness color only") but should be documented. Category accent colors are intentionally hex per CATEGORY_COLORS design.

5. **Infrastructure**: Clean up stale worktree at `.claude/worktrees/agent-a76a3e6e/` to unblock lint.

---

## Agent Reports (Summary)

- **react-native-ui-reviewer**: 7 HIGH, 3 MEDIUM, 1 LOW findings. Ran typecheck (pass), lint (fail - worktree), tests (fail - vitest config). AC verdict: 2 FAIL, 2 PARTIAL out of 23 items.
- **feature-dev:code-reviewer**: 7 HIGH, 6 MEDIUM, 3 LOW findings. Focused on TypeScript type safety, test theatre, and spec contradictions. AC verdict: 1 FAIL, 2 PARTIAL out of 23 items.

---

## AC Verdict Summary (Consolidated)

| Task | Total ACs | PASS | FAIL | PARTIAL |
|------|-----------|------|------|---------|
| DESIGN-002 | 4 | 4 | 0 | 0 |
| NEWSFEED-001 | 5 | 5 | 0 | 0 |
| NEWSFEED-002 | 5 | 5 | 0 | 0 |
| NEWSFEED-003 | 6 | 4 | 1 | 1 |
| NEWSFEED-004 | 5 | 5 | 0 | 0 |
| **Total** | **25** | **23** | **1** | **1** |

**FAIL items:**
- NEWSFEED-003 AC-2: Score dots calculation wrong (score/100 instead of score/10)

**PARTIAL items:**
- NEWSFEED-003 AC-4: onPress test is placeholder (`expect(true).toBe(true)`)

---

## Metadata

- **Agents**: react-native-ui-reviewer (Read, Bash, Glob, Grep), feature-dev:code-reviewer (Read, Glob, Grep, Bash)
- **Confidence Framework**: HIGH (both agents agree), MEDIUM (both agents agree on lower severity), LOW (single agent)
- **Report Generated**: 2026-04-19T12:00:00Z
- **Next Steps**: Fix critical score bug, replace placeholder tests, then proceed to NEWSFEED-005
