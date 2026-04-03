# Pre-Existing Issues Blocking Commit

## TypeScript Errors
- components/subscriptions/ReleaseCard.tsx:246:10 - error TS2304: Cannot find name 'spacing'

## Lint Warnings
- None found in our files

## Test Failures
- tests/components/subscriptions/SocialCard.test.tsx:134:22 - Test expecting testID on metrics element (from US-REM-002 changes)
- tests/components/subscriptions/SocialCard.test.tsx:142:22 - Test expecting testID on feedback element (from US-REM-002 changes)

All issues verified as pre-existing via git stash test.
