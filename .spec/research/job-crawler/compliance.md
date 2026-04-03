# Web Scraping & API Compliance Research

> **Last Updated**: 2026-04-03
> **Purpose**: Document legal and compliance considerations for job board crawling and data collection

## Overview

This document outlines the legal framework, Terms of Service (ToS) requirements, and best practices for collecting job posting data from various platforms. **Compliance is critical - unauthorized scraping can result in legal action, IP bans, and reputational damage.**

---

## Legal Framework

### United States

#### Computer Fraud and Abuse Act (CFAA)
- **Relevance**: Prohibits unauthorized access to computer systems
- **Key Cases**:
  - *hiQ Labs v. LinkedIn* (2022): Court ruled that public data scraping does not violate CFAA
  - **Important**: This ruling applies only to publicly accessible data, not authenticated/private content
- **Guidance**: Scraping public data is generally legal under CFAA, but other laws still apply

#### Copyright Law (DMCA)
- **Relevance**: Job postings may be protected as original works
- **Fair Use**: Transformative use (e.g., indexing, summarizing) may qualify
- **Risk**: Reproducing full job descriptions without permission may infringe copyright
- **Best Practice**: Store minimal necessary data, link to original posting

#### Terms of Service Contract Law
- **Relevance**: ToS are binding contracts between users and platforms
- **Enforcement**: Platforms can ban accounts, block IPs, and seek legal remedies
- **Key Precedent**: *Facebook v. Power Ventures* (9th Cir. 2018) - ToS violations can result in liability under CFAA
- **Guidance**: Always read and comply with ToS and robots.txt

#### California Consumer Privacy Act (CCPA)
- **Relevance**: Regulates collection and sale of personal information
- **Application**: If collecting California residents' data (includes job posting data)
- **Requirements**: Notice, access, deletion, opt-out rights
- **Guidance**: Job posting data is generally business/commercial data, not personal data

### International Considerations

#### GDPR (European Union)
- **Relevance**: If processing EU residents' data
- **Requirements**: Legal basis for processing, data subject rights
- **Application**: Job posting data typically falls under legitimate interest for recruitment
- **Guidance**: Consult legal counsel if targeting EU market

---

## Platform-Specific Compliance

### LinkedIn

#### Terms of Service
- **Scraping Policy**: **PROHIBITED**
- **ToS Language** (paraphrased): "You may not... copy, modify, create derivative works from, or attempt to... scrape, crawl, or spider the Site or any portion thereof"
- **Enforcement**: Aggressive - IP bans, account termination, legal action
- **Source**: [LinkedIn User Agreement](https://www.linkedin.com/legal/user-agreement)

#### robots.txt Analysis
```
# LinkedIn robots.txt
User-agent: *
Disallow: /ws/
Disallow: /sales/
Disallow: /labs/
Disallow: /learning/
Disallow: /*ajax*
```

- **Status**: No explicit job posting disallow, but ToS prohibits scraping
- **Guidance**: Do not scrape LinkedIn. Use official API only.

#### Legal Precedent
- **hiQ Labs v. LinkedIn** (2022): hiQ won initial ruling, but case settled
- **Current State**: LinkedIn still prohibits scraping in ToS
- **Risk**: High - LinkedIn actively enforces ToS

#### API Compliance
- **Requirement**: Use official API with proper authentication
- **Application Process**: LinkedIn Partnership Program
- **Data Use**: Must comply with API Terms of Use
- **Rate Limits**: Strict enforcement, can result in API suspension

### Indeed

#### Terms of Service
- **Scraping Policy**: **STRICTLY PROHIBITED**
- **ToS Language** (paraphrased): "You may not... access the Site by any means other than through the interfaces we provide... use any robot, spider, scraper, or other automated means"
- **Enforcement**: Very aggressive - sophisticated bot detection, IP bans
- **Source**: [Indeed ToS](https://www.indeed.com/legal)

#### robots.txt Analysis
```
# Indeed robots.txt (representative)
User-agent: *
Disallow: /cmp/
Disallow: /r/
Disallow: /viewjob
Disallow: /jobs
```

- **Status**: Broad disallow of job-related paths
- **Guidance**: Do not scrape Indeed. Use RSS feeds or publisher API only.

#### Anti-Scraping Measures
- CAPTCHA challenges
- IP blocking and rate limiting
- Behavioral analysis (mouse movements, timing)
- Browser fingerprinting
-honeypot traps for bots

#### Allowed Alternatives
- **RSS Feeds**: Public RSS feeds for search results (limited data)
- **Publisher API**: For job posting, not retrieval (requires publisher account)

### Glassdoor

#### Terms of Service
- **Scraping Policy**: **STRICTLY PROHIBITED**
- **ToS Language**: Prohibits automated access, scraping, data harvesting
- **Enforcement**: Aggressive - legal action against scrapers
- **Source**: [Glassdoor ToS](https://www.glassdoor.com/legal/terms.htm)

#### robots.txt Analysis
```
# Glassdoor robots.txt
User-agent: *
Disallow: /Salary/
Disallow: /Interview/
Disallow: /Reviews/
Disallow: /Jobs/
```

- **Status**: All job-related paths disallowed
- **Guidance**: No scraping. No public API. Partnership only.

#### Legal Action
- Glassdoor has filed lawsuits against scraping companies
- Pursues both injunctive relief and damages
- **Risk Level**: Very High

### GitHub Jobs (Defunct)
- **Status**: API deprecated 2021, no longer available
- **Guidance**: Use company-specific board APIs (Greenhouse, Lever, etc.)

---

## robots.txt Compliance

### What is robots.txt?
- Standard protocol for website bot access control
- Located at `{domain}/robots.txt`
- **Legal Status**: Generally considered binding contract (Facebook v. Power)

### Reading robots.txt

#### Example Parsing
```python
import urllib.robotparser
from urllib.parse import urlparse

def can_scrape(url, user_agent='*'):
    """
    Check if robots.txt allows scraping of given URL
    """
    rp = urllib.robotparser.RobotFileParser()
    parsed = urlparse(url)
    robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
    rp.set_url(robots_url)
    rp.read()
    return rp.can_fetch(user_agent, url)

# Usage
can_scrape('https://www.indeed.com/jobs?q=python')
# Returns: False (disallowed by robots.txt)
```

### Best Practices
1. **Always check robots.txt** before scraping
2. **Respect all Disallow directives**
3. **Implement crawl-delay** if specified
4. **Identify your bot** with User-Agent and contact info
5. **Respect NoIndex meta tags** on individual pages

### robots.txt Example for Your Bot
```txt
# If you host a crawler, respect others' robots.txt
User-agent: HolocronBot/1.0 (+https://holocron.com/bot-info)
Disallow: /private/
Crawl-delay: 10
```

---

## Best Practices for Compliance

### 1. API-First Approach
```typescript
// GOOD: Use official API
const jobs = await greenhouseAPI.fetchJobs({ company: 'airbnb' });

// BAD: Scrape without permission
const jobs = await scrapeIndeedJobs({ query: 'python' });
```

### 2. robots.txt Compliance
```typescript
import robotsParser from 'robots-parser';

const robots = robotsParser('https://example.com/robots.txt', robotsTxt);

if (!robots.isAllowed(url, 'HolocronBot')) {
  console.log('Access denied by robots.txt');
  return [];
}
```

### 3. Rate Limiting & Politeness
```typescript
// Implement conservative rate limits
const MIN_DELAY_MS = 10000; // 10 seconds between requests

let lastRequest = 0;
async function politeFetch(url: string) {
  const now = Date.now();
  const timeSinceLast = now - lastRequest;

  if (timeSinceLast < MIN_DELAY_MS) {
    await new Promise(resolve =>
      setTimeout(resolve, MIN_DELAY_MS - timeSinceLast)
    );
  }

  lastRequest = Date.now();
  return fetch(url);
}
```

### 4. User-Agent Identification
```typescript
// GOOD: Identify your bot
const headers = {
  'User-Agent': 'HolocronBot/1.0 (+https://holocron.com/bot-info); Contact: bot@holocron.com'
};

// BAD: Fake as browser
const headers = {
  'User-Agent': 'Mozilla/5.0 ...' // Deceptive
};
```

### 5. Error Handling & Respect
```typescript
async function fetchWithRespect(url: string) {
  try {
    const response = await fetch(url);

    // Respect 429 (Too Many Requests)
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      await delay(parseInt(retryAfter || '60') * 1000);
      return fetchWithRespect(url); // Retry
    }

    // Respect 403 (Forbidden) - don't retry
    if (response.status === 403) {
      console.error('Access forbidden - stopping');
      return null;
    }

    return response;
  } catch (error) {
    console.error('Fetch error:', error);
    return null;
  }
}
```

### 6. Data Minimization
```typescript
// GOOD: Store only necessary data
interface Job {
  id: string;
  title: string;
  company: string;
  url: string; // Link to original, don't store full description
  postedAt: Date;
}

// BAD: Store everything including full HTML
interface ScrapedJob {
  id: string;
  fullHtml: string; // Copyright risk
  fullDescription: string; // Copyright risk
  // ...
}
```

### 7. Terms of Service Monitoring
- **Document ToS version** when you begin
- **Monitor for ToS changes** (monthly check)
- **Implement version tracking** in your system
- **Stop immediately** if ToS changes to prohibit your use

---

## Risk Assessment Matrix

| Platform | API Available | ToS Allows Scraping | robots.txt Allows | Overall Risk | Recommendation |
|----------|---------------|---------------------|-------------------|--------------|----------------|
| LinkedIn | Yes (limited) | No | Partial | High | API only |
| Indeed | No | No | No | Very High | RSS feeds only |
| Glassdoor | No | No | No | Very High | Avoid |
| Greenhouse | Yes | N/A (public API) | N/A | Low | Recommended |
| Lever | Yes | N/A (public API) | N/A | Low | Recommended |
| Workable | Yes | N/A (public API) | N/A | Low | Recommended |
| AngelList | Yes | Unclear | Unclear | Medium | API only |
| RSS Feeds | N/A | Varies | Varies | Low-Medium | Fallback |

---

## Legal Precedents & Case Law

### Key Cases

#### 1. hiQ Labs v. LinkedIn Corp. (2022)
- **Court**: 9th Circuit Court of Appeals
- **Ruling**: Public data scraping does not violate CFAA
- **Significance**: Clarified that CFAA doesn't prohibit scraping publicly accessible data
- **Limitation**: Does not override ToS contract law
- **Source**: [9th Circuit Opinion](https://cdn.ca9.uscourts.gov/datastore/opinions/2022/04/18/17-16783.pdf)

#### 2. Facebook, Inc. v. Power Ventures, Inc. (2018)
- **Court**: 9th Circuit Court of Appeals
- **Ruling**: ToS violations can result in CFAA liability
- **Significance**: Platforms can enforce ToS through legal means
- **Source**: [9th Circuit Opinion](https://cdn.ca9.uscourts.gov/datastore/opinions/2018/04/30/14-16058.pdf)

#### 3. Van Buren v. United States (2021)
- **Court**: Supreme Court
- **Ruling**: Narrowed CFAA definition of "unauthorized access"
- **Significance**: Clarified that CFAA applies to areas user is not permitted to access, not misuse of permitted access
- **Source**: [Supreme Court Opinion](https://www.supremecourt.gov/opinions/20pdf/19-783_k5fj.pdf)

### Takeaways
- Scraping public data is generally legal under CFAA
- ToS contract law still applies - violating ToS can result in liability
- Best practice: Always use official APIs when available
- If scraping, comply with robots.txt and respect technical barriers

---

## Compliance Checklist

### Before Starting Data Collection

- [ ] Reviewed platform Terms of Service
- [ ] Checked robots.txt for target URLs
- [ ] Confirmed API availability and terms
- [ ] Implemented rate limiting
- [ ] Set proper User-Agent identification
- [ ] Configured error handling for 403/429 responses
- [ ] Documented data retention and use policies
- [ ] Reviewed copyright implications
- [ ] Considered CCPA/GDPR requirements (if applicable)

### Ongoing Compliance

- [ ] Monitor ToS for changes (monthly)
- [ ] Respect robots.txt changes
- [ ] Respond to platform takedown requests
- [ ] Maintain reasonable crawl rates
- [ ] Audit stored data for minimization
- [ ] Provide data deletion if requested

---

## When in Doubt

1. **Use official APIs** - Always preferred over scraping
2. **Ask for permission** - Some platforms grant access on request
3. **Consult legal counsel** - For high-risk platforms
4. **Start with public board APIs** - Greenhouse, Lever, Workable (no compliance issues)
5. **Document everything** - Keep records of ToS review, compliance measures

---

## References

### Legal Resources
- [Electronic Frontier Foundation (EFF) - Web Scraping](https://www.eff.org/)
- [Stanford Law School - Center for Internet and Society](https://cyberlaw.stanford.edu/)
- [CFAA Text](https://www.law.cornell.edu/uscode/text/18/1030)

### Platform ToS
- [LinkedIn User Agreement](https://www.linkedin.com/legal/user-agreement)
- [Indeed Terms of Service](https://www.indeed.com/legal)
- [Glassdoor Terms of Use](https://www.glassdoor.com/legal/terms.htm)

### robots.txt Standards
- [robots.txt RFC](https://datatracker.ietf.org/doc/html/rfc9309)
- [Google robots.txt Guidelines](https://developers.google.com/search/docs/crawling-indexing/robots/robots_txt)

---

**Disclaimer**: This document is for informational purposes only and does not constitute legal advice. Consult with qualified legal counsel for specific compliance requirements.
