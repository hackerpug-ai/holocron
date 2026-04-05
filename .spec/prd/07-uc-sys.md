---
stability: FEATURE_SPEC
last_validated: 2026-04-04
prd_version: 1.0.0
functional_group: SYS
---

# Use Cases: System Management (SYS)

## Use Case Summary

| ID | Title | Description |
|----|-------|-------------|
| UC-SYS-01 | Convex Storage | System stores and retrieves research data in Convex database |
| UC-SYS-02 | Report Generation | System generates markdown reports from research data |

---

## UC-SYS-01: Convex Storage

**Description:** System stores all research data in Convex cloud database for cross-session access and persistence. System manages companies_researched (complete history), company_signals (signal tracking), and target_companies (high-fit targets only). System handles concurrent access, data validation, and transaction safety.

**Acceptance Criteria:**
- ☐ System stores complete company research in companies_researched table
- ☐ System stores all discovered companies (not just high-fit) in companies_researched
- ☐ System stores component scores (AI_Native, Technical_Leverage, Stage, Size, Culture, Growth_Model, Team, Founder_VC, Signal)
- ☐ System stores total fit_score and tier classification
- ☐ System stores dealbreaker_flags for companies with disqualifying factors
- ☐ System stores signal history in company_signals table
- ☐ System links signals to companies via company_website foreign key
- ☐ System stores high-fit targets only (fit_score ≥ 66) in target_companies table
- ☐ System validates unique constraint on website URL for companies
- ☐ System handles database conflicts with retry logic (3 attempts)
- ☐ System updates existing records on re-scoring (INSERT OR REPLACE)
- ☐ System timestamps all records with research_date and last_updated
- ☐ System indexes queries by fit_score, tier, vc_tier, company_type
- ☐ System supports cross-device access via Convex cloud backend
- ☐ System handles offline mode with local cache fallback

**Edge Cases:**
- Database connection unavailable → queue writes, retry when connection restored
- Unique constraint violation (duplicate website) → UPDATE existing record, log merge
- Partial record write (missing fields) → validate required fields, reject incomplete records
- Concurrent write conflicts → implement retry with exponential backoff
- Large batch operations (>100 companies) → chunk into transactions, report progress
- Database migration required → run migration before new feature deployment

---

## UC-SYS-02: Report Generation

**Description:** System generates markdown reports from research data for documentation and sharing. Reports include baseline discovery results, score breakdowns, network analysis, and outreach recommendations. System formats reports consistently and supports export to file.

**Acceptance Criteria:**
- ☐ User can generate baseline discovery report
- ☐ Baseline report includes: summary statistics, tier distribution, source breakdown
- ☐ Baseline report lists all companies by tier with scores
- ☐ User can generate score breakdown report for specific company
- ☐ Score breakdown includes: all 9 component scores with labels
- ☐ Score breakdown highlights: strengths (≥80% of max), weaknesses (<50% of max)
- ☐ User can generate network analysis report
- ☐ Network report includes: warm path connections, connection strength scores
- ☐ User can generate outreach recommendations report
- ☐ Outreach report includes: prioritized targets, optimal timing, message openers
- ☐ User can generate signal scan report
- ☐ Signal report includes: new signals, velocity alerts, urgent opportunities
- ☐ System formats all reports as markdown
- ☐ System includes generation timestamp on all reports
- ☐ User can save reports to file system
- ☐ User can export reports as PDF
- ☐ System supports custom report templates

**Edge Cases:**
- No data available for report type → return empty report with message
- Large report (>1000 companies) → paginate, offer summary view
- Report generation timeout (>30 seconds) → return partial report with warning
- Missing score components → display "N/A" for missing data, explain why
- Network data not imported → skip network section, recommend LinkedIn import
- Stale data (>30 days old) → display warning with last updated date
