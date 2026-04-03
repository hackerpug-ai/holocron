# Implementation Recommendation

> **Last Updated**: 2026-04-03
> **Purpose**: Provide clear recommendation and phased roadmap for implementing job/network crawling functionality

## Executive Summary

**Recommended Approach**: Hybrid strategy starting with **Public Board APIs** (Greenhouse, Lever, Workable) supplemented by **RSS Feeds** (Indeed, Monster), with **Partnership APIs** (LinkedIn) as a future enhancement.

**Key Decision Factors**:
- ✅ **Compliance**: Zero legal risk with public APIs
- ✅ **Data Quality**: Excellent structured data from board APIs
- ✅ **Time to Market**: 2-3 weeks to initial implementation
- ✅ **Scalability**: Easy to add new boards over time
- ✅ **Cost**: Free - no API fees or partnership costs

---

## Recommendation

### Primary Strategy: Public Board APIs

**Implement job posting collection using public board APIs (Greenhouse, Lever, Workable) as the foundation.**

#### Why This Approach

| Criteria | Assessment |
|----------|------------|
| **Compliance Risk** | None - public APIs designed for programmatic access |
| **Data Quality** | Excellent - full job descriptions, structured metadata |
| **Implementation** | Low complexity - standard REST APIs |
| **Time to Value** | 2-3 weeks to production |
| **Coverage** | ~30% of technical jobs (improves over time) |
| **Maintenance** | Low - stable, documented APIs |
| **Cost** | Free - no authentication or rate limits |
| **Scalability** | High - add boards incrementally |

#### Target Companies (Initial 20)

**Top Tech Companies Using Greenhouse:**
1. Airbnb, Stripe, DoorDash, Figma, Notion
2. Reddit, Slack, Shopify, Square, Discord
3. Duolingo, Fivetran, Plaid, Robinhood, Vercel

**Top Tech Companies Using Lever:**
1. Uber, Netflix, Lyft, Dropbox, Instacart
2. Docker, Eventbrite, Hootsuite, TaskRabbit, Wag!

**Top Tech Companies Using Workable:**
1. Segment, Mixpanel, Qualtrics, Drift, G2
2. Thumbtack, Care.com, Upwork, HubSpot, Zapier

*Note: This represents ~2,000-3,000 active job postings across high-quality technical roles.*

---

## Implementation Roadmap

### Phase 1: Foundation (Weeks 1-2) - MVP

#### Goals
- Establish data pipeline infrastructure
- Implement Greenhouse + Lever + Workable integrations
- Launch with top 20 companies
- Deliver 2,000+ job postings to users

#### Technical Tasks

**1. Database Schema**
```typescript
// convex/schema.ts
export default defineSchema({
  jobs: defineTable({
    externalId: v.string(), // Platform-specific ID
    platform: v.string(),   // 'greenhouse', 'lever', 'workable'
    title: v.string(),
    description: v.string(),
    company: v.string(),
    location: v.object({
      city: v.optional(v.string()),
      state: v.optional(v.string()),
      country: v.string(),
      remote: v.boolean(),
    }),
    url: v.string(),
    postedAt: v.number(),
    syncedAt: v.number(),
    status: v.string(), // 'active', 'closed', 'archived'
    metadata: v.optional(v.any()), // Platform-specific data
  })
    .index('by_external_id', ['externalId'])
    .index('by_platform', ['platform'])
    .index('by_company', ['company'])
    .index('by_status', ['status']),

  companies: defineTable({
    name: v.string(),
    greenhouseBoardToken: v.optional(v.string()),
    leverBoardToken: v.optional(v.string()),
    workableAccountKey: v.optional(v.string()),
    active: v.boolean(),
    priority: v.number(), // Sort order for syncing
  }),

  syncLogs: defineTable({
    platform: v.string(),
    status: v.string(), // 'success', 'error', 'partial'
    jobsProcessed: v.number(),
    jobsAdded: v.number(),
    jobsUpdated: v.number(),
    errors: v.optional(v.array(v.string())),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
  }),
});
```

**2. API Client Implementations**
- Greenhouse client (`convex/lib/jobBoards/greenhouse.ts`)
- Lever client (`convex/lib/jobBoards/lever.ts`)
- Workable client (`convex/lib/jobBoards/workable.ts`)

**3. Sync Pipeline**
- Cron job for hourly syncs
- Upsert logic (update existing jobs, add new ones)
- Error handling and logging
- Retries with exponential backoff

**4. API Endpoints**
- `api.jobs.list` - List jobs with filters (company, platform, location)
- `api.jobs.get` - Get job by ID
- `api.jobs.search` - Full-text search
- `api.companies.list` - List tracked companies
- `api.sync.status` - Check sync status

**5. UI Components**
- Job listing screen with filters
- Job detail screen
- Company browser
- Sync status indicator

#### Success Criteria
- ✅ 20 companies configured and syncing
- ✅ 2,000+ job postings in database
- ✅ Sync runs successfully every hour
- ✅ Zero compliance issues
- ✅ Mobile app displays jobs correctly

---

### Phase 2: Expansion (Weeks 3-4) - Broad Coverage

#### Goals
- Add RSS feed integration for Indeed, Monster
- Implement data quality tracking
- Expand company list to 50+
- Add job search functionality

#### Technical Tasks

**1. RSS Feed Integration**
```typescript
// convex/lib/rss/jobFeeds.ts
export class RSSJobCrawler {
  async fetchIndeedJobs(query: string, location: string) {
    const url = `https://www.indeed.com/rss?q=${query}&l=${location}`;
    const feed = await this.parseRSSFeed(url);
    return this.transformFeedJobs(feed, 'indeed');
  }

  async fetchMonsterJobs(query: string, location: string) {
    const url = `https://www.monster.com/rss/rss2.aspx?q=${query}&l=${location}`;
    const feed = await this.parseRSSFeed(url);
    return this.transformFeedJobs(feed, 'monster');
  }

  private transformFeedJobs(feed: any, platform: string) {
    return feed.items.map(item => ({
      externalId: this.generateHash(item.link),
      platform,
      title: item.title,
      company: this.extractCompany(item.title),
      location: this.extractLocation(item.title),
      description: item.description,
      url: item.link,
      postedAt: new Date(item.pubDate),
      dataQuality: 'limited', // Flag as low-quality
    }));
  }
}
```

**2. Data Quality Tracking**
- Tag jobs with quality levels (`full`, `limited`, `enriched`)
- Prioritize high-quality sources in UI
- Allow users to filter by data quality

**3. Search Functionality**
- Full-text search on title, description, company
- Filter by platform, location, remote, data quality
- Sort by relevance, posting date, company

**4. Company Management**
- Admin screen to add/remove companies
- Bulk import from CSV
- Auto-discovery of board tokens (if possible)

#### Success Criteria
- ✅ 50+ companies configured
- ✅ 5,000+ job postings available
- ✅ Search works across all platforms
- ✅ Users can filter by data quality
- ✅ RSS feeds sync successfully

---

### Phase 3: Premium Access (Months 2-3) - LinkedIn Integration

#### Goals
- Apply for LinkedIn Partnership Program
- Implement OAuth flow for user authentication
- Add LinkedIn Jobs API integration
- Provide premium LinkedIn data to users

#### Prerequisites

**LinkedIn Partnership Program Application**
1. Submit application to LinkedIn
2. Describe use case (job aggregation for users)
3. Provide company information and compliance documentation
4. Wait for approval (4-8 weeks)
5. Sign API terms of use
6. Receive API credentials

**Note**: Application may be rejected. Have fallback plan ready.

#### Technical Tasks

**1. OAuth 2.0 Implementation**
```typescript
// convex/lib/oauth/linkedin.ts
export class LinkedInOAuth {
  // Redirect user to LinkedIn for authorization
  getAuthUrl(state: string): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: LINKEDIN_CONFIG.clientId,
      redirect_uri: LINKEDIN_CONFIG.redirectUri,
      scope: 'r_jobs r_companies',
      state: state,
    });

    return `https://www.linkedin.com/oauth/v2/authorization?${params}`;
  }

  // Exchange authorization code for access token
  async exchangeCode(code: string): Promise<TokenResponse> {
    const response = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: LINKEDIN_CONFIG.redirectUri,
        client_id: LINKEDIN_CONFIG.clientId,
        client_secret: LINKEDIN_CONFIG.clientSecret,
      }),
    });

    if (!response.ok) throw new Error('OAuth exchange failed');
    return await response.json();
  }

  // Fetch jobs using access token
  async fetchJobs(accessToken: string, params: JobSearchParams) {
    const response = await fetch(
      `https://api.linkedin.com/v2/jobPostings?${new URLSearchParams(params)}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0',
        },
      }
    );

    if (!response.ok) throw new Error(`LinkedIn API error: ${response.status}`);
    return await response.json();
  }

  // Refresh expired access token
  async refreshAccessToken(refreshToken: string): Promise<string> {
    const response = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: LINKEDIN_CONFIG.clientId,
        client_secret: LINKEDIN_CONFIG.clientSecret,
      }),
    });

    if (!response.ok) throw new Error('Token refresh failed');
    const data = await response.json();
    return data.access_token;
  }
}
```

**2. Token Management**
- Secure credential storage (Convex secrets)
- Automated token refresh (every 30 minutes)
- Token expiry handling
- User credential management UI

**3. Rate Limiting**
- Implement token bucket algorithm
- Respect LinkedIn rate limits (500-1000/day)
- Queue and throttle requests
- Graceful handling of rate limit errors

**4. LinkedIn-Specific Features**
- Filter by LinkedIn connections (if user provides credentials)
- Show "who you know" at hiring companies
- Prioritize jobs from user's network

#### Success Criteria
- ✅ LinkedIn Partnership Program approved
- ✅ OAuth flow works end-to-end
- ✅ LinkedIn jobs sync successfully
- ✅ Rate limiting prevents API throttling
- ✅ Token refresh works automatically

---

### Phase 4: Optimization (Ongoing) - Continuous Improvement

#### Goals
- Monitor data quality metrics
- Optimize sync performance
- Add more board APIs as discovered
- Improve search relevance

#### Technical Tasks

**1. Monitoring & Metrics**
```typescript
// convex/monitoring/metrics.ts
export const syncMetrics = {
  async recordSync(platform: string, result: SyncResult) {
    await ctx.runMutation(api.metrics.insert, {
      platform,
      status: result.status,
      jobsProcessed: result.jobsProcessed,
      jobsAdded: result.jobsAdded,
      jobsUpdated: result.jobsUpdated,
      duration: result.duration,
      timestamp: Date.now(),
    });
  },

  async getPlatformStats(platform: string) {
    const recent = await ctx.runQuery(api.metrics.getRecent, { platform, days: 30 });
    return {
      totalSyncs: recent.length,
      successRate: recent.filter(r => r.status === 'success').length / recent.length,
      avgJobsPerSync: recent.reduce((sum, r) => sum + r.jobsProcessed, 0) / recent.length,
      avgDuration: recent.reduce((sum, r) => sum + r.duration, 0) / recent.length,
    };
  },
};
```

**2. Performance Optimization**
- Batch API requests where possible
- Cache frequently accessed data
- Optimize database queries with indexes
- Parallelize sync operations

**3. Data Quality Improvements**
- Identify and deduplicate duplicate postings
- Normalize company names and locations
- Extract skills from job descriptions
- Classify jobs by role type (frontend, backend, ML, etc.)

**4. User Feedback Loop**
- Track which jobs users click/view
- Prioritize high-engagement platforms in results
- A/B test different ranking strategies
- Survey users on data quality

---

## Risk Mitigation

### Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| API endpoint changes | Medium | Medium | Versioned clients, monitoring, alerting |
| Rate limit exceeded | Medium | Low | Conservative limits, queuing |
| Sync failures | Low | Low | Retry logic, error logging |
| Data quality issues | Low | Medium | Quality tagging, user feedback |

### Compliance Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| ToS violation | Low | High | Use public APIs only, monitor ToS |
| robots.txt change | Low | Medium | Automated checks, stop on violation |
| Copyright issue | Low | Medium | Link to original, minimal storage |

### Business Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| LinkedIn partnership denied | Medium | Low | Public APIs already provide value |
| RSS feeds discontinued | Low | Medium | Diversify sources, API-first |
| User adoption low | Low | High | Focus on UX, targeted companies |

---

## Success Metrics

### Phase 1 Success (Weeks 1-2)
- [ ] 20 companies configured
- [ ] 2,000+ job postings available
- [ ] Hourly syncs running reliably
- [ ] Zero compliance issues
- [ ] User engagement > 50%

### Phase 2 Success (Weeks 3-4)
- [ ] 50+ companies configured
- [ ] 5,000+ job postings available
- [ ] Search functionality working
- [ ] Data quality tracking in place
- [ ] User engagement > 60%

### Phase 3 Success (Months 2-3)
- [ ] LinkedIn partnership approved (or decision to defer)
- [ ] OAuth flow implemented
- [ ] LinkedIn jobs integrated (if approved)
- [ ] Rate limiting working
- [ ] User engagement > 70%

### Ongoing Success
- [ ] 100+ companies configured
- [ ] 10,000+ job postings available
- [ ] 99.9% sync success rate
- [ ] Average sync time < 5 minutes
- [ ] User engagement > 80%

---

## Alternatives Considered

### Pure Scraping Approach (Rejected)
**Why Not**:
- High compliance risk (ToS violations)
- Fragile (page structure changes break scrapers)
- Anti-scraping measures (CAPTCHA, IP bans)
- Legal precedents unclear
- Not scalable

### LinkedIn-Only Approach (Rejected)
**Why Not**:
- Partnership approval uncertain
- High implementation complexity
- User friction (OAuth required)
- Rate limits restrict coverage
- Single point of failure

### RSS-Only Approach (Rejected)
**Why Not**:
- Poor data quality
- Limited metadata
- No structured data
- Feeds may disappear
- Doesn't differentiate from competitors

---

## Next Steps

### Immediate (This Week)
1. **Review this research** with product/engineering team
2. **Confirm target companies** for Phase 1
3. **Set up Convex environment** for job board APIs
4. **Create implementation task** based on Phase 1 roadmap

### Short Term (Next 2 Weeks)
1. **Implement Greenhouse integration** (10 companies)
2. **Add Lever integration** (10 companies)
3. **Launch MVP to users** for feedback
4. **Monitor sync performance** and data quality

### Long Term (Next 2-3 Months)
1. **Expand to 50+ companies** (add Workable, RSS feeds)
2. **Implement search** and filtering
3. **Apply for LinkedIn partnership** (if user demand warrants)
4. **Optimize based on metrics** and user feedback

---

## Conclusion

**The recommended approach balances speed, compliance, and data quality by starting with public board APIs. This provides immediate value to users while building a foundation for future expansion into premium sources.**

**Key Advantages**:
- ✅ **Zero compliance risk** - public APIs are designed for this use
- ✅ **Fast time to market** - 2-3 weeks to production
- ✅ **High data quality** - structured, reliable job data
- ✅ **Scalable architecture** - easy to add new boards
- ✅ **User-driven growth** - expand based on actual demand

**This approach positions the product for success without technical debt or legal risk.**
