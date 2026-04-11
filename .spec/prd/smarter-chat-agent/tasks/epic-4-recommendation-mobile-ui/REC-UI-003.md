================================================================================
TASK: REC-UI-003 - RecommendationSources collapsible citation list
================================================================================

TASK_TYPE: FEATURE
STATUS: Backlog
TDD_PHASE: RED
CURRENT_AC: AC-1
PRIORITY: P1
EFFORT: S
TYPE: DEV
AGENT: react-native-ui-implementer
ESTIMATE_MINUTES: 90
ITERATION: 1

--------------------------------------------------------------------------------
CRITICAL CONSTRAINTS
--------------------------------------------------------------------------------

MUST:
- MUST import Text from '@/components/ui/text' and use text-muted-foreground Tailwind class for subtle weight
- MUST render nothing when sources array is empty
- MUST expose testID='recommendation-list-sources' and per-source testIDs 'recommendation-source-{index}'
- MUST tap fires Linking.openURL with source.url

NEVER:
- NEVER import Text from 'react-native' or 'react-native-paper'
- NEVER render an empty sources box

STRICTLY:
- STRICTLY use an accessibilityRole='link' on each source Pressable

--------------------------------------------------------------------------------
SPECIFICATION
--------------------------------------------------------------------------------

**Objective**: Render a compact list of source domains at the bottom of a recommendation card, tappable to open the source URL in the browser.

**Success looks like**: Component has 4 stories (Default, NoSources, ManySources, Collapsed), tests cover render/tap/empty paths, full gates pass.

--------------------------------------------------------------------------------
BACKGROUND
--------------------------------------------------------------------------------

**Problem**: Recommendation results need to show their sources for credibility, but without polluting the card with large source blocks. A compact domain list with tap-to-open is the right shape.

**Why it matters**: Sources build trust. Users are more likely to act on a recommendation when they can see where it came from.

**Current state**: No source-display component exists in components/cards/.

**Desired state**: A sub-component that renders nothing when empty and a compact tappable domain list when populated.

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD Beads)
--------------------------------------------------------------------------------

AC-1: renders source domains
  GIVEN: sources with domain='yelp.com' and 'reddit.com'
  WHEN: rendered
  THEN: both domain strings are visible
  VERIFY: `pnpm vitest run components/cards/RecommendationSources.test.tsx`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

AC-2: renders nothing when empty
  GIVEN: sources=[]
  WHEN: rendered
  THEN: queryByTestId('recommendation-list-sources') returns null
  VERIFY: `pnpm vitest run components/cards/RecommendationSources.test.tsx`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

AC-3: tap opens source URL
  GIVEN: a source with url='https://yelp.com/x'
  WHEN: user presses it
  THEN: Linking.openURL is called with the exact URL
  VERIFY: `pnpm vitest run components/cards/RecommendationSources.test.tsx`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

AC-4: stories render
  GIVEN: all 4 stories
  WHEN: storybook runs
  THEN: all 4 stories render without errors
  VERIFY: `vitest --project=storybook --run`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

--------------------------------------------------------------------------------
TEST CRITERIA (Boolean Verification)
--------------------------------------------------------------------------------

| # | Boolean Statement | Maps To AC | Verify | Status |
|---|-------------------|------------|--------|--------|
| 1 | RecommendationSources renders each provided source domain as visible text | AC-1 | `pnpm vitest run components/cards/RecommendationSources.test.tsx` | [ ] TRUE [ ] FALSE |
| 2 | RecommendationSources returns null when sources array length equals 0 | AC-2 | `pnpm vitest run components/cards/RecommendationSources.test.tsx` | [ ] TRUE [ ] FALSE |
| 3 | Pressing a source item calls Linking.openURL with the source's url string | AC-3 | `pnpm vitest run components/cards/RecommendationSources.test.tsx` | [ ] TRUE [ ] FALSE |
| 4 | Each source Pressable has accessibilityRole='link' | AC-1 | `pnpm vitest run components/cards/RecommendationSources.test.tsx` | [ ] TRUE [ ] FALSE |

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------

1. `.spec/prd/smarter-chat-agent/05-uc-rec.md` (lines 176-188) — UC-REC-10
2. `components/cards/types/recommendation.ts` (ALL) — RecommendationSource shape
3. `components/ui/collapsible.tsx` (ALL) — existing Collapsible primitive (optional wrapper)

--------------------------------------------------------------------------------
GUARDRAILS
--------------------------------------------------------------------------------

WRITE-ALLOWED:
- `components/cards/RecommendationSources.tsx` (NEW)
- `components/cards/RecommendationSources.stories.tsx` (NEW)
- `components/cards/RecommendationSources.test.tsx` (NEW)

WRITE-PROHIBITED:
- `components/cards/RecommendationListCard.tsx` (REC-UI-005)

--------------------------------------------------------------------------------
CODE PATTERN (Reference)
--------------------------------------------------------------------------------

**Source**: `components/ui/collapsible.tsx`

```tsx
import { View, Pressable, Linking } from 'react-native'
import { Text } from '@/components/ui/text'
import type { RecommendationSourcesProps } from './types/recommendation'

export function RecommendationSources({ sources }: RecommendationSourcesProps) {
  if (sources.length === 0) return null
  return (
    <View testID="recommendation-list-sources" className="mt-2 border-t border-border pt-2 px-4 pb-2">
      <Text className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Sources</Text>
      <View className="flex-row flex-wrap gap-2">
        {sources.map((s, i) => (
          <Pressable
            key={s.url}
            accessibilityRole="link"
            onPress={() => Linking.openURL(s.url)}
            testID={`recommendation-source-${i}`}
          >
            <Text className="text-xs text-muted-foreground underline">{s.domain}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  )
}
```

**Anti-pattern**: Rendering the container even when sources is empty (shows an empty bordered box).

**Interaction notes**:
- Tiny text, muted color — doesn't dominate the card
- Tap opens URL via Linking
- Optional Collapsible wrapper via `components/ui/collapsible.tsx` if source count is large

**Design references**:
- `.spec/prd/smarter-chat-agent/05-uc-rec.md` UC-REC-10

--------------------------------------------------------------------------------
VERIFICATION GATES
--------------------------------------------------------------------------------

| Gate | Command | Expected |
|------|---------|----------|
| Unit tests | `pnpm vitest run components/cards/RecommendationSources.test.tsx` | Exit 0 |
| Type check | `pnpm tsc --noEmit` | Exit 0 |
| Lint | `pnpm lint` | Exit 0 |
| Storybook | `vitest --project=storybook --run` | Exit 0 |

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------

**Implementation Agent**: react-native-ui-implementer
**Rationale**: Simple list sub-component with tap-to-open, collapsible state, per-item testIDs.

**Review Agent**: react-native-ui-reviewer

--------------------------------------------------------------------------------
CODING STANDARDS
--------------------------------------------------------------------------------

- `CLAUDE.md` (React & React Native Rules section)
- `brain/docs/REACT-RULES.md`
- `brain/docs/THEME-RULES.md`

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------

**Depends On**: REC-UI-001
**Blocks**: REC-UI-005

--------------------------------------------------------------------------------
PRD REFS
--------------------------------------------------------------------------------

- `.spec/prd/smarter-chat-agent/05-uc-rec.md` UC-REC-10
- `.spec/prd/smarter-chat-agent/09-technical-requirements.md` Task #20

================================================================================
