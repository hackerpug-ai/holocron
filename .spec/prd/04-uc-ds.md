---
stability: FEATURE_SPEC
last_validated: 2026-04-04
prd_version: 1.0.0
functional_group: DS
---

# Use Cases: Discovery & Scoring (DS)

## Use Case Summary

| ID | Title | Description |
|----|-------|-------------|
| UC-DS-01 | Baseline Discovery | User discovers AI companies from multiple sources in baseline crawl |
| UC-DS-02 | Parallel Enrichment | System enriches company data in parallel batches |
| UC-DS-03 | Personalized Scoring | User scores companies using personalized fit algorithm |
| UC-DS-04 | Tier Classification | System classifies companies into TIER1/TIER2/TIER3 based on fit score |
| UC-DS-05 | Score Breakdown Display | User views component scores for each company |
| UC-DS-06 | Discovery Filtering | User filters discovery results by size, stage, and company type |

---

## UC-DS-01: Baseline Discovery

**Description:** User initiates a baseline discovery crawl to discover AI companies from multiple sources including VC portfolios, Y Combinator directory, vertical AI startups, exploding topics, and industry reports. System aggregates companies from all sources, deduplicates by website URL, and returns a comprehensive list for enrichment.

**Acceptance Criteria:**
- ☐ User can initiate baseline discovery with source selection (vc, yc, vertical, exploding, reports, all)
- ☐ System discovers companies from each selected source in parallel
- ☐ System deduplicates companies by website URL
- ☐ System preserves highest-tier VC backing when duplicates found
- ☐ User can set discovery limit (default: 200 companies)
- ☐ User can filter by company type (provider, first, hybrid, all)
- ☐ User can filter by employee count range (10-50, 51-100, 101-200, all)
- ☐ System returns discovered company count by source
- ☐ System handles API rate limiting gracefully
- ☐ User can cancel discovery in progress

**Edge Cases:**
- Source returns zero companies → continue with other sources, log warning
- Source API fails → log error, continue with other sources
- All sources fail → return error with diagnostic information
- Duplicate detection conflict → preserve highest VC tier, log merge

---

## UC-DS-02: Parallel Enrichment

**Description:** System enriches discovered company data in parallel batches of 10-20 companies. For each company, system fetches deep research including employee count, funding details, technical signals, culture indicators, and growth metrics. System manages external API rate limits and retry logic for failed enrichments.

**Acceptance Criteria:**
- ☐ System processes enrichment in parallel batches of 10-20 companies
- ☐ System fetches employee count from company website or LinkedIn
- ☐ System fetches funding details (round, amount, date, investors)
- ☐ System extracts technical signals (tech stack, AI capabilities)
- ☐ System extracts culture indicators (values, engineering practices)
- ☐ System extracts growth metrics (headcount trends, hiring signals)
- ☐ System implements exponential backoff for rate limits
- ☐ System retries failed enrichments up to 3 times
- ☐ System reports enrichment progress (current/total)
- ☐ System handles timeout for unresponsive companies
- ☐ System logs partial enrichment data when possible

**Edge Cases:**
- Company website unreachable → mark as needs_manual_review, continue
- LinkedIn rate limit → implement backoff, retry after delay
- Employee count not found → set to null, continue with other data
- All enrichments in batch fail → log error, offer retry option

---

## UC-DS-03: Personalized Scoring

**Description:** User scores enriched companies using personalized fit algorithm across 9 components: AI_Native (0-20), Technical_Leverage (0-15), Stage (0-15), Company_Size (0-10), Culture (0-20), Growth_Model (0-10), Team (0-10), Founder_VC (0-5), Signal (0-5). System calculates total fit score (0-110 maximum) and applies dealbreaker filters.

**Acceptance Criteria:**
- ☐ User can score individual companies or batches
- ☐ System applies AI_Native scoring (Track 1: providers, Track 2: services)
- ☐ System applies Technical_Leverage scoring (0-15 points)
- ☐ System applies Stage scoring (Series A optimal: 15, Series C+: 8)
- ☐ System applies Company_Size scoring (10-50 employees: 10, >200: 0)
- ☐ System applies Culture scoring (0-20 points)
- ☐ System applies Growth_Model scoring (0-10 points)
- ☐ System applies Team scoring (0-10 points)
- ☐ System applies Founder_VC scoring (0-5 points)
- ☐ System applies Signal scoring (0-5 points)
- ☐ System calculates total fit score (sum of components)
- ☐ System flags dealbreakers (Culture <7, AI_Native <5, Size >200)
- ☐ System displays score breakdown by component
- ☐ User can adjust scoring weights
- ☐ User can exclude specific components from scoring

**Edge Cases:**
- Missing data for component → assign 0 or neutral score, flag for review
- All components score zero → return 0, log anomaly
- Dealbreaker detected → flag company, exclude from TIER1
- Score exceeds 110 → cap at 110, log anomaly

---

## UC-DS-04: Tier Classification

**Description:** System classifies scored companies into tiers based on fit score: TIER1 (90-99 points), TIER2 (75-89 points), TIER3 (60-74 points), SKIP (<60 points). System applies dealbreaker overrides and generates tier statistics.

**Acceptance Criteria:**
- ☐ System classifies companies with fit_score ≥90 as TIER1
- ☐ System classifies companies with fit_score 75-89 as TIER2
- ☐ System classifies companies with fit_score 60-74 as TIER3
- ☐ System flags companies with fit_score <60 as SKIP
- ☐ System overrides tier to SKIP if dealbreaker detected
- ☐ System generates tier count statistics
- ☐ System generates tier percentage distribution
- ☐ User can filter companies by tier
- ☐ User can adjust tier thresholds
- ☐ System logs tier changes for version tracking

**Edge Cases:**
- Fit score exactly at threshold (90, 75, 60) → include in higher tier
- Dealbreaker on high-scoring company → override to SKIP, log override
- All companies score as SKIP → log anomaly, suggest filter adjustment

---

## UC-DS-05: Score Breakdown Display

**Description:** User views detailed score breakdown for each company showing component scores, tier classification, and dealbreaker flags. User can compare companies side-by-side and identify scoring gaps.

**Acceptance Criteria:**
- ☐ User can view score breakdown for individual company
- ☐ System displays all 9 component scores with labels
- ☐ System highlights strengths (scores ≥80% of max)
- ☐ System highlights weaknesses (scores <50% of max)
- ☐ System displays dealbreaker flags with reasons
- ☐ User can compare 2-5 companies side-by-side
- ☐ System sorts comparison table by any component
- ☐ User can export score breakdown as CSV
- ☐ System displays tier classification prominently
- ☐ System displays VC backing information
- ☐ System displays research date and last updated

**Edge Cases:**
- Company has no score data → display "Not scored", offer scoring action
- Component score missing → display "N/A", explain missing data
- All components flagged as weakness → suggest dealbreaker review

---

## UC-DS-06: Discovery Filtering

**Description:** User filters discovery results by employee count, funding stage, and company type to narrow target list. System applies filters before enrichment to focus research on highest-potential companies.

**Acceptance Criteria:**
- ☐ User can filter by employee count range (10-50, 51-100, 101-200, all)
- ☐ User can filter by funding stage (Seed, Series A, Series B, Series C+, all)
- ☐ User can filter by company type (provider, first, hybrid, all)
- ☐ System applies filters before enrichment
- ☐ System displays filtered company count
- ☐ System displays filter criteria in results
- ☐ User can combine multiple filters
- ☐ User can clear all filters
- ☐ System persists filter preferences across sessions
- ☐ System warns if filters exclude all companies
- ☐ User can save filter presets

**Edge Cases:**
- Filter excludes all companies → display warning, suggest adjustment
- Conflicting filter combinations → apply AND logic, display results
- Missing filter data (e.g., no employee count) → exclude from filtered results
