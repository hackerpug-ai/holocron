## Revision 1 - 2026-07-24T03:00:00Z

### Reviewer: react-native-ui-reviewer

### Issues Found
- AC-1 theme FAIL: 55 hex colors (39 production); whats-new platform/category/freshness maps, settings swatches, placeholderTextColor hex, numeric spacing
- AC-2 a11y/ScreenLayout FAIL: ScreenLayout only on 4/14 drawer routes; missing testID/a11y on research/improvements/whats-new detail chrome
- AC-3 contract PASS: 105/105
- AC-4 artifact PASS

### What Implementation Tried
- S-REWRITE-01..04 rewired data plane Convex→Zero/Hono; S-REWRITE-05 no-convex gate; INTEGRATE on main @ 1c5745df

### Why It Failed
- Data rewiring preserved pre-existing theme/a11y debt; ScreenLayout not applied to detail/wrapper routes; brand hex left as literals

### Suggested Different Approach
1. ScreenLayout on every content (drawer)/ screen except navigator _layout
2. Theme extension for brand/platform/category/freshness colors
3. Systematic testID+a11y pass on all Pressable/Button states

### Files to Focus On
- app/(drawer)/chat/[conversationId].tsx
- app/(drawer)/research/[sessionId].tsx
- app/(drawer)/improvements/[requestId].tsx
- app/(drawer)/whats-new/[reportId].tsx
- app/(drawer)/subscriptions/{feed,social}.tsx
- components/whats-new/{NewsfeedHeader,categoryColors,SocialPosts*}
- screens/settings-screen.tsx

---
