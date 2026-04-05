---
stability: FEATURE_SPEC
last_validated: 2026-04-04
prd_version: 1.0.0
functional_group: NW
---

# Use Cases: Network & Outreach (NW)

## Use Case Summary

| ID | Title | Description |
|----|-------|-------------|
| UC-NW-01 | LinkedIn Import | System imports and parses LinkedIn connections CSV |
| UC-NW-02 | Company-Connection Matching | System matches companies to user's LinkedIn network |
| UC-NW-03 | Outreach Message Generation | System generates personalized outreach messages |

---

## UC-NW-01: LinkedIn Import

**Description:** System imports LinkedIn connections from CSV export file. System parses connection data including name, company, position, email, and connection date. System validates data format and stores connections in network database for matching against target companies.

**Acceptance Criteria:**
- ☐ User can upload LinkedIn connections CSV file
- ☐ System validates CSV format (required columns: First Name, Last Name, Company, Position, Connected On)
- ☐ System parses connection records from CSV
- ☐ System extracts email addresses when available
- ☐ System extracts LinkedIn profile URLs when available
- ☐ System handles missing data gracefully (null for optional fields)
- ☐ System stores connections in network database
- ☐ System deduplicates connections by name + company
- ☐ System reports import success with record count
- ☐ System reports import errors with specific line numbers
- ☐ User can re-import to refresh connection data

**Edge Cases:**
- CSV format invalid → return error with format specification
- Empty CSV file → return error, no import attempted
- Duplicate connections → keep most recent connection date
- Missing required columns → return error listing missing columns
- Malformed CSV rows → skip row, log error, continue import
- Email address missing → set to null, continue import
- Special characters in names/positions → preserve unicode, continue import

---

## UC-NW-02: Company-Connection Matching

**Description:** System matches target companies to user's LinkedIn connections. System identifies warm paths by matching company names and domains against connection records. System calculates connection strength based on recency, seniority, and relationship context.

**Acceptance Criteria:**
- ☐ User can trigger network matching for target companies
- ☐ System matches by company name (exact match)
- ☐ System matches by website domain (extract domain, match against connection company domain)
- ☐ System matches by parent company (known subsidiaries, acquisitions)
- ☐ System calculates connection strength score (0-10)
- ☐ Connection strength includes: recency (+3 for <6mo, +2 for 6-12mo, +1 for 1-2yr)
- ☐ Connection strength includes: seniority (+3 for C-level, +2 for VP/Director, +1 for Manager/Lead)
- ☐ Connection strength includes: work context (+2 for former colleague, +1 for shared industry)
- ☐ System flags strong warm paths (strength ≥ 7)
- ☐ System displays matched connections per company
- ☐ System displays connection count and strength distribution
- ☐ User can filter by connection strength threshold

**Edge Cases:**
- No connections found for company → display "No network connections", continue
- Company name ambiguous (multiple matches) → show all matches, label strength
- Connection data incomplete → score based on available data, flag as partial
- Former company vs current company → prioritize current, include former as secondary
- Multiple connections at same company → aggregate scores, show all connections

---

## UC-NW-03: Outreach Message Generation

**Description:** System generates personalized outreach messages for target companies. System incorporates user background, company research, and connection context. System produces warm intros (when connection exists) and cold outreach (when no connection). User can review and edit before sending.

**Acceptance Criteria:**
- ☐ User can generate outreach for individual company
- ☐ User can generate outreach for batch of companies
- ☐ System incorporates user background (AI consulting, technical expertise)
- ☐ System incorporates company research (product, recent signals, team)
- ☐ System incorporates connection context (when warm path exists)
- ☐ System generates warm intro format (connection reference, mutual context)
- ☐ System generates cold outreach format (specific company insight, value proposition)
- ☐ System avoids generic flattery and sales language
- ☐ System includes specific reference to company product or recent news
- ☐ System includes low-pressure close (curiosity-based, not ask-heavy)
- ☐ User can edit generated message before finalizing
- ☐ User can regenerate message with different tone (casual, formal, technical)
- ☐ System formats message for LinkedIn message character limit
- ☐ System formats message for email (subject line + body)

**Edge Cases:**
- No company research available → use basic company info, flag as needs research
- No user background available → use generic technical profile, recommend profile update
- Warm connection with weak strength → mention connection cautiously, acknowledge loose tie
- Company with recent negative news → avoid referencing, focus on product/market
- Multiple warm connections → select strongest, offer option to choose different connection
- User dislikes generated message → offer regeneration with tone adjustment
