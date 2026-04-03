# US-IMP-005: Subscriptions Redesign - What's New

> Task ID: US-IMP-005
> Type: FEATURE
> Priority: P1
> Estimate: 240 minutes
> Assignee: frontend-designer

## CRITICAL CONSTRAINTS

### MUST
- Design What's New as fixed card-based stream (not scroll-based list)
- Include multimedia images for each news item
- Display actual what's new report content with AI-generated summaries
- Maintain existing What's New data compatibility

### NEVER
- Remove existing What's New functionality during transition
- Break What's New report generation system

### STRICTLY
- Cards MUST be fixed layout (not masonry/grid)
- AI summary MUST be generated for each What's New item
- Images MUST be pulled from feed content

## SPECIFICATION

**Objective:** Redesign What's New section as a fixed card-based stream with multimedia images and AI summaries, displaying actual what's new report content.

**Success looks like:** Users see What's New as a beautiful card stream where each card has an image, AI summary, and key news points, all in a consistent fixed-width layout.

## ACCEPTANCE CRITERIA

| # | Given | When | Then | Verify |
|---|-------|------|------|--------|
| 1 | User opens What's New screen | Screen loads | Cards display in fixed-width stream layout | Open What's New and check for `className="card-stream"` |
| 2 | What's New feed item has images | Feed syncs | Card displays relevant image from content | Check card DOM for `<img>` or `<Image>` with feed source |
| 3 | What's New report is generated | Report completes | AI summary appears on card | `npx convex run whatsNew/queries:get | jq '.summary' | grep -q '.'` |
| 4 | User scrolls through cards | Scroll event | Cards animate in smoothly (staggered fade-in) | Scroll and observe card entrance animations |

## TEST CRITERIA

Review agents verify ALL test criteria are TRUE before marking task complete.

| # | Boolean Statement | Maps To AC | Verify | Status |
|---|-------------------|------------|--------|--------|
| 1 | What's New screen uses fixed card layout when rendered | AC-1 | `Check DOM for cards with consistent width (not masonry)` | [ ] TRUE [ ] FALSE |
| 2 | Feed item images display on cards when content has images | AC-2 | `npx convex run feeds/queries:getFeed | jq '.[].imageUrl' | grep -q 'http'` | [ ] TRUE [ ] FALSE |
| 3 | AI summary exists for each What's New item when report generates | AC-3 | `npx convex run whatsNew/quality:logSummaryGeneration | jq '.summary' | grep -q '[A-Z]'` | [ ] TRUE [ ] FALSE |
| 4 | Cards animate in on scroll when user scrolls | AC-4 | `Scroll What's New screen, observe card entrance animations` | [ ] TRUE [ ] FALSE |

## GUARDRAILS

### WRITE-ALLOWED
- `app/(drawer)/whats-new.tsx` (MODIFY) - Redesign screen layout
- `components/feed/NewsCard.tsx` (NEW) - Fixed card component
- `components/feed/NewsCardStream.tsx` (NEW) - Card stream layout
- `convex/whatsNew/queries.ts` (MODIFY) - Add summary field
- `convex/feeds/internal.ts` (MODIFY) - Extract images from feed

### WRITE-PROHIBITED
- `convex/schema.ts` - Schema changes need separate task
- Existing feed sync logic - Don't break feed ingestion

## DESIGN

### References
- Current What's New screen in `app/(drawer)/whats-new.tsx`
- Feed queries in `convex/feeds/queries.ts`
- What's New quality in `convex/whatsNew/quality.ts`

### Interaction Notes
- Fixed card width (e.g., 350px) with consistent spacing
- Images should be 16:9 or 4:3 aspect ratio
- AI summary should be 2-3 sentences max
- Cards should support press to open full article

### Code Pattern
Fixed card stream pattern:
```typescript
<ScrollView horizontal={false} style={styles.stream}>
  {feedItems.map(item => (
    <NewsCard
      key={item._id}
      item={item}
      style={styles.card}
      width={CARD_WIDTH}
    />
  ))}
</ScrollView>

const styles = StyleSheet.create({
  stream: {
    padding: semantic.space.md,
  },
  card: {
    width: CARD_WIDTH,
    marginBottom: semantic.space.lg,
  },
});
```

### Anti-pattern (DO NOT)
```typescript
// DON'T: Use masonry/grid
<MasonryGrid columns={2}>

// DO: Use fixed-width vertical stream
<ScrollView with fixed-width cards>
```

## CODING STANDARDS

- **brain/docs/REACT-RULES.md**:
  - Use react-native-paper Card component
  - All images must have accessible alt text
- **brain/docs/THEME-RULES.md**:
  - Use semantic spacing for card layout
  - Follow elevation tokens for card shadows

## DEPENDENCIES

No task dependencies (this is the foundation for US-IMP-006 and US-IMP-007).

## REQUIRED READING

1. `app/(drawer)/whats-new.tsx` - ALL
   Focus: Current What's New implementation

2. `convex/feeds/queries.ts` - ALL
   Focus: How feed data is retrieved

3. `components/feed/FeedCard.tsx` (if exists) - ALL
   Focus: Existing feed card patterns

4. `brain/docs/TDD-METHODOLOGY.md` - Sections: TDD Cycle
   Focus: RED → GREEN → REFACTOR workflow

## NOTES

- Card dimensions: 350px width, variable height
- Image aspect ratio: 16:9 recommended
- AI summary should use existing whatsNew quality system
- Consider skeleton loading state for cards
- Test with feed items that have no images (fallback UI)
