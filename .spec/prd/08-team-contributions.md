---
stability: FEATURE_SPEC
last_validated: 2026-04-04
prd_version: 1.0.0
---

# Team Contributions

## Phase Outputs

### Phase 1: User Personas (ui-designer + product-manager)

**Outputs:**
- Primary User persona: Technical background, actively managing career development, seeks AI-native roles, values engineering culture and technical leverage
- User goals: Identify high-fit AI companies efficiently, leverage network connections, stay informed about signals, access research cross-device, track companies continuously
- User pain points: Manual research time-consuming, missed signal opportunities, network connections underutilized, local-only workflow, no persistent scoring history
- Success criteria: Reduce research time 80%, capture >90% signals within 48hr, identify warm path for >30% TIER1 targets

### Phase 2: Architecture (product-manager + engineering-manager)

**Functional Requirements:**
- Multi-source company discovery (VC portfolios, YC, vertical AI, exploding topics, industry reports)
- Parallel enrichment pipeline (10-20 companies per batch)
- Personalized fit scoring (0-110 points across 9 components)
- Tier classification (TIER1: 90-99, TIER2: 75-89, TIER3: 60-74)
- Automated signal monitoring (funding, hiring, headcount, VP hires, enterprise AI, tech stack)
- LinkedIn network integration (import, matching, warm path scoring)
- Convex cloud storage (cross-session access, complete history)
- MCP tools for generation and retrieval
- Specialist agent for workflow orchestration
- Markdown report generation

**System Components:**
- Discovery Service: Multi-source company discovery orchestration
- Enrichment Service: Parallel deep research batches
- Scoring Service: Personalized fit algorithm application
- Signal Service: Automated monitoring and velocity detection
- Network Service: LinkedIn import and connection matching
- Storage Service: Convex database operations
- Reporting Service: Markdown report generation

**Data Entities:**
- companies_researched: Complete research history
- company_signals: Signal tracking over time
- target_companies: High-fit targets only
- network_connections: LinkedIn connections

**API Design:**
- MCP tools for holocron integration
- Convex queries for data access
- REST endpoints for web UI (future)

**External Dependencies:**
- VC portfolio websites (scraping)
- Y Combinator directory (scraping)
- Vertical AI Startups (scraping)
- Exploding Topics (scraping)
- LinkedIn (CSV export, future API)
- Convex (cloud database)

### Phase 3: UI Infrastructure (engineering-manager + ui-designer)

**Outputs:**
- Design libraries: None specified (CLI-first, future web UI)
- Style tokens: Not applicable (markdown reports)
- Component reuse: Report templates, scoring algorithms, signal detectors
- UI constraints: Markdown output format, character limits for LinkedIn messages

### Phase 4: Holdout Scenarios (product-manager)

See [10-holdout-scenarios.md](10-holdout-scenarios.md) for detailed hidden scenarios.

## Functional Group Contributions

### Discovery & Scoring (DS)
- product-manager: Defined user workflows for discovery and scoring
- engineering-manager: Designed parallel enrichment architecture, scoring algorithm
- ui-designer: Specified score breakdown visualization, filtering UI requirements

### Enrichment Network (EN)
- product-manager: Defined multi-source discovery requirements
- engineering-manager: Designed rate limiting, error handling, deduplication logic
- ui-designer: Specified progress reporting for long-running operations

### Network & Outreach (NW)
- product-manager: Defined warm path identification requirements
- engineering-manager: Designed LinkedIn import, connection matching algorithms
- ui-designer: Specified outreach message templates, tone options

### System Management (SYS)
- product-manager: Defined cross-session access requirements
- engineering-manager: Designed Convex schema, migration strategy
- ui-designer: Specified report formatting, export options

## Acceptance Criteria Coverage

All 15 use cases include comprehensive acceptance criteria following format:
☐ {WHO} can {ACTION} {CONTEXT}

Total acceptance criteria: 207 across all use cases

## Technical Feasibility

All requirements validated as feasible within 6-week appetite:
- MCP tool specification: Standard Convex patterns
- Specialist agent: Reuses existing agent patterns from holocron
- Database schema: Straightforward relational design
- Scraping sources: All publicly accessible, rate limits manageable
- Scoring algorithm: Well-defined from existing local skill
- Report generation: Markdown formatting, straightforward

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| VC website format changes | Medium | Robust error handling, graceful degradation |
| Rate limiting on external sources | Medium | Exponential backoff, staggered requests |
| Convex deployment complexity | Low | Well-documented platform, existing holocron infrastructure |
| LinkedIn API limitations | Low | CSV import fallback, no dependency on real-time API |
| Large dataset performance | Low | Convex indexing, chunked operations |

## Next Steps

1. Implement MCP tools (6 tools)
2. Implement specialist agent workflow
3. Implement Convex schema and migration
4. Implement scraping services for each source
5. Implement scoring and signal detection
6. Implement network integration
7. Implement report generation
8. End-to-end testing with holdout scenarios
9. Deployment to holocron production
