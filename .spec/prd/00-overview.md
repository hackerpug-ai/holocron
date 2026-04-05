---
stability: PRODUCT_CONTEXT
last_validated: 2026-04-04
prd_version: 1.0.0
---

# Target Company Research Integration

## Product Description

A cloud-based continuous intelligence system that moves the local `find-target-companies` skill into the holocron knowledge system. The system discovers AI companies from multiple sources (VC portfolios, Y Combinator, vertical AI startups), enriches company data with deep research, scores companies using a personalized fit algorithm, and generates network-aware outreach recommendations.

## Problem Statement

**Current State:**
- Target company research is siloed in local files and SQLite databases
- Manual effort required to discover companies across scattered sources
- No continuous intelligence - signals (funding, hiring, growth) must be manually tracked
- Network analysis requires manual CSV parsing and cross-referencing
- Scoring algorithm exists but is tied to local execution context

**User Pain Points:**
- Research is fragmented across multiple tools and data sources
- No automated signal monitoring for timely outreach opportunities
- Network connections are underutilized for warm intros
- Scoring results cannot be easily shared or accessed across devices
- Continuous updates require re-running entire baseline crawls

**Key Friction:**
- Local-only workflow limits accessibility and collaboration
- No persistent cloud storage for research artifacts
- Manual network connection analysis is time-consuming
- Signal tracking is ad-hoc and easily missed

## Solution Summary

**Target Company Research Integration** provides:

1. **Cloud-based research workflow** - Access discovery, enrichment, and scoring from any device through holocron's MCP interface

2. **Automated signal monitoring** - Continuous tracking of funding, hiring, headcount, and growth signals with velocity alerts

3. **Network-aware recommendations** - Integrated LinkedIn connection analysis for warm path identification

4. **Specialist agent integration** - Target company research specialist within holocron's primary chat agent for natural language queries

5. **Persistent knowledge storage** - All research artifacts stored in holocron's Convex backend for cross-session access

**Key Differentiators:**
- Personalized scoring algorithm (0-110 points) across 9 components
- Dual-track AI_Native scoring (infrastructure vs services)
- Dealbreaker filtering (culture <7, AI_Native <5, size >200)
- Stage bias (Series A optimal over Series C+)
- Size preference (10-50 employees for maximum leverage)

## Success Metrics

- **Research Velocity**: Time from query to scored companies <5 minutes
- **Signal Capture Rate**: >90% of funding/hiring events captured within 48 hours
- **Network Match Rate**: >30% of TIER1 targets have identified warm path
- **User Engagement**: Weekly active usage for signal scanning
- **Outreach Conversion**: Warm path intros → conversations >50% rate

## Vision Statement

Transform target company research from a manual, local-only workflow into an intelligent, cloud-based continuous intelligence system that proactively identifies high-fit opportunities and leverages existing network connections for warm outreach.
