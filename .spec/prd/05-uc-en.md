---
stability: FEATURE_SPEC
last_validated: 2026-04-04
prd_version: 1.0.0
functional_group: EN
---

# Use Cases: Enrichment Network (EN)

## Use Case Summary

| ID | Title | Description |
|----|-------|-------------|
| UC-EN-01 | VC Portfolio Discovery | System discovers companies from VC portfolio websites |
| UC-EN-02 | YC Directory Discovery | System discovers companies from Y Combinator AI directory |
| UC-EN-03 | Vertical AI Discovery | System discovers companies from vertical AI startups directory |
| UC-EN-04 | Multi-Source Orchestration | System orchestrates parallel discovery across multiple sources |

---

## UC-EN-01: VC Portfolio Discovery

**Description:** System discovers AI companies from VC portfolio websites across 5 tiers (TIER1: a16z/Sequoia, TIER2: Benchmark/Index, TIER3: Foundation/USV, TIER4: Amplify/Conviction, TIER5: Seed funds). System scrapes portfolio companies, filters for AI keywords, and extracts metadata including funding round and lead investors.

**Acceptance Criteria:**
- ☐ System discovers companies from TIER1 VC portfolios (a16z, Sequoia)
- ☐ System discovers companies from TIER2 VC portfolios (Benchmark, Index, Greylock)
- ☐ System discovers companies from TIER3 VC portfolios (Foundation, USV, Khosla)
- ☐ System discovers companies from TIER4 VC portfolios (Amplify, Conviction, Spark)
- ☐ System discovers companies from TIER5 VC portfolios (Heavybit, Industry)
- ☐ System filters for AI keywords in company descriptions
- ☐ System classifies company type (AI provider vs AI-first)
- ☐ System extracts funding round from portfolio data
- ☐ System extracts lead investors from portfolio data
- ☐ System handles missing portfolio pages gracefully
- ☐ System respects rate limits on VC websites
- ☐ System logs discovered companies by VC tier

**Edge Cases:**
- VC portfolio page unreachable → log error, continue with other VCs
- No AI companies in portfolio → log zero results, continue
- Portfolio format changes → log parsing error, continue
- Rate limit hit → implement backoff, retry after delay

---

## UC-EN-02: YC Directory Discovery

**Description:** System discovers AI companies from Y Combinator's AI company directory. System filters by batch (W2021 and later), active status, and AI keywords. System extracts batch, description, and company URL for each company.

**Acceptance Criteria:**
- ☐ System scrapes Y Combinator AI directory
- ☐ System filters for batches ≥ W2021
- ☐ System filters for active companies only
- ☐ System filters for AI keywords in description
- ☐ System extracts company batch (W2022, P2023, etc.)
- ☐ System extracts company description
- ☐ System extracts company website URL
- ☐ System classifies company type (AI provider vs AI-first)
- ☐ System handles YC directory pagination
- ☐ System respects YC website rate limits
- ☐ System assigns vc_tier = "YC" to all discovered companies

**Edge Cases:**
- YC directory format changes → log parsing error, attempt adaptation
- No companies match filters → log zero results, suggest filter adjustment
- Pagination incomplete → log warning, continue with available data

---

## UC-EN-03: Vertical AI Discovery

**Description:** System discovers AI companies from vertical AI startups directory for specific industries (healthcare, finance, legal, manufacturing, retail, education, real estate, marketing, sales, HR, operations). System filters by vertical and AI keywords, then classifies company type and extracts metadata.

**Acceptance Criteria:**
- ☐ User can select one or more verticals to discover
- ☐ System discovers companies from verticalaistartups.com
- ☐ System filters by selected vertical(s)
- ☐ System filters for AI keywords in description
- ☐ System classifies company type (AI provider vs AI-first)
- ☐ System extracts vertical classification
- ☐ System extracts employee count when available
- ☐ System extracts company description
- ☐ System extracts company website URL
- ☐ System handles missing vertical data gracefully
- ☐ System assigns vc_tier = "unknown" to vertical discoveries

**Edge Cases:**
- Vertical has no AI companies → log zero results, suggest other verticals
- Vertical directory unreachable → log error, continue with other verticals
- Vertical category ambiguous → log warning, apply best-fit classification

---

## UC-EN-04: Multi-Source Orchestration

**Description:** System orchestrates parallel discovery across multiple sources (VC portfolios, YC directory, vertical AI, exploding topics, industry reports). System manages concurrency, rate limits, and error handling. System aggregates results, deduplicates by URL, and preserves highest-tier VC backing.

**Acceptance Criteria:**
- ☐ System orchestrates discovery across 2+ sources in parallel
- ☐ System implements per-source rate limiting
- ☐ System handles source-specific errors gracefully
- ☐ System aggregates results from all sources
- ☐ System deduplicates companies by website URL
- ☐ System preserves highest-tier VC backing on duplicates
- ☐ System generates source statistics (companies per source)
- ☐ System reports discovery progress by source
- ☐ User can cancel multi-source discovery
- ☐ System handles partial failures (some sources fail)
- ☐ System logs all source successes and failures
- ☐ System returns unified company list

**Edge Cases:**
- All sources fail → return error with diagnostic per source
- One source fails → continue with other sources, log failure
- Deduplication conflict → preserve highest VC tier, log merge
- Rate limit on all sources → implement staggered retries
- User cancels mid-discovery → return partial results, log cancellation
