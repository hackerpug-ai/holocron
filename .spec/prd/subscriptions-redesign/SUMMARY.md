# Subscriptions Redesign - Executive Summary

## Overview

This PRD outlines a comprehensive redesign of Holocron's subscriptions experience, transforming it from a management-focused interface into an AI-driven, personalized content discovery platform.

## Key Changes

### 1. Navigation Restructuring
- **Move subscriptions management from main drawer to Settings**
- **Rename "Subscriptions" to "What's New"** in drawer navigation
- Cleaner navigation hierarchy with content-focused top-level entry

### 2. Multimedia Card Stream
- **Fixed card-based layout** with consistent heights and visual design
- **Rich media support**: Images, video thumbnails, avatars, hero images
- **Four card variants**: Video, Article, Social, Release
- **Category filtering**: All, Video, Articles, Social, Releases

### 3. AI-Generated Summaries
- **Brief 2-3 line summaries** for each content item
- **Scannable at a glance** with "Read more" expansion
- **Generated during report creation** using OpenAI GPT-4o-mini
- **Quality monitoring** and fallback handling

### 4. Feedback-Driven Recommendations
- **Thumbs up / Thumbs down** buttons on each card
- **User preferences feed back into AI scoring** algorithm
- **Personalized feed ranking** based on feedback signals
- **Feedback history screen** in Settings

## Problem Solved

### Current Pain Points
1. **Navigation clutter** - Subscription management occupies prime drawer space
2. **Text-heavy feed** - Overwhelming wall of text, difficult to scan
3. **No personalization** - All users see same content, no way to influence relevance

### Solution Benefits
1. **Cleaner navigation** - Settings where they belong, content front and center
2. **Visual scanning** - Rich cards with images, summaries, and consistent layout
3. **User agency** - Feedback buttons train the AI to personalization content

## Technical Highlights

### New Components
- `VideoCard`, `ArticleCard`, `SocialCard`, `ReleaseCard`
- `FeedCard` (router component)
- `FeedbackButtons`
- `NavigationChangeTooltip`

### Backend Changes
- New table: `userFeedback`
- Extended findings with `summary` and `thumbnailUrl` fields
- New queries/mutations for feedback recording and retrieval
- Updated AI scoring algorithm with user preference weighting

### Infrastructure
- Image extraction from Open Graph tags
- Optimistic UI updates for feedback
- Progressive image loading with fallbacks
- Offline support for cached content

## Success Metrics

### Primary Metrics (4-week targets)
- **+20% DAU** in What's New
- **+30 seconds** session duration
- **90% summary coverage** on cards
- **15 feedback events** per 100 cards viewed
- **< 1% crash rate**

### Secondary Metrics
- 40% user feedback adoption within first week
- 4.0/5.0 content relevance rating
- +5 percentage point Day 7 retention
- < 2 second feed load time (p95)

## Implementation Timeline

### Week 1: Foundation
- Navigation restructuring
- Card factory/router component
- Summary generation pipeline

### Week 2: Core Cards
- Video and Article cards
- Image handling (extraction, loading, fallbacks)
- Summary display on cards
- Feedback buttons and storage

### Week 3: Enhanced Experience
- Social and Release cards
- Loading skeletons
- Category filtering
- Offline support
- Feedback-influenced scoring

### Week 4: Polish & Launch
- Error handling
- Analytics instrumentation
- Data migration
- Documentation
- QA and bug fixes

## Resource Requirements

### Development
- **1 full-stack engineer** for 4 weeks
- **80-120 hours** estimated effort
- **Phased rollout** to manage risk

### Dependencies
- Convex backend (schema changes, new queries/mutations)
- OpenAI API (summary generation, embeddings)
- React Native fast-image (optimized image loading)
- Existing components (WebViewSheet, SearchInput, FilterChip)

### Design
- Card variant specifications
- Image sizing and aspect ratios
- Feedback button placement
- Loading state designs

## Risk Mitigation

### Technical Risks
- **Image availability** → Graceful fallbacks to text-only cards
- **Summary quality** → Extensive testing, fallback to title-only
- **Performance** → Progressive loading, image optimization, skeletons

### User Risks
- **Navigation confusion** → In-app tooltip, deep link redirects
- **Feedback adoption** → Minimal, non-intrusive design, implicit signals
- **Cold start problem** → High-quality baseline, preference prompts

## Related Work

### Complementary Initiatives
- **Subscription Feed Redesign** (`.spec/prd/subscription-feed-redesign/`) - Creator grouping, bulk actions
- **Voice Assistant** (`.spec/prd/voice-assistant/`) - Potential voice interaction with What's New

### Dependencies
- **Convex Backend**: Must support new tables and queries
- **AI Pipeline**: Quality scoring must incorporate user feedback
- **Navigation**: Drawer changes affect entire app

## Open Questions

1. **Summary Length**: 2 sentences vs 3 sentences? Character limit?
2. **Image Sourcing**: OG tags only or additional sources?
3. **Feedback Weighting**: How much influence should feedback have?
4. **Cold Start**: Ask users for preferences on first visit?
5. **Media Playback**: Inline video or external link only?

## Next Steps

1. **Design Review**: Validate card variants and navigation changes
2. **Technical Spike**: Prototype summary generation and image extraction
3. **User Research**: Test navigation changes with current users
4. **Implementation Planning**: Break into epics for development

## Documents

| Document | Description |
|----------|-------------|
| [README.md](./README.md) | PRD overview and index |
| [00-overview.md](./00-overview.md) | Product vision and description |
| [01-scope.md](./01-scope.md) | Appetite, in-scope, out-of-scope |
| [02-user-stories.md](./02-user-stories.md) | User stories and acceptance criteria |
| [03-functional-requirements.md](./03-functional-requirements.md) | Functional requirements by feature area |
| [04-technical-considerations.md](./04-technical-considerations.md) | Technical architecture and implementation |
| [05-success-metrics.md](./05-success-metrics.md) | Success metrics and KPIs |

## Approval Status

- [ ] Product Review
- [ ] Design Review
- [ ] Technical Review
- [ ] Stakeholder Approval
- [ ] Ready for Development

---

**Last Updated:** 2026-04-01  
**Version:** 1.0  
**Status:** Draft
