================================================================================
TASK: REC-UI-002 - RecommendationItem component with tap-to-call/website/maps
================================================================================

TASK_TYPE: FEATURE
STATUS: Backlog
TDD_PHASE: RED
CURRENT_AC: AC-1
PRIORITY: P0
EFFORT: M
TYPE: DEV
AGENT: react-native-ui-implementer
ESTIMATE_MINUTES: 180
ITERATION: 1

--------------------------------------------------------------------------------
CRITICAL CONSTRAINTS
--------------------------------------------------------------------------------

MUST:
- MUST import Text from '@/components/ui/text' and use Tailwind className for all colors/spacing
- MUST strip non-digit chars from phone before calling Linking.openURL('tel:' + digits)
- MUST use Platform.OS to choose 'maps:?q=' on iOS and 'geo:0,0?q=' on Android
- MUST call Linking.canOpenURL and fall back via onLinkingFallback callback when false
- MUST hide phone/website/location chips when corresponding fields are undefined
- MUST expose testID='recommendation-item-{index}' plus chip testIDs 'recommendation-item-{index}-phone', '-website', '-location'
- MUST invoke onLongPress callback with the item on long press (delayLongPress={400})

NEVER:
- NEVER import Text from 'react-native' or 'react-native-paper'
- NEVER pass unformatted phone strings with spaces/dashes to tel: URL
- NEVER render a chip when its underlying field is null/undefined

STRICTLY:
- STRICTLY TDD — mock Linking with vi.mock and assert exact URL strings
- STRICTLY import RecommendationItemData from components/cards/types/recommendation.ts (single source of truth)

--------------------------------------------------------------------------------
SPECIFICATION
--------------------------------------------------------------------------------

**Objective**: Render a single recommendation with name, specialty/description, rating, location, why-it-fits, and tappable phone/website/location chips wired to native apps.

**Success looks like**: Component renders in Storybook (Default, WithAllFields, WithMissingFields, LongWhyItFits, Pressed, DarkMode), 8+ unit tests pass, Linking mock asserts exact URLs.

--------------------------------------------------------------------------------
BACKGROUND
--------------------------------------------------------------------------------

**Problem**: The mobile app has no component that renders a single recommendation with native tap-to-call, tap-to-website, tap-to-maps integrations. Building this in the container component (REC-UI-005) would make it untestable at the unit level.

**Why it matters**: This is the primary interactive surface for the feature. Every chip needs a testID, every URL needs to be exactly right, and platform differences (iOS maps vs Android geo) must be handled correctly.

**Current state**: Existing result_card components (article, stats) don't have tap-to-call or platform-specific maps URLs.

**Desired state**: A reusable RecommendationItem that handles all Linking concerns internally, with a clean props contract and comprehensive tests.

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD Beads)
--------------------------------------------------------------------------------

AC-1: renders name and whyRecommended
  GIVEN: an item with name='Jane Doe' and whyRecommended='Specializes in autism'
  WHEN: rendered
  THEN: both texts are visible
  VERIFY: `pnpm vitest run components/cards/RecommendationItem.test.tsx`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

AC-2: tap phone opens tel: URL with digits only
  GIVEN: contact.phone='(415) 555-1234'
  WHEN: user presses the phone chip
  THEN: Linking.openURL is called with 'tel:4155551234'
  VERIFY: `pnpm vitest run components/cards/RecommendationItem.test.tsx`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

AC-3: tap location opens maps: on iOS
  GIVEN: Platform.OS='ios' and location='Oakland, CA'
  WHEN: user presses the location chip
  THEN: Linking.openURL is called with a URL beginning 'maps:?q='
  VERIFY: `pnpm vitest run components/cards/RecommendationItem.test.tsx`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

AC-4: tap location opens geo: on Android
  GIVEN: Platform.OS='android' and location='Oakland, CA'
  WHEN: user presses the location chip
  THEN: Linking.openURL is called with a URL beginning 'geo:0,0?q='
  VERIFY: `pnpm vitest run components/cards/RecommendationItem.test.tsx`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

AC-5: hides missing chips
  GIVEN: an item with no phone and no website
  WHEN: rendered
  THEN: no phone or website chip testIDs are in the tree
  VERIFY: `pnpm vitest run components/cards/RecommendationItem.test.tsx`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

AC-6: long-press fires callback
  GIVEN: onLongPress mock
  WHEN: user long-presses the item
  THEN: onLongPress is called once with the item
  VERIFY: `pnpm vitest run components/cards/RecommendationItem.test.tsx`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

AC-7: storybook renders all stories
  GIVEN: 6 stories
  WHEN: storybook vitest runs
  THEN: all stories render without throwing
  VERIFY: `vitest --project=storybook --run`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

--------------------------------------------------------------------------------
TEST CRITERIA (Boolean Verification)
--------------------------------------------------------------------------------

| # | Boolean Statement | Maps To AC | Verify | Status |
|---|-------------------|------------|--------|--------|
| 1 | RecommendationItem renders the name prop as a visible Text | AC-1 | `pnpm vitest run components/cards/RecommendationItem.test.tsx` | [ ] TRUE [ ] FALSE |
| 2 | Pressing the phone chip calls Linking.openURL with 'tel:4155551234' when contact.phone='(415) 555-1234' | AC-2 | `pnpm vitest run components/cards/RecommendationItem.test.tsx` | [ ] TRUE [ ] FALSE |
| 3 | Pressing location chip on iOS calls Linking.openURL with a URL starting with 'maps:?q=' | AC-3 | `pnpm vitest run components/cards/RecommendationItem.test.tsx` | [ ] TRUE [ ] FALSE |
| 4 | Pressing location chip on Android calls Linking.openURL with a URL starting with 'geo:0,0?q=' | AC-4 | `pnpm vitest run components/cards/RecommendationItem.test.tsx` | [ ] TRUE [ ] FALSE |
| 5 | No element with testID matching /-phone$/ exists when contact.phone is undefined | AC-5 | `pnpm vitest run components/cards/RecommendationItem.test.tsx` | [ ] TRUE [ ] FALSE |
| 6 | onLongPress callback receives the RecommendationItemData object when long-pressed | AC-6 | `pnpm vitest run components/cards/RecommendationItem.test.tsx` | [ ] TRUE [ ] FALSE |
| 7 | Linking.canOpenURL returning false triggers the onLinkingFallback callback with the attempted URL | AC-2 | `pnpm vitest run components/cards/RecommendationItem.test.tsx` | [ ] TRUE [ ] FALSE |

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------

1. `.spec/prd/smarter-chat-agent/05-uc-rec.md` (lines 124-174) — UC-REC-07/08/09 ACs
2. `components/ui/result-card.tsx` (lines 109-215) — existing card Pressable pattern with testIDs
3. `components/cards/types/recommendation.ts` (ALL) — RecommendationItemData type (from REC-UI-001)

--------------------------------------------------------------------------------
GUARDRAILS
--------------------------------------------------------------------------------

WRITE-ALLOWED:
- `components/cards/RecommendationItem.tsx` (NEW)
- `components/cards/RecommendationItem.stories.tsx` (NEW)
- `components/cards/RecommendationItem.test.tsx` (NEW)

WRITE-PROHIBITED:
- `components/cards/RecommendationListCard.tsx` (REC-UI-005)
- `components/cards/RecommendationActionSheet.tsx` (REC-UI-004)
- `components/chat/ChatThread.tsx` (integration in INT-UI-001)

--------------------------------------------------------------------------------
CODE PATTERN (Reference)
--------------------------------------------------------------------------------

**Source**: `components/ui/result-card.tsx` (Pressable+testID pattern)

```tsx
import { Pressable, Linking, Platform, View } from 'react-native'
import { Text } from '@/components/ui/text'
import type { RecommendationItemProps } from './types/recommendation'

const openPhone = async (raw: string, fallback?: (url: string) => void) => {
  const digits = raw.replace(/\D/g, '')
  const url = `tel:${digits}`
  if (await Linking.canOpenURL(url)) Linking.openURL(url)
  else fallback?.(url)
}

const openMaps = async (location: string, fallback?: (url: string) => void) => {
  const encoded = encodeURIComponent(location)
  const url = Platform.OS === 'ios' ? `maps:?q=${encoded}` : `geo:0,0?q=${encoded}`
  if (await Linking.canOpenURL(url)) Linking.openURL(url)
  else fallback?.(url)
}

export function RecommendationItem({ item, index, onLongPress, onLinkingFallback }: RecommendationItemProps) {
  return (
    <Pressable
      testID={`recommendation-item-${index}`}
      delayLongPress={400}
      onLongPress={() => onLongPress?.(item)}
      className="p-4 border-b border-border active:bg-muted/50"
    >
      <Text className="text-base font-semibold text-foreground">{item.name}</Text>
      {item.description && (
        <Text className="text-sm text-muted-foreground mt-1">{item.description}</Text>
      )}
      <View className="flex-row flex-wrap gap-2 mt-2">
        {item.contact?.phone && (
          <Pressable
            testID={`recommendation-item-${index}-phone`}
            onPress={() => openPhone(item.contact!.phone!, onLinkingFallback)}
            className="px-2 py-1 rounded-full bg-muted"
          >
            <Text className="text-xs text-foreground">{item.contact.phone}</Text>
          </Pressable>
        )}
        {item.location && (
          <Pressable
            testID={`recommendation-item-${index}-location`}
            onPress={() => openMaps(item.location!, onLinkingFallback)}
            className="px-2 py-1 rounded-full bg-muted"
          >
            <Text className="text-xs text-foreground">{item.location}</Text>
          </Pressable>
        )}
        {/* website chip similar */}
      </View>
      {item.whyRecommended && (
        <Text className="text-sm text-muted-foreground mt-2 italic">{item.whyRecommended}</Text>
      )}
    </Pressable>
  )
}
```

**Anti-pattern**: `Linking.openURL(`tel:${item.contact.phone}`)` — includes spaces and parens.

**Interaction notes**:
- `delayLongPress={400}` prevents conflict with scroll gestures
- Phone strip regex: `phone.replace(/\D/g, '')`
- iOS maps scheme `maps:?q=` + `encodeURIComponent(location)`
- Android geo scheme `geo:0,0?q=` + `encodeURIComponent(location)`

**Design references**:
- `.spec/prd/smarter-chat-agent/05-uc-rec.md` UC-REC-07 / UC-REC-08

--------------------------------------------------------------------------------
VERIFICATION GATES
--------------------------------------------------------------------------------

| Gate | Command | Expected |
|------|---------|----------|
| Unit tests | `pnpm vitest run components/cards/RecommendationItem.test.tsx` | Exit 0 |
| Type check | `pnpm tsc --noEmit` | Exit 0 |
| Lint | `pnpm lint` | Exit 0 |
| Storybook | `vitest --project=storybook --run` | Exit 0 |

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------

**Implementation Agent**: react-native-ui-implementer
**Rationale**: Item card with Linking integration, long-press, conditional chips, multiple test paths.

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

- `.spec/prd/smarter-chat-agent/05-uc-rec.md` UC-REC-07 / UC-REC-08 / UC-REC-09
- `.spec/prd/smarter-chat-agent/09-technical-requirements.md` Task #19

================================================================================
