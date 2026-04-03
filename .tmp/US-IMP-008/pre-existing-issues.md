# Pre-Existing Issues Blocking Commit

## TypeScript Errors

### app/(drawer)/whats-new/index.tsx
- **Line 50**: Type error - Missing properties `card_type` and `report_id` from type `WhatsNewReportCardData`
- **Error**: `Type '{ days: number; period_start: number; period_end: number; findings_count: number; discovery_count: number; release_count: number; trend_count: number; content: undefined; is_from_today: false; sources: never[]; }' is missing the following properties from type 'WhatsNewReportCardData': card_type, report_id`

### components/research/ReportOutline.tsx
- **Line 16**: Module error - No exported member 'Minus' from icons
- **Error**: `Module '"@/components/ui/icons"' has no exported member 'Minus'`

### tests/components/research/ReportOutline.test.tsx
- **Line 13**: Module error - Cannot find '@testing-library/react-native'
- **Line 98**: Type error - Cannot find name 'getByText'

## Lint Warnings

### app/(drawer)/whats-new/index.tsx
- **Line 1**: Unused variable 'Pressable'

### components/research/ReportOutline.tsx
- **Line 19**: Unused variable 'Parser'

### components/research/markdownParser.ts
- **Line 7**: Unused argument 'markdown'

## Test Failures

### tests/components/whats-new/NewsCard.test.tsx
- **Test failure**: `should have testID="news-card" on card` - Expected testID not found in component

### tests/components/whats-new/WhatsNewReportCard.test.tsx
- **Test failure**: `should have testID="whats-new-report-card" on card` - Expected testID not found in component

## Verification

All issues verified as pre-existing via git stash test:
1. Stashed changes
2. Ran typecheck, lint, and test
3. All same errors/failures occurred
4. Restored changes

**Files Modified in This Task:**
- `components/chat/ChatInput.tsx` - Created AssistantButton component integration
- `components/chat/AssistantButton.tsx` - NEW FILE - Created reusable assistant button component

**No new errors introduced by this task.**
