# US-IMP-010: Job/Network Crawling Agent Research

> Task ID: US-IMP-010
> Type: FEATURE
> Priority: P3
> Estimate: 120 minutes
> Assignee: backend-implementer

## CRITICAL CONSTRAINTS

### MUST
- Research job/network crawling agent requirements and options
- Document technical approach for implementation
- Identify compliance/legal considerations

### NEVER
- Implement actual crawling without compliance review
- Scrape sites without robots.txt compliance

### STRICTLY
- Research MUST include API-based options (prefer over scraping)
- Compliance MUST be documented before any implementation

## SPECIFICATION

**Objective:** Research and document the technical approach for building a job/network crawling agent that can ingest job postings and networking content.

**Success looks like:** A comprehensive research document outlining implementation options, preferred APIs, compliance considerations, and technical architecture for the job/network crawling agent.

## ACCEPTANCE CRITERIA

| # | Given | When | Then | Verify |
|---|-------|------|------|--------|
| 1 | Research begins | Investigation | APIs for job boards are documented | `.spec/research/job-crawler/apis.md` exists with API docs |
| 2 | Compliance review | Legal research | robots.txt and ToS compliance documented | `.spec/research/job-crawler/compliance.md` exists |
| 3 | Technical options | Architecture analysis | At least 3 implementation approaches compared | `.spec/research/job-crawler/approaches.md` with comparison table |
| 4 | Recommendation | Research complete | Preferred approach with rationale documented | `.spec/research/job-crawler/recommendation.md` exists |

## TEST CRITERIA

Review agents verify ALL test criteria are TRUE before marking task complete.

| # | Boolean Statement | Maps To AC | Verify | Status |
|---|-------------------|------------|--------|--------|
| 1 | API documentation file exists when research completes | AC-1 | `test -f .spec/research/job-crawler/apis.md && echo "exists"` | [ ] TRUE [ ] FALSE |
| 2 | Compliance documentation exists when legal review done | AC-2 | `test -f .spec/research/job-crawler/compliance.md && echo "exists"` | [ ] TRUE [ ] FALSE |
| 3 | Approaches comparison exists when technical analysis done | AC-3 | `grep -q "| Option 1" .spec/research/job-crawler/approaches.md` | [ ] TRUE [ ] FALSE |
| 4 | Recommendation with rationale exists when research finalizes | AC-4 | `grep -q "## Recommendation" .spec/research/job-crawler/recommendation.md` | [ ] TRUE [ ] FALSE |

## GUARDRAILS

### WRITE-ALLOWED
- `.spec/research/job-crawler/` (NEW) - Research documentation directory
- `.spec/research/job-crawler/*.md` (NEW) - Individual research documents

### WRITE-PROHIBITED
- `convex/` - No implementation code (research only)
- Any crawling/scraping code - No implementation in this task

## DESIGN

### References
- Job board APIs: LinkedIn, Indeed, Glassdoor
- Network site APIs: LinkedIn, GitHub Jobs
- Web scraping best practices and legal considerations

### Interaction Notes
- This is research/documentation only (no code implementation)
- Focus on API-based approaches over scraping
- Document rate limits, auth requirements, data fields

### Code Pattern
Research documentation pattern:
```markdown
# Job Board APIs Research

## LinkedIn Jobs API
- Endpoint: ...
- Auth: OAuth 2.0
- Rate limit: ...
- Data fields: ...

## Indeed API
- Endpoint: ...
- Auth: API key
- Rate limit: ...
- Data fields: ...

## Compliance Notes
- robots.txt: ...
- ToS requirements: ...
```

### Anti-pattern (DO NOT)
```markdown
# DON'T: Skip compliance
"We can just scrape Indeed"

# DO: Document all compliance requirements
"Indeed ToS prohibits scraping. Use API instead."
```

## CODING STANDARDS

- Research documentation should follow markdown best practices
- Include code examples for API calls where relevant
- Cite sources for all compliance information

## DEPENDENCIES

No task dependencies.

## REQUIRED READING

1. External research (web search) - Job board APIs
   Focus: Available APIs, auth methods, rate limits

2. External research (web search) - Web scraping compliance
   Focus: robots.txt, ToS, legal precedents

3. `brain/docs/REACT-RULES.md` - Sections: External APIs
   Focus: API integration patterns

## NOTES

- Priority APIs: LinkedIn Jobs, Indeed, Glassdoor, GitHub Jobs
- Alternative: RSS feeds from job boards
- Compliance is critical - document everything
- Consider user-provided credentials for private APIs
- Research should inform future implementation task
- Output: PRD-ready technical specification
