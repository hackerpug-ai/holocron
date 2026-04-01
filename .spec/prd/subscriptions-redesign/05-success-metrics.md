# Subscriptions Redesign - Success Metrics

## Metric Categories

### 1. User Engagement Metrics
### 2. Content Quality Metrics
### 3. Feature Adoption Metrics
### 4. Performance Metrics
### 5. Business Impact Metrics

---

## 1. User Engagement Metrics

### ME-1.1: Daily Active Users (DAU) in What's New
**Definition:** Number of unique users who view What's New daily

**Baseline:** Current DAU (to be measured)  
**Target:** +20% increase within 4 weeks of launch

**Measurement:**
```sql
SELECT COUNT(DISTINCT userId)
FROM events
WHERE eventName = 'whats_new_viewed'
AND eventDate >= CURRENT_DATE - INTERVAL 1 DAY
```

**Success Threshold:** 15% increase (minimum), 25% increase (stretch)

---

### ME-1.2: Session Duration in What's New
**Definition:** Average time spent per session in What's New

**Baseline:** Current average session duration (to be measured)  
**Target:** +30 seconds average increase

**Measurement:**
```sql
SELECT AVG(sessionDuration)
FROM (
  SELECT userId,
         MAX(timestamp) - MIN(timestamp) as sessionDuration
  FROM events
  WHERE eventName = 'whats_new_viewed'
  AND eventDate >= CURRENT_DATE - INTERVAL 7 DAYS
  GROUP BY userId, sessionId
)
```

**Success Threshold:** +20 seconds (minimum), +45 seconds (stretch)

---

### ME-1.3: Cards Viewed Per Session
**Definition:** Average number of unique cards viewed per session

**Baseline:** Current cards viewed (to be measured)  
**Target:** 10 cards per session

**Measurement:**
```sql
SELECT AVG(cardsViewed)
FROM (
  SELECT COUNT(DISTINCT cardId) as cardsViewed
  FROM events
  WHERE eventName = 'whats_new_card_viewed'
  AND eventDate >= CURRENT_DATE - INTERVAL 7 DAYS
  GROUP BY userId, sessionId
)
```

**Success Threshold:** 8 cards (minimum), 12 cards (stretch)

---

### ME-1.4: Scroll Depth Per Session
**Definition:** Average scroll depth (percentage of feed viewed)

**Baseline:** Current scroll depth (to be measured)  
**Target:** 60% of feed viewed per session

**Measurement:**
```sql
SELECT AVG(scrollDepth)
FROM (
  SELECT MAX(scrollPosition) / totalFeedHeight as scrollDepth
  FROM events
  WHERE eventName = 'whats_new_scroll'
  AND eventDate >= CURRENT_DATE - INTERVAL 7 DAYS
  GROUP BY userId, sessionId
)
```

**Success Threshold:** 50% (minimum), 70% (stretch)

---

### ME-1.5: Return Frequency
**Definition:** Percentage of users who return to What's New within 7 days

**Baseline:** Current return rate (to be measured)  
**Target:** 40% of users return within 7 days

**Measurement:**
```sql
SELECT COUNT(DISTINCT userId) / totalUsers * 100 as returnRate
FROM (
  SELECT userId,
         MIN(eventDate) as firstVisit,
         MAX(CASE WHEN eventDate <= firstVisit + INTERVAL 7 DAYS
                 THEN 1 ELSE NULL END) as returned
  FROM events
  WHERE eventName = 'whats_new_viewed'
  AND eventDate >= CURRENT_DATE - INTERVAL 30 DAYS
  GROUP BY userId
  HAVING returned = 1
)
```

**Success Threshold:** 35% (minimum), 45% (stretch)

---

## 2. Content Quality Metrics

### ME-2.1: Summary Coverage Rate
**Definition:** Percentage of cards with AI-generated summaries

**Baseline:** 0% (new feature)  
**Target:** 90% of cards have summaries

**Measurement:**
```sql
SELECT
  COUNT(CASE WHEN summary IS NOT NULL THEN 1 END) * 100.0 / COUNT(*) as summaryRate
FROM findings
WHERE createdAt >= CURRENT_DATE - INTERVAL 7 DAYS
```

**Success Threshold:** 80% (minimum), 95% (stretch)

---

### ME-2.2: Summary Quality Rating
**Definition:** User-rated quality of summaries (1-5 stars)

**Baseline:** N/A (new feature)  
**Target:** 4.0/5.0 average rating

**Measurement:**
- In-app rating prompt after viewing 10 summaries
- "Was this summary helpful?" (Yes/No)
- Calculate percentage of "Yes" responses

**Success Threshold:** 70% helpful (minimum), 85% helpful (stretch)

---

### ME-2.3: Click-Through Rate (CTR) by Card Type
**Definition:** Percentage of cards clicked per type

**Baseline:** Current CTR (to be measured)  
**Target:** 
- Video cards: 15% CTR
- Article cards: 12% CTR
- Social cards: 8% CTR
- Release cards: 10% CTR

**Measurement:**
```sql
SELECT
  cardType,
  COUNT(CASE WHEN eventName = 'whats_new_card_clicked' THEN 1 END) * 100.0 /
    COUNT(CASE WHEN eventName = 'whats_new_card_viewed' THEN 1 END) as ctr
FROM events
WHERE eventDate >= CURRENT_DATE - INTERVAL 7 DAYS
GROUP BY cardType
```

**Success Threshold:** +5% CTR improvement across all types

---

### ME-2.4: Feedback Rate
**Definition:** Number of feedback events per 100 cards viewed

**Baseline:** 0% (new feature)  
**Target:** 15 feedback events per 100 cards viewed

**Measurement:**
```sql
SELECT
  COUNT(CASE WHEN eventName IN ('whats_new_feedback_positive', 'whats_new_feedback_negative')
        THEN 1 END) * 100.0 / COUNT(CASE WHEN eventName = 'whats_new_card_viewed'
        THEN 1 END) as feedbackRate
FROM events
WHERE eventDate >= CURRENT_DATE - INTERVAL 7 DAYS
```

**Success Threshold:** 10 per 100 (minimum), 20 per 100 (stretch)

---

### ME-2.5: Content Relevance Score
**Definition:** User-rated relevance of feed content (1-5 stars)

**Baseline:** Current relevance (to be measured via survey)  
**Target:** 4.0/5.0 average rating

**Measurement:**
- Weekly survey to 10% of users
- "How relevant is the content in your What's New feed?"
- Calculate average rating

**Success Threshold:** 3.5/5.0 (minimum), 4.2/5.0 (stretch)

---

## 3. Feature Adoption Metrics

### ME-3.1: Navigation Change Understanding
**Definition:** Percentage of users who successfully find subscriptions in Settings

**Baseline:** N/A (new navigation)  
**Target:** 90% of users find subscriptions within 30 seconds

**Measurement:**
- Track time from opening Settings to accessing Subscriptions
- Success = access within 30 seconds
- Failure = give up or return to home

**Success Threshold:** 80% (minimum), 95% (stretch)

---

### ME-3.2: Category Filter Usage
**Definition:** Percentage of users who use category filters

**Baseline:** N/A (new feature)  
**Target:** 30% of users use filters within first week

**Measurement:**
```sql
SELECT COUNT(DISTINCT userId) * 100.0 / totalUsers as filterUsageRate
FROM (
  SELECT userId
  FROM events
  WHERE eventName = 'whats_new_filter_changed'
  AND eventDate >= CURRENT_DATE - INTERVAL 7 DAYS
  GROUP BY userId
)
```

**Success Threshold:** 20% (minimum), 40% (stretch)

---

### ME-3.3: Feedback Feature Adoption
**Definition:** Percentage of users who provide feedback within first week

**Baseline:** N/A (new feature)  
**Target:** 40% of users provide at least one feedback signal

**Measurement:**
```sql
SELECT COUNT(DISTINCT userId) * 100.0 / totalUsers as feedbackAdoptionRate
FROM (
  SELECT userId
  FROM events
  WHERE eventName IN ('whats_new_feedback_positive', 'whats_new_feedback_negative')
  AND eventDate >= CURRENT_DATE - INTERVAL 7 DAYS
  GROUP BY userId
)
```

**Success Threshold:** 30% (minimum), 50% (stretch)

---

### ME-3.4: "Read More" Expansion Rate
**Definition:** Percentage of users who expand summaries to read more

**Baseline:** N/A (new feature)  
**Target:** 25% of users expand at least one summary per session

**Measurement:**
```sql
SELECT COUNT(DISTINCT userId) * 100.0 / totalUsers as expansionRate
FROM (
  SELECT userId
  FROM events
  WHERE eventName = 'whats_new_summary_expanded'
  AND eventDate >= CURRENT_DATE - INTERVAL 7 DAYS
  GROUP BY userId
)
```

**Success Threshold:** 15% (minimum), 35% (stretch)

---

### ME-3.5: Pull-to-Refresh Usage
**Definition:** Percentage of sessions where user triggers refresh

**Baseline:** Current refresh rate (to be measured)  
**Target:** 20% of sessions include manual refresh

**Measurement:**
```sql
SELECT COUNT(DASE WHEN eventName = 'whats_new_refreshed' THEN 1 END) * 100.0 /
    COUNT(DASE WHEN eventName = 'whats_new_viewed' THEN 1 END) as refreshRate
FROM events
WHERE eventDate >= CURRENT_DATE - INTERVAL 7 DAYS
```

**Success Threshold:** 15% (minimum), 25% (stretch)

---

## 4. Performance Metrics

### ME-4.1: Feed Load Time
**Definition:** Time from app launch to first card rendered

**Baseline:** Current load time (to be measured)  
**Target:** 2 seconds on 4G, 1 second on WiFi

**Measurement:**
```sql
SELECT
  percentile(latency, 50) as p50,
  percentile(latency, 95) as p95,
  percentile(latency, 99) as p99
FROM events
WHERE eventName = 'whats_new_feed_loaded'
AND eventDate >= CURRENT_DATE - INTERVAL 7 DAYS
```

**Success Threshold:** 
- p50 < 1.5s
- p95 < 3s
- p99 < 5s

---

### ME-4.2: Image Load Time
**Definition:** Time from card render to image loaded

**Baseline:** N/A (new feature)  
**Target:** 500ms average on 4G

**Measurement:**
```sql
SELECT
  percentile(imageLoadTime, 50) as p50,
  percentile(imageLoadTime, 95) as p95
FROM events
WHERE eventName = 'whats_new_image_loaded'
AND eventDate >= CURRENT_DATE - INTERVAL 7 DAYS
```

**Success Threshold:** 
- p50 < 400ms
- p95 < 1s

---

### ME-4.3: Scroll Frame Rate
**Definition:** Percentage of frames rendered at 60fps during scroll

**Baseline:** Current frame rate (to be measured)  
**Target:** 90% of frames at 60fps

**Measurement:**
- Performance monitoring in-app
- Track frame drops during scroll
- Calculate percentage of smooth frames

**Success Threshold:** 85% at 60fps (minimum), 95% at 60fps (stretch)

---

### ME-4.4: Memory Usage
**Definition:** Average memory usage while viewing What's New

**Baseline:** Current memory usage (to be measured)  
**Target:** < 200MB average

**Measurement:**
- Memory profiling with Flipper
- Track memory usage during typical session
- Monitor for memory leaks

**Success Threshold:** < 250MB (maximum acceptable)

---

### ME-4.5: Crash Rate
**Definition:** Percentage of sessions that crash in What's New

**Baseline:** Current crash rate (to be measured)  
**Target:** < 0.5% crash rate

**Measurement:**
```sql
SELECT COUNT(DISTINCT sessionId) * 100.0 / COUNT(DISTINCT allSessions) as crashRate
FROM events
WHERE eventDate >= CURRENT_DATE - INTERVAL 7 DAYS
AND eventName = 'whats_new_crash'
```

**Success Threshold:** < 1% (maximum acceptable)

---

## 5. Business Impact Metrics

### ME-5.1: User Retention (Day 7)
**Definition:** Percentage of users who return to app within 7 days

**Baseline:** Current Day 7 retention (to be measured)  
**Target:** +5 percentage point increase

**Measurement:**
```sql
SELECT COUNT(DISTINCT userId) * 100.0 / totalCohort as day7Retention
FROM (
  SELECT userId
  FROM userAcquisition
  WHERE acquisitionDate >= CURRENT_DATE - INTERVAL 30 DAYS
  AND EXISTS (
    SELECT 1 FROM events
    WHERE userId = userAcquisition.userId
    AND eventDate >= userAcquisition.acquisitionDate + INTERVAL 7 DAYS
  )
)
```

**Success Threshold:** +3 pp (minimum), +7 pp (stretch)

---

### ME-5.2: Time to Value (TTV)
**Definition:** Time from app install to first meaningful interaction

**Baseline:** Current TTV (to be measured)  
**Target:** < 10 seconds to first useful interaction

**Measurement:**
- Track new user onboarding
- Define "meaningful interaction" as viewing a card or providing feedback
- Measure time from install to first event

**Success Threshold:** < 15s (minimum), < 5s (stretch)

---

### ME-5.3: Net Promoter Score (NPS)
**Definition:** User satisfaction score (likelihood to recommend)

**Baseline:** Current NPS (to be measured via survey)  
**Target:** +40 NPS

**Measurement:**
- Quarterly survey to active users
- "How likely are you to recommend Holocron to a colleague?"
- Calculate NPS = % Promoters (9-10) - % Detractors (0-6)

**Success Threshold:** +30 (minimum), +50 (stretch)

---

### ME-5.4: Feature Satisfaction
**Definition:** User satisfaction with specific features

**Baseline:** N/A (new features)  
**Target:** 4.0/5.0 average satisfaction

**Measurement:**
- In-app survey after feature usage
- Rate each feature: Navigation, Cards, Summaries, Feedback
- Calculate average rating

**Success Threshold:** 3.5/5.0 (minimum), 4.2/5.0 (stretch)

---

### ME-5.5: Support Ticket Volume
**Definition:** Number of support tickets related to What's New

**Baseline:** Current ticket volume (to be measured)  
**Target:** < 5 tickets per week

**Measurement:**
- Track support tickets tagged with "whats-new"
- Categorize by issue type (bug, confusion, feature request)
- Monitor trends

**Success Threshold:** < 10 tickets/week (maximum acceptable)

---

## Success Dashboard

### Real-Time Metrics (Monitor Daily)

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| Feed Load Time (p95) | - | < 3s | ⚪ |
| Crash Rate | - | < 0.5% | ⚪ |
| Error Rate | - | < 5% | ⚪ |
| DAU in What's New | - | +20% | ⚪ |

### Weekly Metrics (Review Weekly)

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| Session Duration | - | +30s | ⚪ |
| Cards Viewed Per Session | - | 10 | ⚪ |
| Feedback Rate | - | 15/100 | ⚪ |
| Summary Coverage | - | 90% | ⚪ |

### Monthly Metrics (Review Monthly)

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| Day 7 Retention | - | +5 pp | ⚪ |
| NPS | - | +40 | ⚪ |
| Feature Satisfaction | - | 4.0/5.0 | ⚪ |

---

## Measurement Plan

### Pre-Launch (Week 0)
- [ ] Instrument all analytics events
- [ ] Measure baseline metrics
- [ ] Set up monitoring dashboards
- [ ] Configure alerts

### Launch Week (Week 1)
- [ ] Monitor real-time metrics hourly
- [ ] Track crash rates and errors
- [ ] Gather initial user feedback
- [ ] Address critical issues immediately

### Post-Launch (Weeks 2-4)
- [ ] Review metrics daily
- [ ] Analyze user feedback weekly
- [ ] Iterate on issues
- [ ] Optimize performance

### Evaluation (Week 4-8)
- [ ] Compare to baseline metrics
- [ ] Assess success against thresholds
- [ ] Document learnings
- [ ] Plan next iterations

---

## A/B Testing Opportunities

### Test 1: Summary Length
- **Variant A:** 2-line summaries (100 chars)
- **Variant B:** 3-line summaries (150 chars)
- **Metric:** Click-through rate, session duration

### Test 2: Feedback Button Placement
- **Variant A:** Top-right of card
- **Variant B:** Bottom-right of card
- **Metric:** Feedback rate, engagement

### Test 3: Card Image Size
- **Variant A:** Smaller images (4:3 aspect)
- **Variant B:** Larger images (16:9 aspect)
- **Metric:** Scroll depth, load time

### Test 4: Filter Chips Order
- **Variant A:** All, Video, Articles, Social, Releases
- **Variant B:** All, Articles, Video, Releases, Social
- **Metric:** Filter usage rate

---

## Thresholds & Alerts

### Critical Alerts (Immediate Action)
- Crash rate > 1%
- Error rate > 10%
- Feed load time p95 > 5s
- DAU drop > 20%

### Warning Alerts (Monitor Closely)
- Summary coverage < 70%
- Feedback rate < 5/100
- Session duration drop > 15%
- Support tickets > 10/week

### Info Alerts (Track for Trends)
- Feature adoption rate
- Filter usage patterns
- Card type CTR changes
- User sentiment shifts

---

## Data Quality & Validation

### Event Validation
- [ ] All events have required fields (userId, timestamp, sessionId)
- [ ] No duplicate events
- [ ] Timestamps are monotonic within sessions
- [ ] User IDs are valid

### Metric Validation
- [ ] Metrics calculated correctly
- [ ] Baseline measurements accurate
- [ ] Percentiles calculated correctly
- [ ] Sampling bias minimized

### Privacy & Compliance
- [ ] No PII in events
- [ ] User consent for analytics
- [ ] Data retention policies followed
- [ ] GDPR/CCPA compliance

---

## Reporting & Communication

### Daily Report (Internal)
- Real-time metrics snapshot
- Critical alerts (if any)
- overnight issues summary

### Weekly Report (Stakeholders)
- Key metrics progress
- Feature adoption trends
- User feedback summary
- Issues and resolutions

### Monthly Report (Leadership)
- Success metrics vs. targets
- Impact assessment
- Learnings and insights
- Next month priorities

---

## Continuous Improvement

### Metrics Review Cadence
- **Daily:** Engineering lead reviews real-time metrics
- **Weekly:** Product team reviews weekly metrics
- **Monthly:** Leadership reviews monthly metrics
- **Quarterly:** Strategy review and goal adjustment

### Iteration Plan
- **Week 1-2:** Fix critical issues, optimize performance
- **Week 3-4:** Address user feedback, iterate on features
- **Month 2:** Launch A/B tests, measure impact
- **Month 3:** Evaluate success, plan next phase

---

## Risk Mitigation

### Metric Gaming Prevention
- Use multiple metrics (not single metric optimization)
- Monitor for abnormal patterns
- Validate metrics with qualitative feedback
- Regular audits of measurement methodology

### Data Quality Issues
- Automated validation checks
- Manual sampling verification
- Cross-metric consistency checks
- External benchmark comparisons

---

## Success Definition

### Minimum Success (Milestone 1)
- [ ] 15% increase in DAU
- [ ] 80% summary coverage
- [ ] 10 feedback events per 100 cards
- [ ] < 1% crash rate
- [ ] 80% of users find subscriptions in Settings

### Target Success (Milestone 2)
- [ ] 20% increase in DAU
- [ ] 90% summary coverage
- [ ] 15 feedback events per 100 cards
- [ ] 4.0/5.0 content relevance rating
- [ ] +5 pp Day 7 retention

### Stretch Success (Milestone 3)
- [ ] 25% increase in DAU
- [ ] 95% summary coverage
- [ ] 20 feedback events per 100 cards
- [ ] +30s session duration
- [ ] +40 NPS

---

## Next Steps

1. **Instrument Analytics** (Week 0)
   - Add all event tracking
   - Set up dashboards
   - Configure alerts

2. **Measure Baseline** (Week 0)
   - Capture current metrics
   - Document baseline
   - Set realistic targets

3. **Launch & Monitor** (Week 1)
   - Deploy to production
   - Monitor real-time metrics
   - Address issues immediately

4. **Evaluate & Iterate** (Weeks 2-8)
   - Review metrics regularly
   - Iterate based on data
   - Plan next phase

---

## Appendix: Event Schema

### Core Events

```typescript
// Session events
whats_new_viewed: {
  userId: string
  sessionId: string
  timestamp: number
  source: 'drawer' | 'deep_link' | 'notification'
}

// Feed events
whats_new_feed_loaded: {
  userId: string
  sessionId: string
  timestamp: number
  latency: number // ms
  itemCount: number
}

// Card events
whats_new_card_viewed: {
  userId: string
  sessionId: string
  cardId: string
  cardType: 'video' | 'article' | 'social' | 'release'
  timestamp: number
  position: number // index in feed
}

whats_new_card_clicked: {
  userId: string
  sessionId: string
  cardId: string
  cardType: 'video' | 'article' | 'social' | 'release'
  timestamp: number
  position: number
}

// Interaction events
whats_new_feedback_positive: {
  userId: string
  sessionId: string
  cardId: string
  cardType: 'video' | 'article' | 'social' | 'release'
  timestamp: number
}

whats_new_feedback_negative: {
  userId: string
  sessionId: string
  cardId: string
  cardType: 'video' | 'article' | 'social' | 'release'
  timestamp: number
}

whats_new_filter_changed: {
  userId: string
  sessionId: string
  fromFilter: string
  toFilter: string
  timestamp: number
}

whats_new_summary_expanded: {
  userId: string
  sessionId: string
  cardId: string
  timestamp: number
}

whats_new_refreshed: {
  userId: string
  sessionId: string
  timestamp: number
  trigger: 'pull_to_refresh' | 'manual'
}

// Performance events
whats_new_image_loaded: {
  userId: string
  sessionId: string
  cardId: string
  imageLoadTime: number // ms
  timestamp: number
}

whats_new_scroll: {
  userId: string
  sessionId: string
  scrollPosition: number // pixels
  totalFeedHeight: number
  timestamp: number
}

// Error events
whats_new_error: {
  userId: string
  sessionId: string
  errorType: string
  errorMessage: string
  stackTrace?: string
  timestamp: number
}

whats_new_crash: {
  userId: string
  sessionId: string
  crashReason: string
  stackTrace: string
  timestamp: number
}
```
