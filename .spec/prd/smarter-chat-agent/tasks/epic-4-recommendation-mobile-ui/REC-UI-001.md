================================================================================
TASK: REC-UI-001 - RecommendationListCard types and props contract
================================================================================

TASK_TYPE: FEATURE
STATUS: Backlog
TDD_PHASE: RED
CURRENT_AC: AC-1
PRIORITY: P0
EFFORT: XS
TYPE: DEV
AGENT: react-native-ui-implementer
ESTIMATE_MINUTES: 45
ITERATION: 1

--------------------------------------------------------------------------------
CRITICAL CONSTRAINTS
--------------------------------------------------------------------------------

MUST:
- MUST define RecommendationItemData, RecommendationListCardData, RecommendationSource TypeScript interfaces matching backend REC-002 card payload shape (items, sources, durationMs, query)
- MUST export a card_type discriminator literal 'recommendation_list' usable by ChatThread dispatcher
- MUST export component prop interfaces (RecommendationListCardProps, RecommendationItemProps, RecommendationSourcesProps, RecommendationActionSheetProps)

NEVER:
- NEVER import anything from react-native-paper (project uses NativeWind + @/components/ui/text)
- NEVER use `any` in any exported type

STRICTLY:
- STRICTLY place file at components/cards/types/recommendation.ts — no co-located types inside component files

--------------------------------------------------------------------------------
SPECIFICATION
--------------------------------------------------------------------------------

**Objective**: Create the canonical TypeScript types and prop interfaces for the recommendation card family so downstream component tasks can import a single source of truth.

**Success looks like**: `components/cards/types/recommendation.ts` exists, exports 8+ named types, compiles with `pnpm tsc --noEmit`, and matches the backend cardData shape documented in UC-REC-04.

--------------------------------------------------------------------------------
BACKGROUND
--------------------------------------------------------------------------------

**Problem**: Without a shared types file, each downstream component (Item, Sources, ActionSheet, ListCard, ChatThread dispatch) would redefine the same data shape with subtle drift.

**Why it matters**: Types are the contract between the backend card payload (REC-003) and every mobile consumer. A shared file prevents circular imports and drift.

**Current state**: No types exist for the recommendation card family.

**Desired state**: `components/cards/types/recommendation.ts` exports all types needed by REC-UI-002 through REC-UI-006 and INT-UI-001.

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD Beads)
--------------------------------------------------------------------------------

AC-1: Types file exists and compiles
  GIVEN: a clean repo
  WHEN: the developer runs pnpm tsc --noEmit
  THEN: the command exits 0 and components/cards/types/recommendation.ts is importable
  VERIFY: `pnpm tsc --noEmit`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

AC-2: card_type literal matches backend
  GIVEN: the types file
  WHEN: card_type is inspected
  THEN: it equals the literal string 'recommendation_list' matching UC-REC-04 acceptance criteria
  VERIFY: `pnpm tsc --noEmit`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

AC-3: Item shape includes all required fields
  GIVEN: RecommendationItemData
  WHEN: inspected
  THEN: it exposes name, description?, contact?, location?, pricing?, rating?, whyRecommended?, sourceIndices
  VERIFY: `pnpm tsc --noEmit`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

AC-4: No paper imports
  GIVEN: the new file
  WHEN: grepped for react-native-paper
  THEN: no matches are found
  VERIFY: `! grep -q 'react-native-paper' components/cards/types/recommendation.ts && pnpm lint`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

--------------------------------------------------------------------------------
TEST CRITERIA (Boolean Verification)
--------------------------------------------------------------------------------

| # | Boolean Statement | Maps To AC | Verify | Status |
|---|-------------------|------------|--------|--------|
| 1 | components/cards/types/recommendation.ts exports type RecommendationListCardData | AC-1 | `pnpm tsc --noEmit` | [ ] TRUE [ ] FALSE |
| 2 | RecommendationListCardData.card_type is the literal string 'recommendation_list' | AC-2 | `pnpm tsc --noEmit` | [ ] TRUE [ ] FALSE |
| 3 | RecommendationItemData declares optional contact, location, pricing, rating, whyRecommended fields | AC-3 | `pnpm tsc --noEmit` | [ ] TRUE [ ] FALSE |
| 4 | No import statement references 'react-native-paper' in the new file | AC-4 | `! grep -q 'react-native-paper' components/cards/types/recommendation.ts` | [ ] TRUE [ ] FALSE |

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------

1. `.spec/prd/smarter-chat-agent/05-uc-rec.md` (ALL) — UC-REC-04 cardData shape and UC-REC-07 component props
2. `.spec/prd/smarter-chat-agent/09-technical-requirements.md` (lines 545-570) — Task #16 file path and verify command
3. `lib/types/chat.ts` (ALL) — existing ArticleCardData / StatsCardData patterns to mirror
4. `components/ui/result-card.tsx` (lines 1-60) — existing discriminated-union card type pattern

--------------------------------------------------------------------------------
GUARDRAILS
--------------------------------------------------------------------------------

WRITE-ALLOWED:
- `components/cards/types/recommendation.ts` (NEW)

WRITE-PROHIBITED:
- `components/cards/*` (NEW components are separate tasks)
- `convex/**` (backend is out of scope)
- `lib/types/chat.ts` (do not modify existing card union — add new file instead)

--------------------------------------------------------------------------------
CODE PATTERN (Reference)
--------------------------------------------------------------------------------

**Source**: `lib/types/chat.ts` (existing ArticleCardData pattern)

```ts
export interface RecommendationSource {
  title: string
  url: string
  snippet: string
  domain: string
}

export interface RecommendationContact {
  phone?: string
  website?: string
  email?: string
}

export interface RecommendationItemData {
  name: string
  description?: string
  contact?: RecommendationContact
  location?: string
  pricing?: string
  rating?: number
  whyRecommended?: string
  sourceIndices: number[]
}

export interface RecommendationListCardData {
  card_type: 'recommendation_list'
  items: RecommendationItemData[]
  sources: RecommendationSource[]
  query: string
  durationMs: number
}

export interface RecommendationListCardProps {
  payload: RecommendationListCardData
  onSaveAllToKB?: (items: RecommendationItemData[]) => void
  onSaveRecommendation?: (item: RecommendationItemData) => void
}

export interface RecommendationItemProps {
  item: RecommendationItemData
  index: number
  onLongPress?: (item: RecommendationItemData) => void
  onLinkingFallback?: (url: string) => void
}

export interface RecommendationSourcesProps {
  sources: RecommendationSource[]
}

export interface RecommendationActionSheetProps {
  item: RecommendationItemData | null
  visible: boolean
  onDismiss: () => void
  onSaveRecommendation: (item: RecommendationItemData) => void
}
```

**Anti-pattern**: Declaring types inline inside `RecommendationListCard.tsx` — downstream components would circularly import from a component file.

**Interaction notes**:
- Pure types — no runtime behavior
- Source indices are number[] so an item can cite multiple sources

**Design references**:
- `.spec/prd/smarter-chat-agent/05-uc-rec.md` UC-REC-04

--------------------------------------------------------------------------------
VERIFICATION GATES
--------------------------------------------------------------------------------

| Gate | Command | Expected |
|------|---------|----------|
| Type check | `pnpm tsc --noEmit` | Exit 0 |
| Lint | `pnpm lint` | Exit 0 |

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------

**Implementation Agent**: react-native-ui-implementer
**Rationale**: Pure TypeScript type scaffolding for downstream UI components; no visual work.

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

**Depends On**: REC-003 (for cardData shape)
**Blocks**: REC-UI-002, REC-UI-003, REC-UI-004, REC-UI-005, REC-UI-006, INT-UI-001

--------------------------------------------------------------------------------
PRD REFS
--------------------------------------------------------------------------------

- `.spec/prd/smarter-chat-agent/05-uc-rec.md` UC-REC-04 / UC-REC-07
- `.spec/prd/smarter-chat-agent/09-technical-requirements.md` Task #16

================================================================================
