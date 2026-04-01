# Subscriptions Redesign - Scope

## Appetite

**Timeline**: 3-4 weeks
**Team**: 1 full-stack engineer
**Budget**: 80-120 hours

## In Scope

### Phase 1: Navigation Restructuring (Week 1)
- Move "Subscriptions" from drawer to Settings screen
- Rename "Subscriptions" drawer item to "What's New"
- Update routing and deep links
- Add in-app tooltip explaining the change
- Migration guide for existing users

### Phase 2: Multimedia Card Components (Week 2)
- **Card Variants**:
  - Video card (thumbnail, duration, play icon)
  - Article card (hero image, title, summary)
  - Social card (avatar, author, content preview)
  - Release card (version badge, summary)
- **Card Features**:
  - Fixed height/width for consistent layout
  - Pull-to-refresh support
  - Loading skeletons for each variant
  - Proper testIDs for all interactive elements

### Phase 3: AI Summaries (Week 2-3)
- Extend report generation to create per-item summaries
- Add summary field to findings schema
- Display 2-3 line summaries on cards
- "Read more" expansion to full content
- Fallback to title-only if summary unavailable

### Phase 4: Feedback System (Week 3-4)
- **Frontend**:
  - Thumbs up / Thumbs down buttons on cards
  - Visual feedback (animation, state change)
  - Feedback history screen in settings
- **Backend**:
  - New table: `userFeedback` (userId, findingId, sentiment, timestamp)
  - Updated scoring algorithm incorporating user feedback
  - Query for fetching user's feedback history
  - Mutation for recording feedback
- **AI Integration**:
  - Update quality scoring to weight user preferences
  - Re-rank feed based on feedback signals
  - Preference clustering (topics, sources, categories)

### Phase 5: Polish & Testing (Week 4)
- Performance optimization (image loading, card rendering)
- Accessibility audit (screen reader support, contrast)
- Edge case handling (missing images, failed summaries)
- Analytics instrumentation (feedback rate, engagement metrics)
- Documentation and code review

## Out of Scope

### Not Included (Future Work)
- **Advanced Personalization**:
  - Collaborative filtering ("users like you also liked")
  - Topic modeling and automatic category discovery
  - Time-of-day based content adjustment
- **Rich Media Playback**:
  - Inline video playback (currently external link)
  - Audio podcast integration
  - Interactive code snippets
- **Social Features**:
  - Share to external platforms
  - Comment on findings
  - Follow other users' feeds
- **Notifications**:
  - Push notifications for new What's New reports
  - Digest emails
  - Quiet hours / snooze
- **Advanced Feedback**:
  - "Not interested in this source" filtering
  - "Show more like this" fine-grained controls
  - Export feedback data

### Explicitly Excluded
- **Backend Migration**: No changes to Convex deployment architecture
- **Database Migration**: No breaking changes to existing tables
- **Auth Changes**: No new permissions or user roles
- **External API Changes**: No new sources beyond current implementation

## Assumptions

### Technical Assumptions
1. **Convex Capacity**: Current Convex deployment can handle new queries/mutations
2. **AI API Limits**: OpenAI API limits accommodate increased summary generation
3. **Image Availability**: Most sources provide Open Graph tags or usable images
4. **Performance**: FlatList with cards renders smoothly on target devices

### User Behavior Assumptions
1. **Feedback Willingness**: Users will provide feedback if it's non-intrusive
2. **Navigation Intuition**: Users will find subscriptions in settings naturally
3. **Content Preferences**: Users have consistent preferences across sessions
4. **Summary Value**: 2-3 line summaries provide sufficient context

### Business Assumptions
1. **ROI**: Increased engagement justifies development effort
2. **Maintenance**: Team can maintain additional complexity long-term
3. **Scalability**: Solution scales to 10x current user base
4. **Quality**: AI summaries meet quality bar without manual review

## Dependencies

### Technical Dependencies
- **Convex Backend**: Schema changes, new queries/mutations
- **AI Pipeline**: Report generation must include summary step
- **Image Service**: May need image proxy/optimizer (OG tags)
- **Navigation**: Drawer layout changes affect entire app

### Team Dependencies
- **Design**: Card variants require design specification
- **AI/ML**: Scoring algorithm updates require ML expertise
- **QA**: Testing across devices, screen sizes, edge cases

### External Dependencies
- **OpenAI API**: Summary generation requires GPT-4 access
- **Image Sources**: OG tag availability from external sites
- **Convex Cloud**: Production deployment and monitoring

## Constraints

### Time Constraints
- **Hard Deadline**: 4 weeks maximum (scope may be reduced)
- **Phased Rollout**: Must ship incrementally, not as big bang

### Technical Constraints
- **No Breaking Changes**: Must maintain backward compatibility
- **Performance**: Cards must render at 60fps on target devices
- **Offline Support**: Cached content should be viewable offline

### Design Constraints
- **Theme System**: Must use existing semantic tokens
- **Component Library**: Prefer React Native Reusables patterns
- **Accessibility**: Must meet WCAG 2.1 AA standards

### Resource Constraints
- **Single Developer**: No dedicated backend or mobile dev
- **Limited QA**: No dedicated QA team
- **No Budget**: No paid APIs or services beyond current stack

## Risk Assessment

### High Risk Items
1. **AI Summary Quality**: Poor summaries could degrade experience
   - **Mitigation**: Extensive testing, fallback to title-only
2. **Image Availability**: Missing images break card layout
   - **Mitigation**: Graceful fallbacks, placeholder images
3. **Feedback Adoption**: Users may not provide feedback
   - **Mitigation**: Implicit signals (clicks, time spent) as backup

### Medium Risk Items
1. **Navigation Confusion**: Moving subscriptions may frustrate users
   - **Mitigation**: In-app prompts, deep link redirects
2. **Performance**: Large images could slow rendering
   - **Mitigation**: Image optimization, lazy loading
3. **Scope Creep**: Feature creep beyond appetite
   - **Mitigation**: Strict definition of "done", defer non-essentials

### Low Risk Items
1. **Backend Complexity**: New tables and queries
   - **Mitigation**: Incremental schema changes, thorough testing
2. **Card Consistency**: Different content types breaking layout
   - **Mitigation**: Design system, strict variant definitions

## Success Criteria

### Must-Have (Milestone 1)
- [ ] Navigation restructure complete and functional
- [ ] Basic card components rendering without images
- [ ] Feedback buttons present and recording data
- [ ] No breaking changes to existing functionality

### Should-Have (Milestone 2)
- [ ] All card variants with images working
- [ ] AI summaries appearing on cards
- [ ] Feedback influencing feed ranking
- [ ] Performance acceptable on target devices

### Could-Have (Milestone 3)
- [ ] Advanced feedback features (history screen, export)
- [ ] Rich media polish (animations, transitions)
- [ ] Analytics dashboard for feedback insights
- [ ] A/B testing for summary length/position

## Definition of Done

Each feature is "done" when:
1. **Code Complete**: Implementation finished, including error handling
2. **Tested**: Unit tests for backend, E2E tests for frontend
3. **Reviewed**: Code review approved, no outstanding comments
4. **Documented**: Code comments updated, PRD sections marked complete
5. **Deployed**: Running in staging, ready for production
6. **Measured**: Analytics instrumented, baseline metrics recorded

## Phase Exit Criteria

### Phase 1: Navigation
- Drawer routing updated
- Deep links redirect correctly
- In-app prompt showing
- No navigation-related bugs

### Phase 2: Cards
- All 4 card variants implemented
- Loading states working
- Images loading correctly
- Performance tests passing

### Phase 3: Summaries
- Summary field in schema
- Report generation creating summaries
- Cards displaying summaries
- Fallback handling working

### Phase 4: Feedback
- Feedback buttons functional
- Data being recorded
- Scoring algorithm updated
- Feed re-ranking based on feedback

### Phase 5: Polish
- Performance optimized
- Accessibility audited
- Edge cases handled
- Analytics instrumented

## Rollback Plan

If critical issues arise:
1. **Navigation**: Revert drawer changes, keep subscriptions in main nav
2. **Cards**: Fall back to existing text-based feed
3. **Summaries**: Hide summary field, show title only
4. **Feedback**: Remove buttons, keep existing scoring

Each component is independently deployable/rollback-able.
