# Technical Implementation Approaches

> **Last Updated**: 2026-04-03
> **Purpose**: Compare architectural approaches for implementing job/network crawling functionality

## Overview

This document analyzes three distinct approaches to implementing job posting data collection, comparing technical complexity, compliance risk, operational overhead, and data quality.

---

## Approach 1: Public Board APIs (Primary Recommendation)

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Convex Backend                           │
│                                                                 │
│  ┌─────────────┐    ┌──────────────┐    ┌─────────────────┐   │
│  │  Scheduled  │───▶│  API Client  │───▶│  Job Normalizer │   │
│  │  Cron Jobs  │    │  (Greenhouse │    │  (Unified       │   │
│  │             │    │   Lever,     │    │   Schema)       │   │
│  └─────────────┘    │   Workable)  │    └─────────────────┘   │
│                     └──────────────┘             │             │
│                                                   ▼             │
│                                          ┌─────────────────┐   │
│                                          │  Convex DB      │   │
│                                          │  (jobs table)   │   │
│                                          └─────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
  Greenhouse API         Lever API          Workable API
  (Public)              (Public)            (Public)
```

### Technical Specifications

#### API Client Layer
```typescript
// convex/lib/jobBoards/greenhouse.ts
import { v } from 'convex/values';

const GREENHOUSE_BASE_URL = 'https://boards-api.greenhouse.io/v1/boards';

export const greenhouseClient = {
  async fetchJobs(boardToken: string) {
    const response = await fetch(`${GREENHOUSE_BASE_URL}/${boardToken}/jobs`);
    if (!response.ok) throw new Error(`Greenhouse API error: ${response.status}`);

    const data = await response.json();
    return data.jobs.map(this.transformJob);
  },

  transformJob(raw: any) {
    return {
      externalId: `gh-${raw.id}`,
      platform: 'greenhouse' as const,
      title: raw.title,
      description: raw.content,
      company: raw.metadata?.find((m: any) => m.name === 'Company')?.value || 'Unknown',
      location: this.parseLocation(raw.location),
      url: raw.absolute_url,
      postedAt: new Date(raw.updated_at),
      departments: raw.departments?.map((d: any) => d.name) || [],
    };
  },

  parseLocation(location: any) {
    return {
      city: location.name?.split(',')[0]?.trim(),
      state: location.name?.split(',')[1]?.trim(),
      country: 'US', // Default, parse from location if available
      remote: location.name?.toLowerCase().includes('remote'),
    };
  },
};
```

#### Convex Cron Jobs
```typescript
// convex/cron/jobs.ts
import { components } from './_generated/api';
import { ActionCtx } from './_generated/server';

export const syncGreenhouseJobs = async (ctx: ActionCtx) => {
  const companies = await ctx.runQuery(api.companies.getActiveList);

  for (const company of companies) {
    if (company.greenhouseBoardToken) {
      const jobs = await greenhouseClient.fetchJobs(company.greenhouseBoardToken);

      for (const job of jobs) {
        await ctx.runMutation(api.jobs.upsert, {
          externalId: job.externalId,
          platform: 'greenhouse',
          data: job,
        });
      }
    }
  }
};

// Run every 6 hours
export const schedule = {
  cron: '0 */6 * * *',
  handler: syncGreenhouseJobs,
};
```

#### Database Schema
```typescript
// convex/schema.ts
import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  jobs: defineTable({
    externalId: v.string(),
    platform: v.string(),
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
    postedAt: v.number(), // Unix timestamp
    syncedAt: v.number(),
    status: v.string(), // 'active', 'closed', 'archived'
  })
    .index('by_external_id', ['externalId'])
    .index('by_platform', ['platform'])
    .index('by_company', ['company']),

  companies: defineTable({
    name: v.string(),
    greenhouseBoardToken: v.optional(v.string()),
    leverBoardToken: v.optional(v.string()),
    workableAccountKey: v.optional(v.string()),
    active: v.boolean(),
  }),
});
```

### Pros

| Category | Benefit |
|----------|---------|
| **Compliance** | Zero legal risk - public APIs designed for this use |
| **Data Quality** | Structured, reliable data with rich metadata |
| **Maintenance** | Low - official APIs with backward compatibility |
| **Performance** | Fast, predictable response times |
| **Cost** | Free - no API fees or authentication complexity |
| **Scalability** | Easy to add new boards (same pattern) |
| **Reliability** | 99.9% uptime, documented error handling |

### Cons

| Category | Limitation |
|----------|-----------|
| **Coverage** | Limited to companies using these platforms (~30% of tech jobs) |
| **Discovery** | Must know board tokens (no directory of all companies) |
| **Real-time** | 6-hour sync latency (cron-based) |
| **Non-tech** | Fewer non-technical companies on these platforms |

### Technical Complexity

| Aspect | Complexity | Notes |
|--------|-----------|-------|
| Backend | Low | Standard REST API integration |
| Database | Low | Straightforward schema |
| Auth | None | Public APIs |
| Rate Limiting | Minimal | Respect reasonable limits |
| Error Handling | Standard | HTTP status codes |

---

## Approach 2: Partnership APIs with User Credentials

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Convex Backend                           │
│                                                                 │
│  ┌─────────────┐    ┌──────────────┐    ┌─────────────────┐   │
│  │  Scheduled  │───▶│  OAuth 2.0   │───▶│  API Client     │   │
│  │  Cron Jobs  │    │  Token Mgr   │    │  (LinkedIn,     │   │
│  │             │    │              │    │   ZipRecruiter) │   │
│  └─────────────┘    └──────────────┘    └─────────────────┘   │
│         │                                  │                    │
│         │                          User Tokens (Secure Store)   │
│         ▼                                  ▼                    │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  Secrets Management (Convex Environment Variables)   │    │
│  └──────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    LinkedIn Partnership API
                    (OAuth 2.0 Required)
```

### Technical Specifications

#### OAuth Flow
```typescript
// convex/lib/oauth/linkedin.ts
import { v } from 'convex/values';

interface LinkedInConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

// Store in Convex environment variables (never in code)
const LINKEDIN_CONFIG: LinkedInConfig = {
  clientId: process.env.LINKEDIN_CLIENT_ID!,
  clientSecret: process.env.LINKEDIN_CLIENT_SECRET!,
  redirectUri: process.env.LINKEDIN_REDIRECT_URI!,
};

export class LinkedInOAuth {
  // Step 1: Redirect user to LinkedIn
  getAuthUrl(state: string): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: LINKEDIN_CONFIG.clientId,
      redirect_uri: LINKEDIN_CONFIG.redirectUri,
      scope: 'r_jobs r_companies', // Job posting + company info
      state: state,
    });

    return `https://www.linkedin.com/oauth/v2/authorization?${params}`;
  }

  // Step 2: Exchange code for access token
  async exchangeCode(code: string): Promise<{ access_token: string; refresh_token: string }> {
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

  // Step 3: Use access token to fetch jobs
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

    if (!response.ok) {
      if (response.status === 401) {
        // Token expired - need refresh
        throw new Error('TOKEN_EXPIRED');
      }
      throw new Error(`LinkedIn API error: ${response.status}`);
    }

    return await response.json();
  }

  // Step 4: Refresh expired token
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

#### Token Storage in Convex
```typescript
// convex/schema.ts
export default defineSchema({
  userCredentials: defineTable({
    userId: v.id('users'),
    platform: v.string(), // 'linkedin', 'ziprecruiter'
    accessToken: v.string(), // Encrypt at rest
    refreshToken: v.optional(v.string()),
    tokenExpiresAt: v.number(),
    scope: v.array(v.string()),
  })
    .index('by_user_platform', ['userId', 'platform']),

  apiConfig: defineTable({
    platform: v.string(),
    clientId: v.string(), // Stored securely
    status: v.string(), // 'active', 'expired', 'revoked'
  }),
});
```

#### Automated Token Refresh
```typescript
// convex/cron/tokenRefresh.ts
export const refreshExpiredTokens = async (ctx: ActionCtx) => {
  const now = Date.now();
  const expiredCredentials = await ctx.runQuery(api.credentials.findExpiring, {
    expiresBefore: now + 3600000, // Refresh 1 hour before expiry
  });

  for (const cred of expiredCredentials) {
    try {
      const oauth = getOAuthClient(cred.platform);
      const newToken = await oauth.refreshAccessToken(cred.refreshToken!);

      await ctx.runMutation(api.credentials.updateToken, {
        credentialId: cred._id,
        accessToken: newToken,
        tokenExpiresAt: now + (3600 * 1000), // 1 hour from now
      });
    } catch (error) {
      console.error(`Token refresh failed for ${cred.platform}:`, error);
      await ctx.runMutation(api.credentials.markExpired, {
        credentialId: cred._id,
      });
    }
  }
};

// Run every 30 minutes
export const schedule = {
  cron: '*/30 * * * *',
  handler: refreshExpiredTokens,
};
```

### Pros

| Category | Benefit |
|----------|---------|
| **Coverage** | Access to LinkedIn's massive job database |
| **Data Quality** | Rich metadata, applicant tracking integration |
| **Real-time** | Near real-time access to new postings |
| **Platform Support** | Official, supported integration path |

### Cons

| Category | Limitation |
|----------|-----------|
| **Compliance** | Medium risk - must comply with API ToS |
| **Complexity** | High - OAuth flows, token management, security |
| **Approval Required** | LinkedIn Partnership Program approval needed |
| **User Friction** | Users must authorize application |
| **Rate Limits** | Strict limits (500-1000 requests/day) |
| **Maintenance** | Medium - API changes, token rotation |

### Technical Complexity

| Aspect | Complexity | Notes |
|--------|-----------|-------|
| Backend | High | OAuth implementation, token management |
| Database | Medium | Secure credential storage |
| Auth | High | OAuth 2.0 flows, refresh tokens |
| Security | High | Token encryption, rotation |
| Error Handling | Complex | Token expiry, rate limits, API errors |

---

## Approach 3: RSS Feeds with Scraping Fallback

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Convex Backend                           │
│                                                                 │
│  ┌─────────────┐    ┌──────────────────┐    ┌─────────────────┐│
│  │  Scheduled  │───▶│  RSS Feed Parser │───▶│  Job Enricher   ││
│  │  Cron Jobs  │    │  (Indeed, Monster│    │  (Extract       ││
│  │             │    │   SimplyHired)   │    │   Metadata)     ││
│  └─────────────┘    └──────────────────┘    └─────────────────┘│
│         │                                          │            │
│         │                                          ▼            │
│         │                              ┌──────────────────┐    │
│         │                              │  Limited Data    │    │
│         │                              │  (title, company,│    │
│         │                              │   location, url) │    │
│         │                              └──────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    RSS Feed URLs
                    (Public, Rate Limited)
```

### Technical Specifications

#### RSS Feed Parser
```typescript
// convex/lib/rss/jobFeeds.ts
import { Parser } from 'xml2js'; // npm install xml2js

interface RSSFeedConfig {
  baseUrl: string;
  queryParam: string;
  locationParam: string;
}

const FEED_CONFIGS: Record<string, RSSFeedConfig> = {
  indeed: {
    baseUrl: 'https://www.indeed.com/rss',
    queryParam: 'q',
    locationParam: 'l',
  },
  monster: {
    baseUrl: 'https://www.monster.com/rss/rss2.aspx',
    queryParam: 'q',
    locationParam: 'l',
  },
};

export class RSSJobCrawler {
  private parser = new Parser({
    explicitArray: false,
    mergeAttrs: true,
  });

  async fetchJobs(platform: string, query: string, location: string) {
    const config = FEED_CONFIGS[platform];
    if (!config) throw new Error(`Unknown platform: ${platform}`);

    const url = `${config.baseUrl}?${config.queryParam}=${encodeURIComponent(query)}&${config.locationParam}=${encodeURIComponent(location)}`;

    const response = await fetch(url);
    if (!response.ok) throw new Error(`RSS fetch error: ${response.status}`);

    const xml = await response.text();
    const feed = await this.parser.parseStringPromise(xml);

    return this.parseRSSJobs(feed, platform);
  }

  private parseRSSJobs(feed: any, platform: string) {
    const items = feed.rss?.channel?.item || [];

    return items.map((item: any) => ({
      externalId: this.generateHash(item.link),
      platform,
      title: item.title?.split('-')[0]?.trim() || 'Unknown',
      company: this.extractCompany(item.title),
      location: this.extractLocation(item.title),
      description: item.description || '',
      url: item.link,
      postedAt: this.parseDate(item.pubDate),
      source: 'rss_feed',
      dataQuality: 'limited', // Flag as low-quality data
    }));
  }

  private generateHash(url: string): string {
    // Create stable ID from URL
    return `rss-${Buffer.from(url).toString('base64').slice(0, 16)}`;
  }

  private extractCompany(title: string): string {
    // Parse "Software Engineer - Company Name" format
    const parts = title.split('-');
    return parts[parts.length - 1]?.trim() || 'Unknown';
  }

  private extractLocation(title: string): string {
    // Most RSS feeds include location in title
    // Example: "Software Engineer - Company - San Francisco, CA"
    const parts = title.split('-');
    return parts.length > 2 ? parts[2]?.trim() : 'Unknown';
  }

  private parseDate(dateStr: string): Date {
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? new Date() : date;
  }
}
```

#### Data Quality Tracking
```typescript
// convex/schema.ts
export default defineSchema({
  jobs: defineTable({
    externalId: v.string(),
    platform: v.string(),
    title: v.string(),
    description: v.string(),
    company: v.optional(v.string()), // May be missing from RSS
    location: v.optional(v.string()),
    url: v.string(),
    postedAt: v.number(),
    dataQuality: v.string(), // 'full', 'limited', 'enriched'
    source: v.string(), // 'api', 'rss_feed'
    enrichedAt: v.optional(v.number()), // If post-processing applied
  })
    .index('by_data_quality', ['dataQuality'])
    .index('by_platform', ['platform']),

  enrichmentQueue: defineTable({
    jobId: v.id('jobs'),
    status: v.string(), // 'pending', 'processing', 'completed', 'failed'
    attempts: v.number(),
    lastAttemptAt: v.optional(v.number()),
  }),
});
```

#### Enrichment Pipeline (Optional)
```typescript
// convex/actions/enrichJobs.ts
export const enrichRSSJobs = async (ctx: ActionCtx) => {
  const limitedJobs = await ctx.runQuery(api.jobs.findByQuality, {
    quality: 'limited',
    limit: 50,
  });

  for (const job of limitedJobs) {
    try {
      // Fetch original job page to extract missing data
      const enriched = await fetchAndEnrich(job.url);

      await ctx.runMutation(api.jobs.update, {
        id: job._id,
        updates: {
          company: enriched.company,
          location: enriched.location,
          description: enriched.description,
          dataQuality: 'enriched',
          enrichedAt: Date.now(),
        },
      });
    } catch (error) {
      console.error(`Enrichment failed for job ${job._id}:`, error);
    }
  }
};

async function fetchAndEnrich(url: string) {
  // WARNING: This enters scraping territory - check compliance
  // Only use for platforms that allow it
  const response = await fetch(url);
  const html = await response.text();

  // Parse HTML to extract structured data
  const company = extractCompanyFromHTML(html);
  const location = extractLocationFromHTML(html);
  const description = extractDescriptionFromHTML(html);

  return { company, location, description };
}
```

### Pros

| Category | Benefit |
|----------|---------|
| **Coverage** | Broad - Indeed, Monster, SimplyHired via RSS |
| **Compliance** | Low risk - RSS feeds are public endpoints |
| **Complexity** | Low - standard RSS parsing |
| **Cost** | Free - no API keys or partnerships |
| **Speed** | Fast - lightweight XML parsing |

### Cons

| Category | Limitation |
|----------|-----------|
| **Data Quality** | Poor - limited metadata, no structured fields |
| **Results Limit** | 20-50 results per query |
| **No Filtering** | Basic search only (query + location) |
| **Reliability** | Medium - feed formats change without notice |
| **Enrichment** | Requires scraping (compliance risk) |
| **Real-time** | Polling required (no webhooks) |

### Technical Complexity

| Aspect | Complexity | Notes |
|--------|-----------|-------|
| Backend | Low-Medium | RSS parsing, error handling |
| Database | Low | Simple schema with quality flags |
| Auth | None | Public feeds |
| Rate Limiting | Minimal | Respect reasonable crawl delays |
| Error Handling | Standard | HTTP errors, malformed XML |

---

## Comparison Matrix

| Aspect | Approach 1: Public APIs | Approach 2: Partnership APIs | Approach 3: RSS Feeds |
|--------|------------------------|------------------------------|----------------------|
| **Implementation Time** | 2-3 weeks | 4-6 weeks | 1-2 weeks |
| **Technical Complexity** | Low | High | Low |
| **Compliance Risk** | None | Low-Medium | Low |
| **Data Quality** | Excellent | Excellent | Poor |
| **Coverage** | Medium (30% of tech) | High (LinkedIn + others) | Broad (Indeed, Monster) |
| **Maintenance** | Low | Medium | Medium |
| **Cost** | Free | Partnership fees | Free |
| **Scalability** | Easy (add boards) | Limited by rate limits | Easy (add feeds) |
| **Real-time** | Hourly sync | Near real-time | Polling (hourly) |
| **User Friction** | None | OAuth required | None |
| **Rate Limits** | None documented | Strict | None documented |
| **Long-term Viability** | High | Medium | Low (feeds may disappear) |

---

## Hybrid Strategy (Recommended)

### Phase-Based Implementation

#### Phase 1: Quick Wins (Weeks 1-2)
- Implement Approach 1 (Greenhouse, Lever, Workable)
- Target top 20 companies by user interest
- Establish data pipeline and normalization

#### Phase 2: Broad Coverage (Weeks 3-4)
- Add Approach 3 (RSS feeds) for Indeed, Monster
- Implement data quality tracking
- Flag low-quality results in UI

#### Phase 3: Premium Access (Months 2-3)
- Apply for LinkedIn Partnership Program
- Implement Approach 2 for LinkedIn Jobs
- Add OAuth flow for user credentials

#### Phase 4: Optimization (Ongoing)
- Monitor data quality metrics
- Prioritize high-quality sources in UI
- Deprioritize or remove low-quality RSS feeds

### Architecture for Hybrid

```typescript
// convex/lib/jobSources/index.ts
export class JobSourceManager {
  private sources: JobSource[] = [
    new GreenhouseSource(),
    new LeverSource(),
    new WorkableSource(),
    new IndeedRSSSource(),
    new LinkedInAPISource(), // If partnership approved
  ];

  async fetchAllJobs(params: SearchParams): Promise<Job[]> {
    const results = await Promise.allSettled(
      this.sources.map(source => source.fetchJobs(params))
    );

    return results
      .filter(r => r.status === 'fulfilled')
      .flatMap(r => (r as PromiseFulfilledResult<Job[]>).value)
      .sort((a, b) => {
        // Prioritize high-quality sources
        const qualityOrder = { full: 0, enriched: 1, limited: 2 };
        return qualityOrder[a.dataQuality] - qualityOrder[b.dataQuality];
      });
  }

  getSourceStats() {
    return this.sources.map(source => ({
      platform: source.name,
      dataQuality: source.quality,
      active: source.enabled,
      lastSync: source.lastSync,
    }));
  }
}
```

---

## Implementation Recommendation

**Start with Approach 1 (Public APIs) + Approach 3 (RSS Feeds) for initial coverage, then evaluate Approach 2 (Partnership APIs) based on user demand.**

### Rationale

1. **Fastest Path to Value**: Public APIs provide high-quality data immediately
2. **Low Risk**: No compliance concerns with public endpoints
3. **Scalable**: Easy to add new board APIs as needed
4. **Future-Proof**: Foundation for adding premium sources later
5. **User-Driven**: Partnership API investment based on actual user demand

See `recommendation.md` for detailed implementation roadmap.
