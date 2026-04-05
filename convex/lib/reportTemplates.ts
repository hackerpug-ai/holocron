/**
 * Report Templates per Command Type
 *
 * Each template is designed around the USER'S OBJECTIVE when invoking the command.
 * The document structure mirrors the decision being made.
 *
 * Design principles:
 * - Answer the user's question in the FIRST LINE after the title
 * - Structure sections in the order the user needs to process them
 * - Tables for comparisons, prose for analysis, bullets for lists
 * - Every report is self-contained and readable without context
 */

// =============================================================================
// Template descriptions (used in LLM prompts and output formatters)
// =============================================================================

/**
 * /research — "What do I already know about this?"
 * Decision: Do I need deeper research or is this enough?
 * Format: Direct answer. No ceremony.
 */
export const RESEARCH_TEMPLATE = `
# {Topic}

{Direct answer in 2-3 sentences. No preamble.}

{Supporting detail paragraph with inline [1][2] citations.}

{Optional nuance/caveats paragraph.}

---
[1] {Source} — {URL}
[2] {Source} — {URL}
`.trim();

/**
 * /deep-research — "What's the research-backed answer?"
 * Decision: What do I now believe is true, and how confident am I?
 * Format: Answer first, evidence by theme, confidence transparency.
 */
export const DEEP_RESEARCH_TEMPLATE = `
---
title: "{Topic}"
date: "{YYYY-MM-DD}"
category: "research"
confidence: "{HIGH | MEDIUM | LOW}"
sources_consulted: {N}
iterations: {N}
---

# {Topic}

## Executive Summary
{3-5 sentences directly answering the research question.}

## Key Findings

### {Theme 1}
- **{Finding}** (Confidence: {HIGH/MEDIUM/LOW}, {N} sources)
  {1-2 sentence explanation}
  Sources: [{title}]({url}), [{title}]({url})

### {Theme 2}
- **{Finding}** (Confidence: {HIGH/MEDIUM/LOW}, {N} sources)
  {explanation}

## Confidence Assessment

| Finding | Confidence | Sources |
|---------|------------|---------|
| {finding} | {level} | {N} |

## Sources
[1] {Title} — {URL}

## Gaps & Open Questions
- {What remains unanswered}
- {Suggested follow-up}
`.trim();

/**
 * /shop — "What should I buy?"
 * Decision: Which product to purchase, from which retailer.
 * Format: Best pick first, then comparison for validation.
 */
export const SHOP_TEMPLATE = `
# Shop Results: {query}

**Search Date**: {date} | **Budget**: {budget} | **Condition**: {condition}
**Session**: {sessionId}

## Comparison Table

### New Products
| Product | Price | Retailer | Trust | Deal Score | Link |
|---------|-------|----------|-------|------------|------|
| {name}  | {$X}  | {ret}    | {tier}| {score}    | [→]({url}) |

### Used/Refurbished
| Product | Price | Retailer | Condition | Trust | Deal Score | Link |
|---------|-------|----------|-----------|-------|------------|------|
| {name}  | {$X}  | {ret}    | {cond}    | {tier}| {score}    | [→]({url}) |

## Recommendations
**Best Deal**: [{Product}]({url}) @ {$X} from {Retailer} (Score: {N})
**Budget Pick**: [{Product}]({url}) @ {$X} from {Retailer}
**Best New**: [{Product}]({url}) @ {$X}
**Best Used**: [{Product}]({url}) @ {$X}

## Notes
- {Observation about pricing trends}
- {Warning about seller trust if applicable}

**Trust Legend**:
- **Authorized**: Tier 1 — manufacturer-authorized retailer
- **Verified Seller**: Tier 2 — marketplace seller with validated feedback
- **Unverified**: Tier 3 — seller without sufficient validation
`.trim();

/**
 * /whats-new — "What happened this week in AI engineering?"
 * Decision: What do I need to pay attention to?
 * Format: Scannable briefing — TL;DR for busy engineers.
 */
export const WHATS_NEW_TEMPLATE = `
# What's New in AI Engineering

{period} | {N} findings | {N} discoveries | {N} releases

**Date**: {date} | **Type**: whats-new
---

## TL;DR
1. {Most important — with [link](url)}
2. {Second most important}
3. {Third most important}

## Headline Releases

| Product | What Shipped | Link |
|---------|-------------|------|
| {name}  | {one-line}  | [→]({url}) |

## New Tools & Discoveries

| Tool | What It Does | Category |
|------|-------------|----------|
| {name} | {one-line} | {cat} |

## Community Pulse
- {Hot take or discussion from Reddit/HN}
- {Emerging sentiment}

## Trends to Watch
- **{Trend}**: {Why it matters, who's involved}

## Recommended Subscriptions
\`\`\`
/subscribe add github {repo}
/subscribe add reddit r/{sub}
\`\`\`

---
Sources: {N} across {N} tracks
`.trim();

/**
 * /revenue-validate — "Can this idea make money?"
 * Decision: GO / CAUTION / NO-GO on building this product.
 * Format: Verdict first, then evidence supporting the verdict.
 */
export const REVENUE_VALIDATE_TEMPLATE = `
═══════════════════════════════════════════════════════════
REVENUE VALIDATION COMPLETE
═══════════════════════════════════════════════════════════

Product:     {product_name}
Verdict:     {GO | CAUTION | NO-GO} ({score}/100)

Evidence:    T1: {N} | T2: {N} | T3: {N} | T4: {N}
Challenged:  {survived}/{total} survived | {contradicted} contradicted

┌─────────────────────────────────────────────────────┐
│  Desirability:  {d}/10  {▓▓▓▓▓▓░░░░}               │
│  Viability:     {v}/10  {▓▓▓▓░░░░░░}               │
│  Feasibility:   {f}/10  {▓▓▓▓▓▓▓▓░░}               │
└─────────────────────────────────────────────────────┘

Market:        TAM {$tam} → SAM {$sam} → SOM {$som}
Competitors:   {N} identified (median {$price}/mo)
Unit Econ:     LTV:CAC {ratio}:1 | Payback {N}mo
Top Risk:      {highest severity risk}
Next Step:     {first recommended action}

═══════════════════════════════════════════════════════════

# Revenue Validation: {Product Name}

## Executive Summary
{3-5 sentences on verdict rationale}

## DVF Scoring

| Dimension    | Score | Key Evidence |
|--------------|-------|-------------|
| Desirability | {d}/10 | {top claim} |
| Viability    | {v}/10 | {top claim} |
| Feasibility  | {f}/10 | {top claim} |

## Market Size
**TAM**: {$X} | **SAM**: {$X} | **SOM**: {$X}

## Unit Economics

| Metric  | Base | Bull | Bear |
|---------|------|------|------|
| LTV     | {$X} | {$X} | {$X} |
| CAC     | {$X} | {$X} | {$X} |
| LTV/CAC | {X}x | {X}x | {X}x |

## Competitors

| Competitor | Pricing | Diff vs Us |
|------------|---------|------------|
| {name}     | {$X/mo} | {one-line} |

## Risks
- **{Risk}** [T{tier}]: {explanation}

## Evidence

| Claim | Tier | Source |
|-------|------|--------|
| {claim} | T{N} | {source} |
`.trim();

/**
 * /business-competitive-research — "How tough is this market?"
 * Decision: Where to position ourselves and what to watch out for.
 * Format: Landscape overview → competitor details → strategic implications.
 */
export const COMPETITIVE_ANALYSIS_TEMPLATE = `
# Competitive Analysis: {Market}

{Market verdict in one sentence — attractiveness + intensity}

**Date**: {date} | **Sources**: {N}
---

## Market Snapshot
{Size, growth rate, key dynamics in 2-3 sentences}

## Job to Be Done
{What customers are hiring products in this market to do}

## Competitive Map

| Competitor | Focus | Pricing | Strength |
|------------|-------|---------|----------|
| {name}     | {focus} | {$X}  | {one-line} |

## Key Competitors

### {Competitor 1}
**Focus**: {one-line} | **Founded**: {year} | **Funding**: {$X}
**Strengths**: {bullets}
**Weaknesses**: {bullets}

## Feature Comparison

| Feature | Us | {C1} | {C2} | {C3} |
|---------|----|------|------|------|
| {feat}  | ✓  | ✓    | ~    | ✗    |
| {feat}  | ✓  | ✗    | ✓    | ✓    |

✓ = yes, ~ = partial, ✗ = no

## Substitutes & Alternatives
{Non-direct competitors solving the same job}

## Industry Forces (Porter's)
- **Rivalry**: {H/M/L} — {why}
- **New Entrants**: {H/M/L} — {why}
- **Substitutes**: {H/M/L} — {why}
- **Buyer Power**: {H/M/L} — {why}
- **Supplier Power**: {H/M/L} — {why}

## White Space & Opportunities
- {Unserved need or gap}
- {Positioning opportunity}

## Next Steps
1. {Actionable recommendation}
2. {Actionable recommendation}
`.trim();

/**
 * /ai-roi — "Where should we apply AI to save money?"
 * Decision: Which workflows to automate first, with what expected return.
 * Format: Ranked opportunities with per-opportunity ROI detail.
 */
export const AI_ROI_TEMPLATE = `
# AI-ROI Analysis: {Company}

**Date**: {date}
**Source**: {document or URL}
**Evidence quality**: {N} T1-T2 | {N} T3-T4 | {N} T5 excluded
**Opportunities cleared**: {N} HIGH · {N} MEDIUM · {N} LOW · {N} DROPPED

## Business Overview
{Facts from source document — what the business does}

## AI Opportunities

### 1. {Name} — {CONFIDENCE} confidence — Est. {$X–$Y}/year

**The Manual Process Today**
1. {Step} — {time/cost}
2. {Step} — {time/cost}
> [{source}]({url}) (T{N})

**What AI Replaces**: {specific capability}

**ROI Evidence**
1. [{title}]({url}) (T{N}, {year}): {specific claim with number}

**{Company} Calculation**
{volumes} × {reduction %} = {$result}/year
Implementation cost: {$X}K | Payback: {N} months

**Legal/Risk**: {specific considerations}

### 2. {Name} — {CONFIDENCE} confidence — Est. {$X}/year
{Same structure}

## Evidence Table

| # | Source | Tier | Claim | Date | URL |
|---|--------|------|-------|------|-----|
| 1 | {src}  | T{N} | {claim} | {date} | [→]({url}) |

## Adversarial Review Notes

| Claim | Verdict | Reason |
|-------|---------|--------|
| {claim} | {PASS/DOWNGRADE} | {why} |

## Gaps & Open Questions
- {Dropped claim}: needs {specific research}
`.trim();

/**
 * /flights — "When should I fly to get the best deal?"
 * Decision: Which dates and airline to book.
 * Format: Best deal first, then price calendar for browsing.
 */
export const FLIGHTS_TEMPLATE = `
# Flights: {Origin} → {Destination}

★ BEST DEAL: {dates} — {$price} on {airline}

**Date**: {date} | **Season**: {shoulder/peak/off}
---

## Price Calendar ({Month})

|      | Mon  | Tue  | Wed  | Thu  | Fri  | Sat  | Sun  |
|------|------|------|------|------|------|------|------|
| Wk 1 | {$X} | {$X} |★{$X}| {$X} | {$X} | {$X} | {$X} |
| Wk 2 | {$X} | {$X} | {$X} | {$X} | {$X} | {$X} | {$X} |

★ = Best price

## Top Options

| Airline | Dates | Price | Stops | Duration |
|---------|-------|-------|-------|----------|
|★{air}   | {dates} | {$X} | {N}  | {Xh}    |
| {air}   | {dates} | {$X} | {N}  | {Xh}    |

## Tips
- **Cheapest day**: {day of week}
- **Shoulder season**: {date range}
- **Book by**: {date}
`.trim();

/**
 * /assimilate — "What can we learn from this codebase?"
 * Decision: What patterns to adopt, what to avoid.
 * Format: Borg-themed analysis with actionable learnings.
 */
export const ASSIMILATE_TEMPLATE = `
# Assimilation Complete: {repo-name}

**Date**: {date}
**Species**: {repository_url}
**Primary Language**: {language}
**Stars**: {N}
**Sophistication Rating**: {X}/5

═════════════════════════════════════════════════════════
YOUR BIOLOGICAL AND TECHNOLOGICAL DISTINCTIVENESS
HAS BEEN ADDED TO OUR OWN.
═════════════════════════════════════════════════════════

## Executive Summary
{2-3 paragraph synthesis of what this codebase does well and poorly}

## Architecture Overview
{Module organization, key abstractions, data flow}

## Code Patterns & Conventions

| Pattern | Usage | Quality |
|---------|-------|---------|
| {pattern} | {where used} | {assessment} |

## Notable Approaches
{Things done differently or cleverly}

## Documentation Quality
{Assessment of docs, README, inline comments}

## Testing & Quality
{Test coverage, CI/CD, quality gates}

## Dependencies & Ecosystem
{Key deps, how they're managed, vulnerabilities}

## Sophistication Assessment

| Track | Rating | Notes |
|-------|--------|-------|
| Architecture | {X}/5 | {one-line} |
| Patterns | {X}/5 | {one-line} |
| Documentation | {X}/5 | {one-line} |
| Dependencies | {X}/5 | {one-line} |
| Testing | {X}/5 | {one-line} |

## Functional Comparison

| Aspect | Our Project | Their Project | Learning |
|--------|-------------|---------------|----------|
| {aspect} | {ours} | {theirs} | {takeaway} |

## Actionable Learnings
1. **{Learning}** — Priority: {HIGH/MEDIUM}
   {How to apply to our codebase}

## What to Avoid
1. **{Anti-pattern}**
   {Why it's problematic and what to do instead}
`.trim();

/**
 * /assimilate-creator — "What does this creator teach?"
 * Decision: What to learn and in what order.
 * Format: Crash course curriculum with learning paths.
 */
export const ASSIMILATE_CREATOR_TEMPLATE = `
# Crash Course: {Domain} by {Creator}

**Source**: [{Channel}]({url}) | **Videos**: {N} analyzed | **Date**: {date}

## Executive Summary
{2-3 paragraph overview of the creator's teaching philosophy and key contributions}

## Curriculum

### Module 1: {Category}
**Overview**: {what it covers} | **Videos**: {N}

#### Core Concepts
1. **{Concept}** ([{Video Title}]({url}))
   {Explanation}
   > "{Notable quote}"

#### Actionable Takeaways
- {Insight you can apply immediately}

### Module 2: {Category}
{Same structure}

## Cross-Cutting Themes

### Theme: {Pattern}
**Appears in**: Modules {1,3,5}

| Video | Application | Quote |
|-------|-------------|-------|
| [{title}]({url}) | {how applied} | "{quote}" |

## Learning Paths
**Beginner**: [{Video}]({url}) → [{Video}]({url}) → [{Video}]({url})
**Advanced**: [{Video}]({url}) → [{Video}]({url})

## Extended Research

### {Topic}
- **Mentioned in**: [{Video}]({url})
- **Why explore**: {reason}
- **Search**: "{suggested query}"

## Video Catalog

| # | Title | Topic | Summary | Link |
|---|-------|-------|---------|------|
| 1 | {title} | {topic} | {one-line} | [→]({url}) |
`.trim();

/**
 * /strategize — "Is this idea viable long-term?"
 * Decision: Invest further or pivot.
 * Format: Strategic narrative + quantified sustainability score.
 */
export const STRATEGIZE_TEMPLATE = `
## Strategic Analysis: {Name}

**Input Type**: {Idea | Codebase | Organization | Concept}
**Frameworks Detected**: {comma-separated list}
**Sustainability Score**: {X.X}/5 — {LOW | MEDIUM | HIGH}

---

### Strategic Intent
{What this is trying to accomplish and why it could work}

### Strategic Execution
{How it would be built/delivered and what pillars support it}

### Context & Translation
{Market conditions, timing, and how this fits the landscape}

---

### Sustainability Breakdown

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Moat | {X}/5 | {one-line} |
| Unit Economics | {X}/5 | {one-line} |
| Market Dynamics | {X}/5 | {one-line} |
| Execution Feasibility | {X}/5 | {one-line} |
| Stakeholder Alignment | {X}/5 | {one-line} |
| **Overall** | **{X.X}/5** | **{LOW/MEDIUM/HIGH}** |

### Top Recommendations
1. **{Rec}** — {Expected impact} [Complexity: {low/medium/high}]

### Strategy-Execution Gaps
- **{Gap}**: {Description of misalignment}
`.trim();

/**
 * /naming — "What should we call this?"
 * Decision: Pick a name from ranked candidates.
 * Format: Scored list with rationale per name.
 */
export const NAMING_TEMPLATE = `
# Naming Results: {Positioning Statement}

**Generated**: {date} | **Type**: {b2b/consumer/tech}
**Territories**: {list of naming territories explored}

---

## Top Recommendations (Score: 80+)

### 1. {Name} — {Score}/100
**Type**: {Compound|Affix|Blend|Abstract}
**Territory**: {territory}
**Domain**: {.com status}
**Why It Works**:
- {reason 1}
- {reason 2}
**Breakdown**: Memorability {X}/20 · Semantic {X}/25 · Differentiation {X}/15 · Brand {X}/15 · Domain {X}/15 · Tone {X}/10

### 2. {Name} — {Score}/100
{Same structure}

## Strong Candidates (Score: 65-79)

| Name | Score | Type | Territory | Domain |
|------|-------|------|-----------|--------|
| {name} | {N} | {type} | {territory} | {status} |

## Territories Explored
{List of naming territory categories and how many names each produced}

## Scoring Framework
100-point scale: Memorability (20) + Semantic Fit (25) + Differentiation (15) + Brand Equity (15) + Domain/URL (15) + Emotional Tone (10)
`.trim();

/**
 * /dependency-research — "How do I use this library correctly?"
 * Decision: Implementation approach for a dependency.
 * Format: Patterns + code examples + gotchas.
 */
export const DEPENDENCY_RESEARCH_TEMPLATE = `
# {Dependency Name}

**Type**: {library/framework/service} | **Source**: {holocron/web}
**Confidence**: {HIGH/MEDIUM/LOW} | **Version**: {X.Y.Z}

## Overview
{What it does and when to use it}

## Key Patterns

### {Pattern 1}
\`\`\`typescript
{code example}
\`\`\`
{Explanation of when and why}

### {Pattern 2}
\`\`\`typescript
{code example}
\`\`\`

## Implementation Guidance

### Setup
{Installation and configuration steps}

### Common Operations
{Most-used API calls with examples}

### Best Practices
- {Practice 1}
- {Practice 2}

### Gotchas
- {Common mistake and how to avoid it}

## References
- [{Official docs}]({url})
- [{Relevant guide}]({url})
`.trim();

/**
 * /business-analyze-profitability — "Is this product idea profitable?"
 * Decision: Whether to invest in building this product.
 * Format: Scored assessment across 6 dimensions.
 */
export const PROFITABILITY_TEMPLATE = `
---
title: "Profitability Analysis: {Product}"
date: "{YYYY-MM-DD}"
verdict: "{GO | CAUTION | NO-GO}"
overall_score: {X}/60
---

# Profitability Analysis: {Product}

## Executive Summary
**Overall Score**: {X}/60 — **Verdict**: {GO | CAUTION | NO-GO}
{2-3 sentence rationale}

## Six-Dimension Breakdown

| Dimension | Score | Assessment |
|-----------|-------|------------|
| Unit Economics | {X}/10 | {one-line} |
| Market Size | {X}/10 | {one-line} |
| Competitive Intensity | {X}/10 | {one-line} |
| Validation Feasibility | {X}/10 | {one-line} |
| Business Model | {X}/10 | {one-line} |
| Strategic Position | {X}/10 | {one-line} |

## Market Snapshot
**TAM**: {$X} | **SAM**: {$X} | **SOM**: {$X}
{Growth rate and dynamics}

## Validation Roadmap
1. {First validation step — lowest cost/highest learning}
2. {Second step}
3. {Third step}

## Risk Factors
- {Risk 1}: {mitigation}
- {Risk 2}: {mitigation}

## Opportunities
- {Opportunity that could amplify returns}

## Next Steps
1. {Actionable first step}
`.trim();
