# Deep Research Loading State Enhancement

## Overview

Enhanced deep research loading state to display the search query prominently while maintaining the session_id for reactive updates.

## Problem

The original loading state lacked context - users couldn't see what query was being researched while the system initialized. The request flow returns a `session_id` immediately, making it perfect for reactive query updates.

## Solution

### 1. API Response Analysis

From `supabase/functions/chat-router/handlers/deep-research.ts:796-913`:

```typescript
// Immediate response with session_id
return jsonResponse<StartResponse>({
  session_id: sessionId,  // ✅ Research record ID for reactive queries
  task_id: taskId,
  status: 'running',
  message: `Deep research session started for topic: "${body.topic}"`
})
```

**Key Finding**: The `session_id` is returned immediately and represents an open research record that can be queried reactively for progress updates.

### 2. New Component: DeepResearchLoadingCard

**Location**: `components/deep-research/DeepResearchLoadingCard.tsx`

**Design Concept**: Kinetic Typography meets Terminal Aesthetic
- **Typography**: Monospace query text with subtle glow animation
- **Visual Effects**: Pulsing cyan gradient border, staggered dot animation
- **Color Palette**: High-contrast cyan (#06b6d4) on dark background
- **Motion**: Multiple coordinated animations (pulse, glow, rotation, staggered dots)

**Key Features**:
1. **Query Display**: Shows search query in terminal-style code block
   - Monospace font with line clamping (3 lines max)
   - Animated glow effect on query text
   - Terminal window chrome (colored dots, filename)
   - Cursor with animated dots

2. **Loading Indicators**:
   - Animated spinner with rotation
   - Pulsing progress bar
   - Staggered dot animation (depth effect)
   - "INIT" status badge

3. **Animations**:
   - Border pulse (2s loop)
   - Text glow (1.5s loop)
   - Spinner rotation (1s loop)
   - Dot cascade (200ms stagger)

### 3. Props Interface

```typescript
interface DeepResearchLoadingCardProps {
  query: string              // The search query/topic
  message?: string           // Optional loading message
  className?: string         // Custom styling
}
```

### 4. Usage Pattern

```typescript
// In MessageBubble or chat component
<DeepResearchLoadingCard
  query="what tools exist to migrate dropbox to google drive"
  message="Initializing research session..."
/>
```

### 5. Reactive Query Integration

The component works with the existing `session_id` returned from the API:

```typescript
// Step 1: Initiate research, get session_id
const response = await startDeepResearch(topic)
const { session_id } = response

// Step 2: Show loading card with query
<DeepResearchLoadingCard query={topic} />

// Step 3: Set up reactive query using session_id
const session = useQuery(api.deepResearchSessions.get, {
  sessionId: session_id
})

// Step 4: Update UI when iterations arrive
{session?.status === 'running' && (
  <IterationCard iteration={session.currentIteration} />
)}
```

## Design Philosophy

### Aesthetic Direction: Terminal Futurism

**Why This Works**:
1. **Contextual**: Research queries are often technical, terminal aesthetic fits
2. **Distinctive**: Avoids generic "spinner + text" patterns
3. **Informative**: Query is the hero, animations are supporting cast
4. **Performant**: CSS/RN animations, no heavy libraries

**Visual Hierarchy**:
1. Query text (largest, glowing, monospace)
2. Loading spinner + message (secondary)
3. Progress bar + status (tertiary)

**Color Strategy**:
- Cyan (#06b6d4): Primary accent, tech/research association
- Black/dark backgrounds: High contrast terminal aesthetic
- Opacity variations: Depth and focus

## Files Created

1. `components/deep-research/DeepResearchLoadingCard.tsx` - Main component
2. `components/deep-research/DeepResearchLoadingCard.stories.tsx` - Storybook stories

## Testing in Storybook

Run Storybook to preview:
```bash
pnpm storybook
```

Navigate to: `Deep Research > DeepResearchLoadingCard`

**Stories**:
- Default: Standard query
- ShortQuery: Minimal text
- LongQuery: Text truncation test
- CustomMessage: Different loading messages
- TechnicalQuery: Tech example
- BusinessQuery: Business example
- AllVariants: Side-by-side comparison

## Next Steps

1. **Integration**: Replace generic loading state in MessageBubble
2. **Reactive Query**: Implement useQuery hook with session_id
3. **Transition**: Add smooth fade from loading → iteration cards
4. **Error State**: Add error variant for failed initialization

## Technical Notes

### Animation Performance

All animations use:
- `useNativeDriver: true` where possible (transforms)
- `useNativeDriver: false` for opacity/color (required)
- Animated.loop for continuous effects
- Easing functions for smooth motion

### React Native Considerations

- No web-specific features (CSS animations, SVG paths)
- All colors use TailwindCSS classes
- Responsive to theme changes (dark/light mode)
- Proper TypeScript types throughout

## Design Rationale

**Why not use the existing ResultCard loading prop?**

The ResultCard loading state is generic:
```tsx
<ActivityIndicator size="small" />
<Text>Loading...</Text>
```

Deep research needs:
- Query context (what are we researching?)
- Long-running task indication (not a quick fetch)
- Visual distinction from standard searches
- Engaging animation for extended wait times

**Why cyan?**

- Tech/research association (terminals, code editors)
- High contrast on both light/dark themes
- Distinct from primary brand colors
- Energetic without being overwhelming

**Why terminal aesthetic?**

- Matches research/technical context
- Distinctive, memorable
- Sophisticated without being pretentious
- Natural fit for monospace query display

## Implementation Checklist

- [x] Create DeepResearchLoadingCard component
- [x] Add Storybook stories
- [x] Document API response structure
- [x] Document reactive query pattern
- [ ] Integrate into MessageBubble
- [ ] Add session_id reactive query
- [ ] Test with real API calls
- [ ] Add error state variant
- [ ] Performance testing on device

## References

- API Handler: `supabase/functions/chat-router/handlers/deep-research.ts:796-913`
- Types: `lib/types/deep-research.ts`
- Existing Loading: `components/ui/result-card.tsx:122-136`
- Message Rendering: `components/chat/MessageBubble.tsx`
