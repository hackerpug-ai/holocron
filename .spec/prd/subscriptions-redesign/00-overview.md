# Subscriptions Redesign - Overview

## Product Vision

Transform Holocron's subscriptions from a management-focused interface into an AI-driven, personalized content discovery experience. What's New becomes the primary engagement surface with rich multimedia, intelligent summaries, and user-tuned recommendations.

## Current State

### Navigation Structure
```
Drawer (Main Navigation)
├── Chat
├── Articles
├── Toolbelt
├── Subscriptions ← Currently top-level (management view)
│   ├── Feed (What's New)
│   └── Settings
├── Improvements
└── Settings
```

### What's New Experience
- **Format**: Text-heavy feed of findings
- **Content**: AI-generated markdown reports
- **Visuals**: Limited multimedia support
- **Personalization**: None - all users see same content
- **Engagement**: Passive consumption only

### Pain Points

1. **Navigation Clutter**
   - Subscription management is infrequent (once every few weeks)
   - Occupies prime drawer space alongside daily-use features
   - Should be in settings like other low-frequency actions

2. **Content Density**
   - Current feed is overwhelming wall of text
   - No visual hierarchy or multimedia breaks
   - Difficult to scan at a glance
   - Images, videos, embedded content not supported

3. **No User Agency**
   - Cannot influence what content appears
   - No way to say "I like this kind of content"
   - No way to filter out irrelevant topics
   - One-size-fits-all feed

## Target State

### New Navigation Structure
```
Drawer (Main Navigation)
├── Chat
├── What's New ← Renamed from Subscriptions, now content-focused
├── Articles
├── Toolbelt
├── Improvements
└── Settings
    ├── Appearance
    ├── Voice Language
    └── Subscriptions ← Moved here (management view)
```

### Redesigned What's New Experience

#### Visual Design
- **Fixed Card Layout**: Consistent card sizes for predictable scanning
- **Multimedia Support**: Images, video thumbnails, embedded content
- **AI Summaries**: Brief, scoppable summaries for each item
- **Rich Metadata**: Source badges, time stamps, engagement metrics

#### Content Types
- **Video Cards**: Thumbnail, duration, title, source badge
- **Article Cards**: Hero image, title, summary, read time
- **Social Cards**: Avatar, author, content preview, engagement stats
- **Release Cards**: Version badge, changelog summary, action buttons

#### Personalization
- **"More like this"**: Thumbs up button to increase similar content
- **"Less like this"**: Thumbs down button to decrease similar content
- **Feedback Loop**: User preferences fed back to AI agent for scoring
- **Adaptive Feed**: Content ranking adjusts based on feedback

## Key Features

### 1. Navigation Restructuring
**Move subscriptions management from drawer to settings**

**Current Behavior:**
- "Subscriptions" in drawer with nested Feed/Settings
- Management takes top-level prominence

**New Behavior:**
- "What's New" in drawer (content-focused)
- "Subscriptions" in Settings (management-focused)
- Cleaner navigation hierarchy

### 2. Multimedia Card Stream
**Fixed card-based layout with rich media support**

**Card Variants:**
- **Video**: 16:9 thumbnail, duration overlay, play icon
- **Article**: Hero image (4:3 or 16:9), title, 2-line summary
- **Social**: Circular avatar, author name, content preview
- **Release**: Pill badge for version, summary, link button

**Layout:**
- Single column, consistent card heights
- Pull-to-refresh
- Infinite scroll (or pagination)
- Category filter chips (All, Video, Articles, Social, Releases)

### 3. AI-Generated Summaries
**Brief summaries for all What's New content**

**Current State:**
- Full report text shown
- No per-item summaries
- Overwhelming to scan

**New Behavior:**
- Each card has 2-3 line AI summary
- Scannable at a glance
- "Read more" expands to full content
- Summaries generated during report creation

### 4. Feedback-Driven Recommendations
**User feedback trains the AI agent**

**UI Components:**
- Thumbs up / Thumbs down buttons on each card
- Minimal, non-intrusive placement
- Immediate visual feedback (animation)

**Backend Behavior:**
- Feedback signals stored per user
- AI scoring weights adjusted based on feedback
- Feed re-ranked on next refresh
- Preferences persist across sessions

## User Value

### For Power Users
- **Faster scanning**: Visual cards + summaries = quick triage
- **Better relevance**: Feedback loop improves content over time
- **Richer context**: Multimedia provides more info than text alone

### For Casual Users
- **Less overwhelm**: Fixed cards are easier to parse than wall of text
- **Clearer navigation**: What's New is obvious; subscriptions in settings makes sense
- **Passive personalization**: Occasional thumbs up/down improves experience without effort

## Business Value

### Engagement Metrics
- **Increased session frequency**: Richer content = more check-ins
- **Longer session duration**: Multimedia + summaries = deeper engagement
- **Higher retention**: Personalized feed = stickier product

### Product Positioning
- **Differentiation**: AI-driven personalization vs. static feeds
- **Perceived quality**: Rich multimedia feels more premium
- **User empowerment**: Feedback signals give users control

## Technical Context

### Existing Infrastructure
- **Backend**: Convex with cron jobs for report generation
- **AI**: OpenAI GPT-4 for report synthesis
- **Sources**: Reddit, HN, GitHub, Dev.to, Bluesky, Twitter/X, Changelogs
- **Current Components**: `SubscriptionFeedScreen`, `WhatsNewFindingCard`

### New Technical Requirements
- **Schema Extensions**: User preferences, feedback signals
- **AI Integration**: Updated scoring algorithm with user feedback
- **Component Library**: New card variants for multimedia
- **Routing Changes**: Drawer navigation updates

## Related Initiatives

### Complementary Work
- **Subscription Feed Redesign** (`.spec/prd/subscription-feed-redesign/`) - Creator grouping, bulk actions
- **Voice Assistant** (`.spec/prd/voice-assistant/`) - Voice interaction with What's New

### Dependencies
- **Convex Backend**: Must support new tables and queries
- **AI Scoring**: Quality scoring pipeline must incorporate user feedback
- **Navigation**: Drawer navigation changes affect entire app

## Risks & Mitigations

### Risk: Cold Start Problem
**Issue**: New users have no feedback history, generic feed may feel irrelevant

**Mitigation**: 
- Start with high-quality global baseline (current behavior)
- Prompt for preferences on first visit ("What topics interest you?")
- Use implicit signals (clicks, time spent) until explicit feedback given

### Risk: Feedback Fatigue
**Issue**: Users may ignore feedback buttons, reducing personalization value

**Mitigation**:
- Make feedback optional, not required
- Show occasional nudges ("Help us improve your feed")
- Use implicit signals (scroll depth, card clicks) as backup

### Risk: Navigation Confusion
**Issue**: Moving subscriptions may confuse existing users

**Mitigation**:
- In-app tooltip explaining the change
- Deep links continue to work (redirect to settings)
- One-time prompt on first visit after update

## Success Definition

### Minimum Viable Success
- Navigation restructure completed without breaking existing links
- Multimedia cards render correctly for all content types
- Feedback buttons functional and data being captured
- AI summaries appear on 80%+ of cards

### Stretch Success
- User engagement time increases 20% in What's New
- 60% of users provide at least 5 feedback signals in first week
- Feed relevance improves measurably (lower skip rate, higher click-through)
- Users report higher satisfaction with content relevance

## Open Questions

1. **Summary Length**: 2 sentences? 3 sentences? Character limit?
2. **Image Sourcing**: Where do card images come from? (OG tags, fallback, AI-generated?)
3. **Feedback Weighting**: How much does one thumbs up/down affect scoring?
4. **Cold Start**: Should we ask users for preferences on first visit?
5. **Media Playback**: Do video cards auto-play preview? Inline player or external link?

## Next Steps

1. **Design Exploration**: Create mockups for card variants and navigation
2. **Technical Spike**: Prototype AI summary generation in report pipeline
3. **User Research**: Validate navigation changes with current users
4. **Implementation Planning**: Break into epics for development
