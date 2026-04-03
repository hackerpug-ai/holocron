# Commit Instructions for US-REM-007

## Files to Commit
- `.spec/prd/subscriptions-redesign/tasks/INDEX.md`

## Commit Command
```bash
git add .spec/prd/subscriptions-redesign/tasks/INDEX.md
git commit -m "US-REM-007: Update INDEX.md with actual status

- Updated Epic 1 status from 'To Do' to 'PARTIAL'
- Updated Epic 2 status from 'COMPLETE' to 'MOSTLY'
- Updated Epic 4 status from 'To Do' to 'PARTIAL'
- Updated Epic 6 status from 'NEW' to 'ACTIVE'
- Added 'Actual Completion Status' table showing ~13% complete (not 60%)
- Added audit notice with reference to red-hat audit report
- Updated all progress tracking tables with accurate status
- Added notes about status being based on audit findings

Acceptance Criteria Met:
✅ AC-1: Epic 2 status reflects actual implementation (not 'COMPLETE')
✅ AC-2: Epic 6 appears in INDEX.md with task list
✅ AC-3: Total task count and completion % accurate based on audit
✅ AC-4: Reference to audit report included in INDEX.md"
```

## Pre-commit Hook Checks
Since this is a documentation-only change (markdown file), all pre-commit hooks should pass:
- ✅ lint-staged: No .ts/.tsx/.js/.jsx files changed
- ✅ tsc --noEmit: No TypeScript files changed
- ✅ vitest run: No test files changed

## Expected Result
Commit should succeed with exit code 0.
