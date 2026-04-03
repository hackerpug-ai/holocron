# Job Board & Network APIs Research

> **Last Updated**: 2026-04-03
> **Purpose**: Document available APIs for job board and networking platforms to inform crawling agent implementation

## Overview

This document catalogs official APIs for major job boards and networking platforms. API-based approaches are strongly preferred over web scraping for reliability, compliance, and data quality.

## Priority APIs

### LinkedIn

#### LinkedIn Jobs API (Member Context)
- **Endpoint**: `https://api.linkedin.com/v2/jobs`
- **Authentication**: OAuth 2.0 (Member permission required)
- **Access Level**: Requires LinkedIn Partnership Program application
- **Rate Limit**: Varies by access tier (typically 500-1000 requests/day)
- **Key Data Fields**:
  - Job title, description, location
  - Company information
  - Application deadline
  - Skills and requirements
  - Job posting date
- **Documentation**: https://learn.microsoft.com/en-us/linkedin/shared/references/v2/job/jobs
- **Notes**:
  - API access requires approval through LinkedIn Partnership Program
  - Member context APIs require user authentication
  - Limited to jobs visible to the authenticated user
  - No public/unauthenticated job search API available

#### LinkedIn Company Page API
- **Endpoint**: `https://api.linkedin.com/v2/organizations`
- **Authentication**: OAuth 2.0
- **Use Case**: Fetch company details, job postings from company pages
- **Rate Limit**: 500 requests/day (standard tier)

### Indeed

#### Indeed API
- **Status**: **Public API Deprecated** (2018)
- **Current Access**: Publisher API only (for job posting, not retrieval)
- **Authentication**: API Key (requires publisher account)
- **Documentation**: https://www.indeed.com/publisher
- **Important**: Indeed does not provide a public API for job searching or retrieval
- **Alternative Approaches**:
  - Indeed RSS feeds (limited to specific searches)
  - Partner API (requires business partnership)
  - Web scraping (prohibited by ToS - see compliance.md)

#### Indeed RSS Feeds
- **Endpoint Format**: `https://www.indeed.com/rss?q={query}&l={location}`
- **Authentication**: None (public RSS)
- **Rate Limit**: Not documented (respect standard crawl delays)
- **Data Fields**: Title, description, location, company, URL
- **Limitations**:
  - Limited to 20-50 results per feed
  - No detailed job description
  - No structured data (skills, salary, etc.)
  - Feed format may change without notice

### Glassdoor

#### Glassdoor API
- **Status**: No public API available
- **Access**: Partner API only (requires business partnership)
- **Documentation**: Not publicly available
- **Alternative**: Glassdoor offers employer solutions for job posting
- **Web Scraping**: Prohibited by ToS (strict anti-scraping measures)

### GitHub Jobs

#### GitHub Jobs API (Deprecated)
- **Status**: **DEPRECATED** - Shut down August 2021
- **Migration**: GitHub recommends using third-party job boards
- **Historical Endpoint**: `https://jobs.github.com/positions.json`
- **Current State**: No longer functional

### Alternative Job Board APIs

#### Greenhouse (Boards API)
- **Endpoint**: `https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs`
- **Authentication**: None (public boards)
- **Rate Limit**: None documented (respect reasonable limits)
- **Data Fields**: Full job details, company info, application URL
- **Coverage**: Tech companies using Greenhouse (Airbnb, Stripe, DoorDash, etc.)
- **Example**:
```bash
curl https://boards-api.greenhouse.io/v1/boards/airbnb/jobs
```

#### Lever (Boards API)
- **Endpoint**: `https://jobs.lever.co/v1/postings/{company_site}`
- **Authentication**: None (public boards)
- **Rate Limit**: None documented
- **Data Fields**: Job listings, departments, locations, requirements
- **Coverage**: Tech companies using Lever (Uber, Netflix, etc.)
- **Example**:
```bash
curl https://jobs.lever.co/v1/postings/uber
```

#### Workable (Jobs API)
- **Endpoint**: `https://apply.workable.com/api/v1/widget/accounts/{account_key}/jobs`
- **Authentication**: None (public job boards)
- **Rate Limit**: None documented
- **Data Fields**: Full job details, application form, benefits
- **Example**:
```bash
curl https://apply.workable.com/api/v1/widget/accounts/segment/jobs
```

#### ZipRecruiter (Publisher API)
- **Endpoint**: `https://api.ziprecruiter.com/jobs/v1`
- **Authentication**: API Key (publisher account required)
- **Rate Limit**: Varies by account tier
- **Documentation**: https://www.ziprecruiter.com/publishers/api
- **Notes**: Requires publisher partnership approval

#### AngelList (Wellfound) API
- **Endpoint**: `https://wellfound.com/api/jobs`
- **Status**: Limited public API access
- **Authentication**: Required (user account)
- **Coverage**: Startup jobs only
- **Documentation**: https://wellfound.com/developers

## RSS Feeds (Fallback Option)

### Available Job Board RSS Feeds

| Platform | RSS Pattern | Limitations |
|----------|-------------|-------------|
| Indeed | `indeed.com/rss?q={query}&l={location}` | 50 results, no full description |
| LinkedIn | `linkedin.com/jobs/rss?{params}` | Requires authentication |
| Glassdoor | Not available | N/A |
| Monster | `monster.com/rss/rss2.aspx?q={query}` | Limited results |
| SimplyHired | `simplyhired.com/a/job-feed/rss/q-{query}` | Basic data only |

### RSS Limitations
- No structured data (skills, salary, experience level)
- Limited result sets (typically 20-50 items)
- No filtering or advanced search parameters
- Feed formats may change without notice
- No real-time updates (polling required)

## API Comparison Matrix

| API | Access | Auth | Rate Limit | Data Quality | Structured Data | Recommended |
|-----|--------|------|------------|--------------|-----------------|-------------|
| LinkedIn Jobs | Partnership | OAuth 2.0 | 500-1000/day | Excellent | Yes | Yes (if access) |
| Indeed | N/A | N/A | N/A | N/A | N/A | No |
| Greenhouse | Public | None | None | Excellent | Yes | Yes |
| Lever | Public | None | None | Excellent | Yes | Yes |
| Workable | Public | None | None | Excellent | Yes | Yes |
| ZipRecruiter | Partnership | API Key | Varies | Good | Yes | Maybe |
| AngelList | User | OAuth | Limited | Good | Yes | Maybe |
| RSS Feeds | Public | None | None | Poor | No | Fallback only |

## Technical Implementation Notes

### API Integration Pattern
```typescript
// Generic API client pattern for job board APIs
interface JobBoardClient {
  fetchJobs(params: SearchParams): Promise<Job[]>;
  getJobDetails(jobId: string): Promise<JobDetail>;
}

// Example: Greenhouse implementation
class GreenhouseClient implements JobBoardClient {
  private baseUrl = 'https://boards-api.greenhouse.io/v1/boards';

  async fetchJobs(boardToken: string): Promise<Job[]> {
    const response = await fetch(`${this.baseUrl}/${boardToken}/jobs`);
    const data = await response.json();
    return data.jobs.map(this.transformJob);
  }

  private transformJob(raw: any): Job {
    return {
      id: raw.id,
      title: raw.title,
      company: raw.metadata?.[0]?.value || 'Unknown',
      location: raw.location.name,
      description: raw.content,
      url: raw.absolute_url,
      postedAt: raw.updated_at,
      skills: this.extractSkills(raw.content),
    };
  }
}
```

### Authentication Strategy
```typescript
// OAuth 2.0 flow for LinkedIn/other protected APIs
interface AuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
}

// Store credentials securely (Convex secrets)
const linkedInConfig: AuthConfig = {
  clientId: process.env.LINKEDIN_CLIENT_ID!,
  clientSecret: process.env.LINKEDIN_CLIENT_SECRET!,
  redirectUri: 'https://yourapp.com/auth/callback',
  scopes: ['r_jobs', 'r_companies'],
};
```

### Rate Limiting Strategy
```typescript
// Implement token bucket or sliding window for rate limiting
class RateLimiter {
  private requests: number[] = [];

  constructor(private maxRequests: number, private windowMs: number) {}

  async acquire(): Promise<void> {
    const now = Date.now();
    this.requests = this.requests.filter(t => now - t < this.windowMs);

    if (this.requests.length >= this.maxRequests) {
      const waitTime = this.windowMs - (now - this.requests[0]);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.requests.push(now);
  }
}

// Usage with API client
const limiter = new RateLimiter(500, 24 * 60 * 60 * 1000); // 500/day

async function fetchWithLimit(url: string) {
  await limiter.acquire();
  return fetch(url);
}
```

## Data Standardization

### Common Job Schema
```typescript
interface Job {
  id: string;                    // Unique identifier
  platform: 'linkedin' | 'indeed' | 'greenhouse' | 'lever' | 'workable';
  externalId: string;            // Platform-specific job ID
  title: string;
  company: string;
  location: {
    city?: string;
    state?: string;
    country: string;
    remote: boolean;
  };
  description: string;
  requirements: string[];
  skills: string[];
  salary?: {
    min?: number;
    max?: number;
    currency: string;
    period: 'hourly' | 'yearly';
  };
  url: string;                   // Original job posting URL
  postedAt: Date;
  expiresAt?: Date;
  employmentType: 'full-time' | 'part-time' | 'contract' | 'internship';
  experienceLevel?: 'entry' | 'mid' | 'senior' | 'lead';
}
```

## Recommendations Summary

1. **Primary Strategy**: Focus on public board APIs (Greenhouse, Lever, Workable) - they provide excellent data quality without partnership requirements
2. **Secondary Strategy**: Explore partnership APIs (LinkedIn, ZipRecruiter) for broader coverage
3. **Fallback**: Use RSS feeds for Indeed and other platforms without APIs, but accept limited data quality
4. **Avoid**: Web scraping of platforms with explicit ToS prohibitions (Indeed, Glassdoor)

## References

- LinkedIn API Documentation: https://learn.microsoft.com/en-us/linkedin/
- Greenhouse API: https://developers.greenhouse.io/
- Lever API: https://hire.lever.co/developer/documentation
- Workable API: https://developers.workable.com/
- Indeed Publisher API: https://www.indeed.com/publisher

## Next Steps

1. Confirm which board APIs your target companies use
2. Apply for LinkedIn Partnership Program if needed
3. Prototype Greenhouse/Lever integration (fastest path to working solution)
4. Design unified job schema across all platforms
