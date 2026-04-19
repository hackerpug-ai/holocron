# PRD: Signal Intelligence Newsfeed Redesign

**Version:** 1.0
**Status:** Approved
**Created:** 2026-04-19

---

## Overview

The What's New screen currently wraps `SubscriptionFeedScreen` — a generic component not designed for a premium daily reading experience. This redesign creates a purpose-built "Intelligence Briefing" newsfeed that makes each day's AI/tech findings a delight to read.

The backend is already complete (daily cron at 6 AM PST, structured findings with score/velocity/category, `findingsJson` per report). This PRD is entirely frontend.

---

## Aesthetic Direction: "Signal Intelligence"

Dark editorial briefing — authoritative, data-forward. Think: premium intelligence service crossed with a financial terminal. Not a generic news app.

Key differentiators:
- **Left-border category accents** instead of pill badges (discovery=amber, release=emerald, trend=blue, discussion=slate)
- **Hero treatment** for the highest-scored finding (enlarged typography, wider border)
- **Editorial header** surfacing date, freshness, and finding counts prominently
- **Horizontal filter bar** with category icons and count badges

---

## Scope

### S1: NewsfeedHeader

`components/whats-new/NewsfeedHeader.tsx`

Editorial date + stats + freshness indicator.

- Format: "SAT, APR 19" derived from `report.createdAt`
- Freshness dot: green if < 6h old, amber if < 24h, red if older
- Stats: "{findingsCount} findings · {sourceCount} sources · Generated {relativeTime}"
- Props: `report: { createdAt: number, findingsCount: number, summaryJson?: { sources?: unknown[] } } | null`
- Uses `Text` from `@/components/ui/text`

---

### S2: NewsfeedFilterBar

`components/whats-new/NewsfeedFilterBar.tsx`

Horizontal scrolling filter pills.

- `ScrollView horizontal showsHorizontalScrollIndicator={false}`
- Active: `bg-primary text-primary-foreground` (NativeWind)
- Inactive: `bg-muted text-muted-foreground`
- Icons: `Sparkles` (discovery), `Package` (release), `TrendingUp` (trend), `MessageSquare` (discussion)
- "ALL" pill with total count always first
- Props: `options: { key, label, count }[], selected: string, onChange: (key: string) => void`

---

### S3: NewsfeedFindingCard

`components/whats-new/NewsfeedFindingCard.tsx`

Redesigned finding card — list-row aesthetic, not heavy Card wrapper.

- Left border accent (3px) via inline `style={{ borderLeftColor, borderLeftWidth: 3 }}`
- Category colors from shared `CATEGORY_COLORS` const (see S3a)
- No pill badge — category label is plain colored `Text`
- Score shown as dot indicators ●●●●○ (score/10 → 5 dots)
- `StyleSheet.hairlineWidth` bottom border separator
- Props: same as existing `WhatsNewFindingCardProps`

**S3a: Shared `CATEGORY_COLORS` constant**

`components/whats-new/categoryColors.ts`

```ts
export const CATEGORY_COLORS = {
  discovery: '#F59E0B',
  release:   '#10B981',
  trend:     '#3B82F6',
  discussion: '#6B7280',
} as const
export type CategoryKey = keyof typeof CATEGORY_COLORS
```

---

### S4: NewsfeedHeroCard

`components/whats-new/NewsfeedHeroCard.tsx`

Hero treatment for the first (highest-scored) non-social finding.

- `Card` wrapper from `@/components/ui/card`, `px-5 py-5` padding
- Title: `font-extrabold text-xl` (NativeWind), `numberOfLines={3}`, tight lineHeight
- Summary: `numberOfLines={4}` (vs 3 on regular cards)
- Left border: 4px wide (vs 3px on regular cards)
- "TOP SIGNAL" eyebrow label: `text-xs uppercase text-muted-foreground`
- Bottom row: velocity + source + time in `flex-row justify-between`
- Props: same `WhatsNewFindingCardProps` shape, `onPress` required

---

### S5: NewsfeedScreen

`components/whats-new/NewsfeedScreen.tsx`

Main screen orchestrator. Replaces `SubscriptionFeedScreen` on the whats-new route.

Key decisions:
- Hero card = `nonSocialFindings[0]` in `ListHeaderComponent`
- FlatList `data` = `nonSocialFindings.slice(1)` (filtered by active category)
- Filter logic: same `toCategoryArg` + `isSocialSource` pattern as `SubscriptionFeedScreen`
- Search: same `SearchInput` + `useQuery(api.subscriptions.queries.searchContent)` + `SearchContentCard`
- Pull-to-refresh: `RefreshControl` → `refresh()` from `useWhatsNewFeed`
- `WebViewSheet`, `OfflineBanner`, `QueueIndicator`, `SocialPostsGroupCard`, `FeedSkeleton` all retained

Hooks used:
- `useWhatsNewFeed` → `{ findings, report, isLoading, isRefreshing, refresh }`
- `useWebView` → `{ webViewState, openUrl, closeWebView }`
- `useOfflineQueue` → `{ queueLength }`

---

### S6: Route Update

`app/(drawer)/whats-new/index.tsx`

Swap `SubscriptionFeedScreen` → `NewsfeedScreen`. One import change, one JSX swap. `ScreenLayout` wrapper, back navigation, and `testID` preserved unchanged.

---

## Non-Goals

- Backend changes (schema, queries, mutations, crons) — none needed
- Modifications to `SubscriptionFeedScreen` or `WhatsNewFindingCard` — preserved for subscriptions tab
- Dark/light mode toggle — follow existing theme system

---

## Verification

1. Open iOS simulator, navigate to What's New via drawer
2. Header shows today's date + correct freshness dot color
3. First item renders as hero card (enlarged, wider border, eyebrow label)
4. Remaining items have 3px left-border accent in category color
5. Filter bar shows category counts; tapping filters the feed
6. Pull-to-refresh triggers generation + shows skeleton
7. Tapping any card opens `WebViewSheet`
8. Social group card routes to `/subscriptions/social`
9. Search activates at 2+ characters
10. `pnpm tsc --noEmit` passes; `vitest run` passes
