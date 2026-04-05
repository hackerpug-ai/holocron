---
stability: FEATURE_SPEC
last_validated: 2026-04-04
prd_version: 1.0.0
appetite_weeks: 6
---

# Scope

## Appetite

**6 weeks (full feature with polish)**

This appetite allows for complete feature implementation including:
- Full MCP tool suite (6 tools)
- Specialist agent integration
- Convex database schema and migration
- Network analysis workflow
- Report generation and export
- UI for research management
- Automated signal monitoring

## In Scope

### Discovery & Enrichment
- Multi-source company discovery (VC portfolios, YC, vertical AI, exploding topics, industry reports)
- Parallel enrichment pipeline (10-20 companies per batch)
- Company type classification (AI provider vs AI-first vs hybrid)
- Employee count filtering and size preferences

### Scoring & Analysis
- Personalized fit algorithm (0-110 points across 9 components)
- Dual-track AI_Native scoring (infrastructure vs services)
- Dealbreaker detection and filtering
- Tier classification (TIER1: 90-99, TIER2: 75-89, TIER3: 60-74)
- Score breakdown visualization

### Signal Monitoring
- Automated signal scanning (funding, hiring, headcount, VP hires, enterprise AI, tech stack)
- Signal velocity detection (3+ signals in 30 days)
- Score recalculation with signal boost
- Outreach opportunity alerts

### Network Integration
- LinkedIn connection import and parsing
- Company-connection matching
- Warm path identification
- Outreach message generation

### Storage & Retrieval
- Convex database integration
- Complete research history (companies_researched table)
- High-fit targets (target_companies table)
- Signal tracking (company_signals table)
- Cross-session access

### MCP Tools
- `target_company_discover` - Baseline discovery
- `target_company_enrich` - Deep research enrichment
- `target_company_score` - Personalized scoring
- `target_company_scan_signals` - Signal monitoring
- `target_company_network_match` - Network analysis
- `target_company_generate_report` - Report generation

### Specialist Agent
- Natural language query interface
- Workflow orchestration
- Progress tracking and reporting

### Reporting
- Markdown baseline reports
- Score breakdown tables
- Network analysis summaries
- Outreach recommendations

## Out of Scope

### Initial Release (Defer to Future Cycles)
- [DEFERRED: appetite] Real-time webhooks for signal capture (use scheduled scans instead)
- [DEFERRED: appetite] Multi-user collaboration features
- [DEFERRED: appetite] Advanced analytics dashboards
- [DEFERRED: appetite] Calendar integration for outreach scheduling
- [DEFERRED: appetite] Email campaign automation

### Explicitly Out of Scope
- Company-level CRM features (use existing tools)
- Automated outreach sending (manual review required)
- Interview preparation content (separate system)
- Salary data aggregation (not part of fit scoring)
- Geographic preference filtering (can add later)

## Scope Boundaries

**In Scope / Out of Scope Examples:**

✅ **In Scope**: "Discover AI companies from YC P2026 batch, score them, and identify network connections"

❌ **Out of Scope**: "Send automated outreach emails to all TIER1 companies"

✅ **In Scope**: "Monitor Tasklet for funding signals and alert when detected"

❌ **Out of Scope**: "Track email open rates for outreach campaigns"

✅ **In Scope**: "Generate personalized outreach opener for Conor at Modular"

❌ **Out of Scope**: "Schedule follow-up reminders for outreach"

✅ **In Scope**: "Store all research in Convex for cross-device access"

❌ **Out of Scope**: "Share research reports with external users"
