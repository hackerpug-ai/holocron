---
stability: FEATURE_SPEC
last_validated: 2026-04-04
prd_version: 1.0.0
---

# Holdout Scenarios

**Purpose**: These scenarios test edge cases and hidden requirements not covered by visible acceptance criteria. They prevent agent gaming by testing behavior beyond explicit AC validation.

**Format**: Plain English BDD scenarios (not GIVEN/WHEN/THEN to avoid pattern matching). Each scenario includes a hidden validation criterion.

---

## Discovery & Scoring (DS)

### UC-DS-01: Baseline Discovery

**Scenario 1**: User initiates baseline discovery but all external sources are simultaneously down (VC sites returning 500, YC directory unreachable, vertical AI site timing out). System should gracefully degrade and return a helpful error message explaining which sources failed and suggesting retry options, rather than hanging or crashing.

*Hidden criterion*: Error messages must be specific to source, not generic "discovery failed"

**Scenario 2**: User discovers 200 companies but 15 of them have identical website URLs due to data entry errors in source systems. System should deduplicate by URL while preserving the highest-tier VC backing, and log the merge with count of duplicates removed.

*Hidden criterion*: Deduplication must preserve highest VC tier, not first-seen

**Scenario 3**: User sets employee count filter to "10-50" but many discovered companies have null employee_count values. System should exclude null values from filtered results and display a warning explaining how many companies were excluded due to missing data.

*Hidden criterion*: Missing filter data must exclude, not include by default

**Scenario 4**: User initiates discovery with limit=200 but sources return 502 valid companies after deduplication. System should return all 502 companies rather than truncating to 200, as the limit is a minimum target not a maximum cap.

*Hidden criterion*: Limit parameter is minimum target, not maximum cap

### UC-DS-02: Parallel Enrichment

**Scenario 5**: During enrichment of 20 companies, 3 companies timeout after 30 seconds each. System should mark these as needs_manual_review=1, continue with remaining 17 companies, and return partial results with specific callout about which companies failed enrichment.

*Hidden criterion*: Timeouts must not block batch completion; partial results returned

**Scenario 6**: System fetches employee count from LinkedIn but hits rate limit after 8 companies. System should implement exponential backoff (wait 30s, retry), log the rate limit, and continue enrichment rather than failing the entire batch.

*Hidden criterion*: Rate limits trigger backoff, not batch failure

**Scenario 7**: Company website returns 404 during enrichment. System should attempt LinkedIn as fallback, and if that also fails, set needs_manual_review=1 with reason "website_unreachable" and continue with other companies.

*Hidden criterion*: Multiple fallback attempts before marking for manual review

### UC-DS-03: Personalized Scoring

**Scenario 8**: Company scores 18/20 on AI_Native (perfect for Track 1: AI infrastructure) but user has explicitly indicated preference for Track 2: AI-first services in their profile. System should apply a context penalty rather than raw score, reflecting misalignment with user preference.

*Hidden criterion*: User preferences override raw component scores

**Scenario 9**: Company has all component scores as null (missing data). System should assign fit_score=0, tier='SKIP', and dealbreaker_flags='missing_all_data' rather than leaving scores undefined.

*Hidden criterion*: Complete missing data triggers explicit dealbreaker, not neutral score

**Scenario 10**: Company scores 95 points (TIER1) but has culture_score=4 (<7 dealbreaker). System should override tier to 'SKIP' with dealbreaker_flags='culture_below_threshold' and log the override for audit trail.

*Hidden criterion*: Dealbreakers override high scores, tier assignment respects dealbreakers

### UC-DS-04: Tier Classification

**Scenario 11**: Company scores exactly 90 points (at TIER1 threshold). System should classify as TIER1, not TIER2, applying "round up" logic for boundary cases.

*Hidden criterion*: Boundary scores round up to higher tier

**Scenario 12**: All 50 discovered companies score <60 points (all SKIP). System should log an anomaly warning suggesting filter adjustment and return empty TIER1/TIER2/TIER3 lists rather than all companies in SKIP tier.

*Hidden criterion*: All-SKIP results trigger anomaly warning, not silent empty results

### UC-DS-05: Score Breakdown Display

**Scenario 13**: User views score breakdown for company with missing Technical_Leverage score. System should display "N/A" for that component with tooltip explaining "Data not available - company website lacked technical signals", rather than showing 0 or blank.

*Hidden criterion*: Missing scores show N/A with explanation, not 0 or blank

**Scenario 14**: User compares 5 companies side-by-side but 2 companies have no score data (not yet scored). System should display "Not scored - requires enrichment" with action button to trigger scoring, rather than excluding from comparison or showing zeros.

*Hidden criterion*: Unscored companies show actionable state, not zeros or exclusion

### UC-DS-06: Discovery Filtering

**Scenario 15**: User applies filter "employee_count: 10-50 AND stage: Series A" but no companies match both criteria. System should display warning "No companies match combined filters - try relaxing one filter" and show counts for each individual filter to help user adjust.

*Hidden criterion*: Empty filter results show helpful guidance, not generic "no results"

**Scenario 16**: User applies filter "company_type: provider" but 30% of discovered companies have company_type=null. System should exclude these from filtered results and show "Excluded 45 companies with missing company_type from results".

*Hidden criterion*: Missing filter data excludes with explanation, not silent exclusion

---

## Enrichment Network (EN)

### UC-EN-01: VC Portfolio Discovery

**Scenario 17**: System scrapes a16z portfolio but website structure changed since last scrape. System should log parsing error with specific field that failed, attempt to extract company names using fallback patterns, and continue with other VCs.

*Hidden criterion*: Structured changes trigger fallback patterns, not VC skip

**Scenario 18**: VC portfolio page has 50 companies but only 3 are AI-related. System should return only 3 AI companies with note "Filtered 47 non-AI companies from [VC NAME] portfolio" rather than all 50.

*Hidden criterion*: AI filtering applies at scrape time, not post-scrape

**Scenario 19**: System hits rate limit on Sequoia portfolio after 12 companies. System should implement backoff (wait 60s), log rate limit, and retry rather than skipping remaining Sequoia companies.

*Hidden criterion*: Rate limits trigger retry with backoff, not source skip

### UC-EN-02: YC Directory Discovery

**Scenario 20**: YC directory returns 400 companies but 150 have batch < W2021. System should filter out old batches, return 250 companies, and log "Filtered 150 companies from pre-W2021 batches".

*Hidden criterion*: Batch filtering applies server-side if possible, not client-side

**Scenario 21**: YC directory pagination is incomplete (missing page 3 of 5). System should log warning, scrape available pages (1,2,4,5), and note "Incomplete pagination - may have missed companies on page 3" in results.

*Hidden criterion*: Pagination gaps log warning but continue with available data

### UC-EN-03: Vertical AI Discovery

**Scenario 22**: User selects "healthcare" vertical but no AI companies exist in that vertical category. System should return 0 companies with message "No AI companies found in healthcare vertical - try finance, legal, or manufacturing" rather than empty list.

*Hidden criterion*: Empty vertical results suggest alternatives, not silent failure

**Scenario 23**: Company appears in both "healthcare" and "fintech" verticals (ambiguous classification). System should log warning, apply to both verticals with flag "ambiguous_vertical", and let user decide during filtering.

*Hidden criterion*: Ambiguous classifications log warning and apply to both categories

### UC-EN-04: Multi-Source Orchestration

**Scenario 24**: User initiates discovery across 5 sources but 2 sources fail completely (500 errors), 3 sources succeed. System should return results from 3 successful sources with summary "5 sources attempted, 3 succeeded, 2 failed: [failed sources listed]" and continue with available data.

*Hidden criterion*: Partial source failures return available data with diagnostic summary

**Scenario 25**: During deduplication, Company A appears from VC (tier=TIER1) and YC (tier=YC). System should preserve vc_tier="TIER1" (higher tier) and log "Merged duplicate entries for [Company A], preserved TIER1 backing".

*Hidden criterion*: Duplicate merges preserve highest tier, log merge for audit

**Scenario 26**: User cancels discovery mid-process (after 3 of 5 sources complete). System should return partial results from 3 completed sources with note "Discovery cancelled by user - partial results from 3 of 5 sources" and save progress for resume.

*Hidden criterion*: Cancellation returns partial results with resume capability

---

## Network & Outreach (NW)

### UC-NW-01: LinkedIn Import

**Scenario 27**: User uploads CSV with 1,042 connections but 15 rows have malformed data (missing First Name, invalid email format). System should skip 15 bad rows, import 1,027 valid connections, and return "Imported 1,027 connections, skipped 15 invalid rows (lines 45, 67, 89...)".

*Hidden criterion*: Partial imports succeed with specific error row count

**Scenario 28**: CSV file has duplicate connections (same person listed twice from different exports). System should deduplicate by name+company, keep most recent Connected On date, and log "Removed 23 duplicate connections during import".

*Hidden criterion*: Duplicate detection merges and keeps most recent, logs removal count

### UC-NW-02: Company-Connection Matching

**Scenario 29**: User matches network for "Anthropic" but LinkedIn connections show company as "Anthropic, PBC" (slightly different name). System should use fuzzy matching to identify connection, display match with confidence score, and flag "fuzzy_match" for user review.

*Hidden criterion*: Company names use fuzzy matching with confidence scoring

**Scenario 30**: User has 3 connections at target company: 1 current (strength 8), 2 former (strength 3, 4). System should prioritize current connection in warm path display but show all 3 with clear current/former labels.

*Hidden criterion*: Current connections prioritized but former shown with labels

### UC-NW-03: Outreach Message Generation

**Scenario 31**: System generates outreach but company has no recent news or signals (stale research data). System should still generate message but use generic company insight and flag "stale_data - recommend refresh before sending".

*Hidden criterion*: Stale data generates message with warning flag, not failure

**Scenario 32**: User has warm path but connection strength is low (3/10 - weak tie). System should generate cautious warm intro mentioning "loose connection" rather than strong endorsement, and note "Weak tie - consider alternative approach".

*Hidden criterion*: Low-strength connections generate cautious message language

**Scenario 33**: User dislikes generated message and requests regeneration. System should offer 3 tone variations (casual, formal, technical) rather than regenerating same tone, and explain difference between options.

*Hidden criterion*: Regeneration offers explicit choices, not blind retry

---

## System Management (SYS)

### UC-SYS-01: Convex Storage

**Scenario 34**: During batch write of 50 companies, Convex connection drops after 23 companies. System should queue remaining 27 writes, retry connection every 30 seconds for up to 5 minutes, log "Connection interrupted - retrying write for 27 companies", and resume without losing data.

*Hidden criterion*: Connection interruptions trigger queue+retry, not data loss

**Scenario 35**: User triggers re-scoring for company that already exists in database. System should UPDATE existing record (INSERT OR REPLACE) preserving research_date but updating last_updated, and log "Updated scores for [Company], original research_date preserved".

*Hidden criterion*: Re-scoring updates scores but preserves original research_date

**Scenario 36**: Database migration adds new column (prestige_boost) to existing table with 500 rows. System should set default value for existing rows, apply new schema to new rows, and log "Migration complete: 500 existing rows set to default for prestige_boost".

*Hidden criterion*: Migrations handle existing rows with defaults, not schema-only changes

### UC-SYS-02: Report Generation

**Scenario 37**: User generates baseline report but has 0 companies in database. System should generate report with empty sections, clear message "No companies discovered yet - run baseline discovery first", and link to discovery action.

*Hidden criterion*: Empty reports show actionable next step, not error

**Scenario 38**: User generates report for 1,200 companies (very large dataset). System should paginate report (50 companies per page), offer summary view with statistics, and warn "Large dataset - showing first 50 of 1,200 companies. Use filters or export for full list."

*Hidden criterion*: Large reports paginate with summary, not attempt full rendering

**Scenario 39**: Report generation takes 45 seconds (exceeds 30s timeout). System should return partial report with timeout warning "Report generation incomplete - showing partial results. Retry for full report." and cache partial for resume.

*Hidden criterion*: Timeouts return partial with warning and resume capability

---

## Cross-Cutting Scenarios

### Scenario 40: New User Onboarding
First-time user has no LinkedIn connections imported, no companies discovered, no profile set. System should guide through setup flow: (1) prompt profile setup, (2) offer LinkedIn import, (3) suggest baseline discovery, rather than showing empty dashboards with no guidance.

*Hidden criterion*: Empty state triggers guided onboarding flow, not silent empty UI

### Scenario 41: Data Staleness
User views company last researched 90 days ago (signal_score decayed). System should display warning "Research data 90 days old - scores may be outdated. Recommend re-enrichment for current signals." and offer one-click refresh action.

*Hidden criterion*: Stale data shows warning with one-click refresh, not silent outdated scores

### Scenario 42: Concurrent User Actions
User triggers baseline discovery (long-running) and immediately requests score breakdown for specific company. System should handle discovery in background, return score breakdown immediately from existing data, and show progress indicator for discovery in background.

*Hidden criterion*: Long-running operations background without blocking quick actions

### Scenario 43: Malformed User Input
User enters website URL as "anthropic dot com" (invalid format). System should validate URL format, return specific error "Invalid URL format. Use format: https://example.com", and suggest correction rather than failing with generic error.

*Hidden criterion*: Input validation returns specific error with suggestion, not generic failure

### Scenario 44: Feature Flag Testing
New feature "signal velocity alerts" is flagged as beta. System should allow opt-in beta access, show "beta" label on feature, and collect usage feedback rather than hiding or enabling without consent.

*Hidden criterion*: Beta features require opt-in with clear labeling and feedback collection

---

## Summary

**Total Scenarios**: 44
**Validation Coverage**:
- 15 use cases × 3-4 scenarios each = comprehensive edge case coverage
- Cross-cutting scenarios test systemic behaviors
- Hidden criteria prevent agent gaming of AC validation

**Testing Priority**:
1. Critical: Scenarios 1, 5, 8, 10, 11, 24, 34, 40 (dealbreakers, data loss, onboarding)
2. High: Scenarios 2, 3, 6, 9, 17, 25, 31, 35, 41 (deduplication, rate limits, staleness)
3. Medium: All other scenarios (edge cases, error handling, UX polish)
