# Job/Network Crawler Agent Research

> **Task**: US-IMP-010
> **Last Updated**: 2026-04-03
> **Status**: ✅ Complete

## Overview

This research documents the technical approach for building a job/network crawling agent that can ingest job postings and networking content from multiple platforms.

**Key Finding**: Use a hybrid approach starting with public board APIs (Greenhouse, Lever, Workable) for high-quality data, supplemented by RSS feeds (Indeed, Monster) for broad coverage, with partnership APIs (LinkedIn) as a future enhancement.

## Documents

| Document | Description | Status |
|----------|-------------|--------|
| [apis.md](./apis.md) | Available job board APIs, endpoints, authentication, and data fields | ✅ Complete |
| [compliance.md](./compliance.md) | Legal framework, ToS requirements, robots.txt compliance, and best practices | ✅ Complete |
| [approaches.md](./approaches.md) | Comparison of 3 implementation approaches with technical specifications | ✅ Complete |
| [recommendation.md](./recommendation.md) | Recommended approach with phased implementation roadmap | ✅ Complete |

## Executive Summary

### Recommendation

**Start with public board APIs (Greenhouse, Lever, Workable) + RSS feeds (Indeed, Monster) for initial coverage, then evaluate partnership APIs (LinkedIn) based on user demand.**

### Why This Approach

| Factor | Assessment |
|--------|------------|
| **Compliance Risk** | None - public APIs designed for programmatic access |
| **Data Quality** | Excellent - full job descriptions, structured metadata |
| **Time to Market** | 2-3 weeks to production |
| **Coverage** | ~30% of technical jobs initially, scalable over time |
| **Maintenance** | Low - stable, documented APIs |
| **Cost** | Free - no API fees or partnership costs |

### Key Platforms

#### Public Board APIs (Phase 1 - Primary)
- **Greenhouse**: Airbnb, Stripe, DoorDash, Figma, Notion, Reddit, Slack, Shopify, Square, Discord
- **Lever**: Uber, Netflix, Lyft, Dropbox, Instacart, Docker, Eventbrite
- **Workable**: Segment, Mixpanel, Qualtrics, Drift, G2, Thumbtack

#### RSS Feeds (Phase 2 - Supplemental)
- **Indeed**: `https://www.indeed.com/rss?q={query}&l={location}`
- **Monster**: `https://www.monster.com/rss/rss2.aspx?q={query}`
- **SimplyHired**: Public RSS feeds

#### Partnership APIs (Phase 3 - Future)
- **LinkedIn**: Requires Partnership Program application (OAuth 2.0)
- **ZipRecruiter**: Requires publisher partnership
- **AngelList (Wellfound)**: User authentication required

## Implementation Roadmap

### Phase 1: Foundation (Weeks 1-2) - MVP
- Implement Greenhouse + Lever + Workable integrations
- Configure top 20 companies
- Launch with 2,000+ job postings
- Establish sync pipeline (hourly cron jobs)

### Phase 2: Expansion (Weeks 3-4) - Broad Coverage
- Add RSS feed integration for Indeed, Monster
- Implement data quality tracking
- Expand to 50+ companies
- Add search functionality

### Phase 3: Premium Access (Months 2-3) - LinkedIn Integration
- Apply for LinkedIn Partnership Program
- Implement OAuth flow for user authentication
- Add LinkedIn Jobs API integration
- Provide premium LinkedIn data to users

### Phase 4: Optimization (Ongoing)
- Monitor data quality metrics
- Optimize sync performance
- Add more board APIs as discovered
- Improve search relevance

## Compliance Summary

### ✅ Allowed (Zero Risk)
- Public board APIs (Greenhouse, Lever, Workable)
- RSS feeds from job boards
- Official APIs with proper authentication

### ⚠️ Allowed with Caution (Low-Medium Risk)
- LinkedIn Partnership API (if approved)
- ZipRecruiter Publisher API (with partnership)
- AngelList API (with user authentication)

### ❌ Prohibited (High Risk)
- Web scraping LinkedIn (ToS prohibits)
- Web scraping Indeed (ToS prohibits, robots.txt disallows)
- Web scraping Glassdoor (ToS prohibits, robots.txt disallows)

## Technical Highlights

### Database Schema
```typescript
jobs: {
  externalId: string;     // Platform-specific ID
  platform: string;       // 'greenhouse', 'lever', 'workable', 'indeed-rss'
  title: string;
  description: string;
  company: string;
  location: { city, state, country, remote };
  url: string;
  postedAt: number;
  syncedAt: number;
  status: string;         // 'active', 'closed', 'archived'
  dataQuality: string;    // 'full', 'limited', 'enriched'
}
```

### API Integration Pattern
```typescript
// Generic client pattern
class GreenhouseClient {
  async fetchJobs(boardToken: string): Promise<Job[]> {
    const response = await fetch(
      `https://boards-api.greenhouse.io/v1/boards/${boardToken}/jobs`
    );
    const data = await response.json();
    return data.jobs.map(this.transformJob);
  }
}
```

### Sync Pipeline
```typescript
// Cron job for hourly syncs
export const syncGreenhouseJobs = async (ctx: ActionCtx) => {
  const companies = await ctx.runQuery(api.companies.getActiveList);

  for (const company of companies) {
    if (company.greenhouseBoardToken) {
      const jobs = await greenhouseClient.fetchJobs(company.greenhouseBoardToken);
      for (const job of jobs) {
        await ctx.runMutation(api.jobs.upsert, { job });
      }
    }
  }
};
```

## Success Metrics

### Phase 1 (Weeks 1-2)
- ✅ 20 companies configured
- ✅ 2,000+ job postings available
- ✅ Hourly syncs running reliably
- ✅ Zero compliance issues

### Phase 2 (Weeks 3-4)
- ✅ 50+ companies configured
- ✅ 5,000+ job postings available
- ✅ Search functionality working
- ✅ Data quality tracking in place

### Phase 3 (Months 2-3)
- ✅ LinkedIn partnership approved (or decision to defer)
- ✅ OAuth flow implemented
- ✅ LinkedIn jobs integrated (if approved)

### Ongoing
- ✅ 100+ companies configured
- ✅ 10,000+ job postings available
- ✅ 99.9% sync success rate
- ✅ User engagement > 80%

## Next Steps

1. **Review this research** with product/engineering team
2. **Confirm target companies** for Phase 1 implementation
3. **Create implementation task** for Phase 1 (Greenhouse + Lever + Workable)
4. **Proceed with development** following TDD methodology

## References

- [LinkedIn API Documentation](https://learn.microsoft.com/en-us/linkedin/)
- [Greenhouse API](https://developers.greenhouse.io/)
- [Lever API](https://hire.lever.co/developer/documentation)
- [Workable API](https://developers.workable.com/)
- [robots.txt RFC 9309](https://datatracker.ietf.org/doc/html/rfc9309)
- [hiQ Labs v. LinkedIn (2022)](https://cdn.ca9.uscourts.gov/datastore/opinions/2022/04/18/17-16783.pdf)

---

**Research Complete**: All acceptance criteria met
- ✅ APIs for job boards documented
- ✅ Compliance and legal considerations documented
- ✅ 3 implementation approaches compared
- ✅ Preferred approach with rationale documented
