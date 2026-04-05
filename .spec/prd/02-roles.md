---
stability: PRODUCT_CONTEXT
last_validated: 2026-04-04
prd_version: 1.0.0
---

# Roles

## User Roles

| Role | Description |
|------|-------------|
| **Primary User** | Career-oriented professional seeking AI company opportunities. Uses research for job search, career planning, and partnership evaluation. Values personalized scoring and network-aware recommendations. |
| **System** | Holocron backend processes including signal scanning, score recalculation, and automated monitoring tasks. |

## Role Definitions

### Primary User

**Profile:**
- Technical background (software engineering, AI/ML)
- Actively managing career development
- Seeks roles at AI-native companies (infrastructure or services)
- Values engineering culture and technical leverage
- Has existing professional network (1,000+ LinkedIn connections)

**Goals:**
- Identify high-fit AI companies efficiently
- Leverage network connections for warm intros
- Stay informed about market signals and opportunities
- Access research from any device
- Track companies over time without manual effort

**Pain Points:**
- Manual research across scattered sources is time-consuming
- Missed signal opportunities (funding, hiring) due to lack of monitoring
- Network connections underutilized for warm intros
- Local-only workflow limits accessibility
- No persistent scoring history for comparison

**Key Behaviors:**
- Runs baseline discovery when starting new job search
- Checks signal scan results weekly
- Queries network connections for target companies
- Generates reports for interview preparation
- Re-scores companies when priorities change

**Success Criteria:**
- Reduces research time by 80% (from hours to minutes)
- Captures >90% of relevant signals within 48 hours
- Identifies warm path for >30% of TIER1 targets
- Accesses research seamlessly across devices
- Maintains continuous intelligence without manual effort

### System

**Profile:**
- Automated holocron backend processes
- Scheduled tasks and triggers
- Signal scanning workflows
- Score recalculation pipelines

**Goals:**
- Execute scheduled signal scans reliably
- Maintain data consistency across Convex tables
- Process enrichment and scoring batches efficiently
- Generate timely alerts for velocity events

**Pain Points:**
- Rate limiting on external APIs (VC sites, LinkedIn)
- Large batch processing timeouts
- Database connection pool management
- Error handling for failed enrichment/scoring

**Key Behaviors:**
- Daily signal scan on companies_researched watchlist
- Weekly score recalculation with signal decay
- Monthly database cleanup and archival
- Automated report generation

**Success Criteria:**
- 99.9% uptime for scheduled tasks
- <5 minute latency for signal capture
- Zero data loss in batch processing
- Graceful degradation when external APIs fail
