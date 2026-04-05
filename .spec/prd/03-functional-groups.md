---
stability: FEATURE_SPEC
last_validated: 2026-04-04
prd_version: 1.0.0
---

# Functional Groups

## Group Overview

| Group | Prefix | Description | Use Cases |
|-------|--------|-------------|-----------|
| Discovery & Scoring | DS | Company discovery, enrichment, and personalized scoring | 6 |
| Enrichment Network | EN | External data sources and research workflows | 4 |
| Network & Outreach | NW | LinkedIn network analysis and warm path identification | 3 |
| System Management | SYS | Storage, retrieval, and reporting infrastructure | 2 |

## Use Case Summary

| Group | Count | Use Cases |
|-------|-------|-----------|
| DS | 6 | UC-DS-01 through UC-DS-06 |
| EN | 4 | UC-EN-01 through UC-EN-04 |
| NW | 3 | UC-NW-01 through UC-NW-03 |
| SYS | 2 | UC-SYS-01 through UC-SYS-02 |
| **Total** | **15** | |

## Group Descriptions

### Discovery & Scoring (DS)

Delivers core company discovery and scoring functionality. Primary user interacts with this group to discover AI companies from multiple sources, enrich company data with deep research, and apply personalized fit scoring.

**Key Workflows:**
- Baseline discovery across all sources
- Parallel enrichment batches
- Personalized scoring with breakdown
- Tier classification and filtering

### Enrichment Network (EN)

Delivers external data source integration and research workflow orchestration. System orchestrates enrichment pipelines and manages external API calls.

**Key Workflows:**
- Multi-source discovery workflows
- Parallel enrichment orchestration
- External API rate limiting
- Research progress tracking

### Network & Outreach (NW)

Delivers network connection analysis and warm path identification. Primary user leverages LinkedIn connections to identify outreach opportunities.

**Key Workflows:**
- LinkedIn import and parsing
- Company-connection matching
- Warm path scoring
- Outreach message generation

### System Management (SYS)

Delivers persistent storage, retrieval, and reporting infrastructure. Primary user accesses research history and generates reports.

**Key Workflows:**
- Convex database operations
- Report generation
- Cross-session access
- Data export
