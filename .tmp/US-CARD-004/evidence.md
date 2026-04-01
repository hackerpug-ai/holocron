# US-CARD-004: Release Card Component - Evidence

## Implementation Summary

Created ReleaseCard component with the following features:
- Prominent version badge (pill-shaped with primary color)
- Repository/source name display with fallback
- Release title (truncated to 2 lines)
- Optional summary (truncated to 3 lines)
- Optional published date
- Optional "View changelog" button (ghost variant)
- Pressable with opacity feedback

## Files Created

1. **components/subscriptions/ReleaseCard.tsx** (209 lines)
   - TypeScript component with ReleaseCardProps interface
   - Uses useTheme hook for semantic tokens
   - Pressable wrapper with opacity feedback
   - Version badge with pill styling (radius.full)
   - Conditional rendering for summary, publishedAt, and changelogUrl
   - All testIDs follow naming convention: `{testID}-{element}`

2. **components/subscriptions/ReleaseCard.stories.tsx** (196 lines)
   - Storybook meta configuration
   - 7 story variants: Default, WithoutRepositoryName, WithoutSummary, WithoutChangelog, BetaRelease, LongSummary, LongTitle, MultipleReleases
   - Full documentation with descriptions

3. **tests/components/subscriptions/ReleaseCard.test.tsx** (253 lines)
   - 43 tests covering all acceptance criteria
   - Tests for component structure, theme compliance, React Native patterns
   - Verification of truncation, conditional rendering, and testIDs

## Acceptance Criteria Verification

| AC | Status | Evidence |
|----|--------|----------|
| AC-1: Version badge as pill | ✅ | Badge uses `borderRadius: radius.full` with primary color |
| AC-2: Summary truncates to 2-3 lines | ✅ | `numberOfLines={3}` on summary Text component |
| AC-3: Changelog button displays | ✅ | Conditional rendering with `changelogUrl &&` |
| AC-4: Tap fires onPress | ✅ | Pressable with `onPress={onPress}` and opacity change |
| AC-5: Fallback to source name | ✅ | `displayName = repositoryName \|\| source` |

## Theme Compliance

- ✅ Uses `useTheme()` hook for all colors, spacing, and radius
- ✅ No hardcoded hex colors
- ✅ No hardcoded spacing values in inline styles
- ✅ No hardcoded fontSize
- ✅ Uses semantic tokens: `colors.card`, `colors.primary`, `spacing.md`, `radius.xl`

## Test Results

```
Test Files: 67 passed | 1 skipped (68)
Tests: 953 passed | 5 skipped (958)
Duration: 846ms
```

## Type Check & Lint

- ✅ `bun run typecheck` - Passed (0 errors)
- ✅ `bun run lint` - Passed (only pre-existing SocialCard warning)

## Component API

```typescript
interface ReleaseCardProps {
  version: string              // Required: Version string (e.g., "v2.1.0")
  title: string                // Required: Release title
  summary?: string             // Optional: Summary/description
  repositoryName?: string      // Optional: Repository name
  source: string               // Required: Source name (fallback)
  publishedAt?: string         // Optional: Published timestamp
  changelogUrl?: string        // Optional: Changelog URL
  onPress?: () => void         // Optional: Press callback
  testID?: string              // Optional: Test ID (default: "release-card")
}
```

## Design Patterns Followed

1. **VideoCard Pattern**: Pressable with opacity change, StyleSheet for static styles
2. **Theme System**: useTheme hook for semantic tokens
3. **TestID Convention**: `{testID}-{element}` pattern
4. **Conditional Rendering**: `summary &&`, `changelogUrl &&`, `publishedAt &&`
5. **NativeWind + Inline Styles**: StyleSheet for static, inline for theme values
