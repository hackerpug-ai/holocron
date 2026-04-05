---
stability: CONSTITUTION
last_validated: 2026-04-04
prd_version: 1.0.0
---

# Technical Requirements

## System Components

| Component | Description | Technology |
|-----------|-------------|------------|
| **Discovery Service** | Multi-source company discovery orchestration | Node.js, Cheerio, Puppeteer |
| **Enrichment Service** | Parallel deep research batches | Agent: enricher |
| **Scoring Service** | Personalized fit algorithm application | Agent: scorer |
| **Signal Service** | Automated monitoring and velocity detection | Agent: signal-scanner, cron triggers |
| **Network Service** | LinkedIn import and connection matching | Node.js, CSV parser |
| **Storage Service** | Convex database operations | Convex SDK |
| **Reporting Service** | Markdown report generation | Node.js, template engine |
| **MCP Layer** | Tool interface for holocron integration | MCP SDK |
| **Specialist Agent** | Workflow orchestration and NL interface | Claude Agent |

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Holocron Cloud                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                  │
│  │   MCP Tools  │────│ Specialist   │────│   Chat UI    │                  │
│  │              │    │   Agent      │    │              │                  │
│  │ • discover   │    │              │    │              │                  │
│  │ • enrich     │    │              │    │              │                  │
│  │ • score      │    │              │    │              │                  │
│  │ • scan       │    │              │    │              │                  │
│  │ • network    │    │              │    │              │                  │
│  │ • report     │    │              │    │              │                  │
│  └──────────────┘    └──────────────┘    └──────────────┘                  │
│         │                    │                                            │
│         ▼                    ▼                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                        Workflow Orchestrator                        │  │
│  │                                                                     │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐│  │
│  │  │ Discovery   │  │ Enrichment  │  │  Scoring    │  │  Network    ││  │
│  │  │   Service   │  │   Service   │  │   Service   │  │   Service   ││  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘│  │
│  │                                                                     │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │  │
│  │  │   Signal    │  │  Storage    │  │  Reporting  │                  │  │
│  │  │   Service   │  │   Service   │  │   Service   │                  │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                  │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│         │                    │                                            │
│         ▼                    ▼                                            │
│  ┌──────────────┐    ┌──────────────────────────────────┐                │
│  │   External   │    │         Convex Database          │                │
│  │   Sources    │    │                                  │                │
│  │              │    │  • companies_researched          │                │
│  │ • VC sites   │    │  • company_signals               │                │
│  │ • YC dir     │    │  • target_companies             │                │
│  │ • Vertical AI│    │  • network_connections           │                │
│  │ • Exploding  │    │                                  │                │
│  │ • LinkedIn   │    │                                  │                │
│  └──────────────┘    └──────────────────────────────────┘                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Data Schema

### companies_researched
Complete research history for all discovered companies.

```sql
CREATE TABLE companies_researched (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    website TEXT NOT NULL UNIQUE,
    description TEXT,
    data_source TEXT,
    vc_tier TEXT,
    lead_investors TEXT,
    funding_round TEXT,
    funding_amount REAL,
    funding_date TEXT,
    company_type TEXT DEFAULT 'unknown',  -- 'ai_provider', 'ai_first', 'hybrid'
    employee_count INTEGER DEFAULT NULL,
    
    -- Component scores (0-110 total max)
    ai_native_score REAL,              -- 0-20
    technical_leverage_score REAL,     -- 0-15
    stage_score REAL,                  -- 0-15
    company_size_score REAL,           -- 0-10
    culture_score REAL,                -- 0-20
    growth_model_score REAL,           -- 0-10
    team_score REAL,                   -- 0-10
    founder_vc_score REAL,             -- 0-5
    signal_score REAL,                 -- 0-5
    
    fit_score REAL,                    -- Sum of components, max 110
    tier TEXT,                         -- 'TIER1', 'TIER2', 'TIER3', 'SKIP'
    
    -- Additional metadata
    growth_score REAL,
    trend_direction TEXT,
    prestige_rank INTEGER,
    prestige_boost INTEGER,
    research_date TEXT DEFAULT CURRENT_TIMESTAMP,
    last_updated TEXT DEFAULT CURRENT_TIMESTAMP,
    needs_manual_review INTEGER DEFAULT 0,
    dealbreaker_flags TEXT,
    research_notes TEXT
);

CREATE INDEX idx_companies_fit_score ON companies_researched(fit_score);
CREATE INDEX idx_companies_tier ON companies_researched(tier);
CREATE INDEX idx_companies_vc_tier ON companies_researched(vc_tier);
CREATE INDEX idx_companies_type ON companies_researched(company_type);
```

### company_signals
Signal tracking for continuous intelligence.

```sql
CREATE TABLE company_signals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_website TEXT NOT NULL,
    signal_type TEXT NOT NULL,          -- 'funding', 'hiring', 'vp_hire', 'enterprise_ai', 'headcount', 'tech_stack'
    signal_value TEXT,
    signal_strength REAL,               -- 0-10
    detected_date TEXT DEFAULT CURRENT_TIMESTAMP,
    source TEXT,
    notes TEXT,
    FOREIGN KEY (company_website) REFERENCES companies_researched(website)
);

CREATE INDEX idx_signals_company ON company_signals(company_website);
CREATE INDEX idx_signals_type ON company_signals(signal_type);
CREATE INDEX idx_signals_date ON company_signals(detected_date);
```

### target_companies
High-fit targets only (fit_score ≥ 66).

```sql
CREATE TABLE target_companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    website TEXT NOT NULL UNIQUE,
    fit_score REAL NOT NULL,
    tier TEXT NOT NULL,
    vc_tier TEXT,
    funding_round TEXT,
    funding_amount REAL,
    company_type TEXT DEFAULT 'unknown',
    employee_count INTEGER DEFAULT NULL,
    product_description TEXT,
    job_openings TEXT,
    status TEXT DEFAULT 'researching',  -- 'researching', 'contacted', 'interviewing', 'offer', 'rejected'
    interview_notes TEXT,
    FOREIGN KEY (website) REFERENCES companies_researched(website)
);

CREATE INDEX idx_targets_fit_score ON target_companies(fit_score);
CREATE INDEX idx_targets_tier ON target_companies(tier);
CREATE INDEX idx_targets_status ON target_companies(status);
```

### network_connections
LinkedIn connections for warm path analysis.

```sql
CREATE TABLE network_connections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT,
    company TEXT,
    position TEXT,
    linkedin_url TEXT,
    connected_on TEXT,
    connection_strength REAL DEFAULT 0,  -- 0-10 calculated
    is_former_colleague INTEGER DEFAULT 0,
    imported_date TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(first_name, last_name, company)
);

CREATE INDEX idx_network_company ON network_connections(company);
CREATE INDEX idx_network_strength ON network_connections(connection_strength);
```

## MCP Tool Specification

### target_company_discover
Baseline discovery across all sources.

```typescript
{
  name: "target_company_discover",
  description: "Discover AI companies from multiple sources (VC portfolios, YC, vertical AI, exploding topics, industry reports)",
  inputSchema: {
    type: "object",
    properties: {
      sources: {
        type: "string",
        enum: ["vc", "yc", "vertical", "exploding", "gfd", "reports", "all"],
        default: "all"
      },
      limit: {
        type: "number",
        default: 200,
        maximum: 500
      },
      verticals: {
        type: "array",
        items: { type: "string" }
      },
      companyTypes: {
        type: "string",
        enum: ["provider", "first", "hybrid", "all"],
        default: "all"
      },
      size: {
        type: "string",
        enum: ["10-50", "51-100", "101-200", "all"],
        default: "all"
      },
      minScore: {
        type: "number",
        default: 60,
        minimum: 0,
        maximum: 110
      }
    }
  }
}
```

### target_company_enrich
Deep research enrichment for specific company.

```typescript
{
  name: "target_company_enrich",
  description: "Enrich a single company with deep research (employee count, funding, technical signals, culture, growth)",
  inputSchema: {
    type: "object",
    required: ["website"],
    properties: {
      website: {
        type: "string",
        format: "uri"
      }
    }
  }
}
```

### target_company_score
Apply personalized scoring algorithm.

```typescript
{
  name: "target_company_score",
  description: "Score a company using personalized fit algorithm (0-110 points across 9 components)",
  inputSchema: {
    type: "object",
    required: ["website"],
    properties: {
      website: {
        type: "string",
        format: "uri"
      },
      recalculate: {
        type: "boolean",
        default: false,
        description: "Force recalculation even if previously scored"
      }
    }
  }
}
```

### target_company_scan_signals
Signal monitoring for target companies.

```typescript
{
  name: "target_company_scan_signals",
  description: "Scan for new signals (funding, hiring, VP hires, enterprise AI, headcount, tech stack) on target companies",
  inputSchema: {
    type: "object",
    properties: {
      tier: {
        type: "string",
        enum: ["TIER1", "TIER2", "TIER3", "all"],
        default: "all"
      },
      signals: {
        type: "array",
        items: {
          type: "string",
          enum: ["funding", "hiring", "vp_hire", "enterprise_ai", "headcount", "tech_stack"]
        },
        default: ["funding", "hiring", "vp_hire", "enterprise_ai", "headcount", "tech_stack"]
      }
    }
  }
}
```

### target_company_network_match
Match companies to LinkedIn network.

```typescript
{
  name: "target_company_network_match",
  description: "Match target companies to user's LinkedIn connections for warm path identification",
  inputSchema: {
    type: "object",
    properties: {
      company: {
        type: "string",
        description: "Company name or website to match"
      },
      tier: {
        type: "string",
        enum: ["TIER1", "TIER2", "TIER3", "all"],
        default: "TIER1"
      },
      minStrength: {
        type: "number",
        default: 5,
        minimum: 0,
        maximum: 10
      }
    }
  }
}
```

### target_company_generate_report
Generate markdown reports.

```typescript
{
  name: "target_company_generate_report",
  description: "Generate markdown reports (baseline, score breakdown, network analysis, outreach recommendations)",
  inputSchema: {
    type: "object",
    properties: {
      reportType: {
        type: "string",
        enum: ["baseline", "score", "network", "outreach", "signals"],
        default: "baseline"
      },
      company: {
        type: "string",
        description: "Company website (for single-company reports)"
      },
      tier: {
        type: "string",
        enum: ["TIER1", "TIER2", "TIER3", "all"],
        default: "all"
      },
      limit: {
        type: "number",
        default: 50
      }
    }
  }
}
```

## External Dependencies

| Dependency | Purpose | Rate Limit | Fallback |
|------------|---------|------------|----------|
| **VC Portfolio Sites** | Company discovery | Varies by site | Retry with backoff |
| **YC Directory** | Company discovery | Unknown | Retry with backoff |
| **Vertical AI Startups** | Industry-specific discovery | Unknown | Retry with backoff |
| **Exploding Topics** | Trend signals | Unknown | Retry with backoff |
| **LinkedIn CSV Export** | Network import | N/A (manual) | Future API integration |
| **Convex** | Cloud database | Provisioned tier | Local cache fallback |

## Deployment Architecture

### Production Environment
- **Hosting**: Convex cloud platform
- **Region**: US-East-1 (default)
- **Database**: Convex managed backend
- **Cron**: Convex scheduled functions
- **Monitoring**: Convex dashboard + custom logs

### CI/CD Pipeline
1. PR validation (schema tests, lint)
2. Deployment to staging (manual trigger)
3. Integration tests (real sources, limited scope)
4. Production deployment (manual approval)
5. Post-deployment smoke tests

### Backup Strategy
- Convex automatic backups (enabled)
- Weekly export to JSON (manual trigger)
- Emergency restore procedure documented

## Security Considerations

- No PII stored beyond user's own LinkedIn data
- API keys stored in Convex environment variables
- Rate limiting enforced on all external calls
- Input validation on all user inputs
- SQL injection prevention (parameterized queries)
- XSS prevention (markdown sanitized)

## Performance Requirements

- Discovery: 200 companies in <30 minutes
- Enrichment: 10 companies in <5 minutes
- Scoring: 1 company in <30 seconds
- Signal scan: 100 companies in <10 minutes
- Network matching: 500 connections in <1 minute
- Report generation: 50 companies in <30 seconds
- Database queries: <100ms for indexed queries

## Migration Strategy

### Phase 1: Database Setup
1. Create Convex project
2. Define schema (4 tables)
3. Create indexes
4. Run migration scripts

### Phase 2: Service Implementation
1. Implement Discovery Service (VC + YC)
2. Implement Enrichment Service (agent integration)
3. Implement Scoring Service (algorithm)
4. Implement Signal Service (cron)
5. Implement Network Service (CSV import)
6. Implement Storage Service (Convex CRUD)
7. Implement Reporting Service (markdown)

### Phase 3: MCP Layer
1. Implement 6 MCP tools
2. Register with holocron
3. Test via CLI

### Phase 4: Specialist Agent
1. Implement workflow orchestration
2. Implement NL interface
3. Register with primary chat agent
4. Test end-to-end

### Phase 5: Testing & Deployment
1. Unit tests (all services)
2. Integration tests (source scraping)
3. Holdout scenario testing (L4)
4. Staging deployment
5. Production deployment

## Monitoring & Observability

### Metrics to Track
- Discovery success rate by source
- Enrichment success rate
- Scoring distribution
- Signal velocity detection count
- Network match rate
- Report generation count
- API response times
- Error rates by service

### Alerting
- Discovery failure rate >20%
- Enrichment failure rate >10%
- Signal scan failure
- Database connection failures
- Cron job failures

### Logging
- Structured JSON logs
- Log levels: ERROR, WARN, INFO, DEBUG
- Context: service, operation, company, timestamp
- Retention: 30 days
