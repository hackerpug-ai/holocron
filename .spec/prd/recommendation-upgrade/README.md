# PRD: Recommendation Agent Pipeline Upgrade

## Overview

Upgrade the `find_recommendations` tool from a single-pass, single-platform approach to a two-pass, multi-platform discovery and enrichment system. The system must be **domain-agnostic** — it must work equally well for plumbers, therapists, doctors, dog walkers, products, professionals, places, and any other recommendation type.

## Problem Statement

Current recommendations give bare entity names with no trust signals:
- No review counts or ratings
- No direct platform links (Yelp, Google Maps, Amazon, etc.)
- No explanation of *why* an entity is recommended
- Single generic search query misses platform diversity
- Schema too thin to carry trust data

## Solution: Two-Pass Discovery + Enrichment

**Pass 1 (Discovery):** 3-5 platform-targeted searches → LLM extracts entity names + basic metadata
**Pass 2 (Enrichment):** Per-entity targeted searches → fill review counts, platform URLs, ratings

## Functional Requirements

### FR-1: Rich Output Schema

Each recommended item MUST include (when available from sources):
- `name` (required) — Entity name
- `description` (required) — One-line tagline
- `whyRecommended` (required) — Specific reason this entity fits the query
- `rating` — Aggregate rating (1-5)
- `reviewCount` — Number of reviews
- `platformLinks` — Array of direct links to platform profiles:
  - `platform` (string) — "yelp", "google", "amazon", "angi", "linkedin", etc.
  - `url` (string) — Direct link to the entity's page on that platform
  - `rating` (number) — Rating on this specific platform
  - `reviewCount` (number) — Review count on this platform
- `location` — Geographic info
- `pricing` — Cost information
- `contact` — Phone, URL, email
- `sourcePlatform` — Primary platform where found

All new fields are optional for backward compatibility.

### FR-2: Multi-Platform Search

The system MUST execute 3-5 targeted searches in parallel instead of one generic query:
1. **General web** — `"{query}" {location} reviews` — broad discovery
2. **Yelp** — `site:yelp.com "{query}" {location}` — local business reviews
3. **Google Maps** — `site:google.com/maps "{query}" {location}` — location-based results
4. **Reddit** — `site:reddit.com "{query}" recommendations` — community opinions
5. **Industry** — `"{query}" {location} reviews ratings` — generic review aggregation

Platform selection MUST be domain-agnostic — based on query patterns, not hardcoded categories.

### FR-3: Post-Synthesis Enrichment

After the LLM synthesizes entity names from Pass 1, the system MUST run a second retrieval pass for each entity that lacks `platformLinks`:
1. Search `"{entity_name}" {location} reviews` via Jina Search
2. Extract platform URLs from results (yelp.com/biz/, google.com/maps/place/, etc.)
3. Extract ratings and review counts from snippets
4. Merge enriched data into the entity

### FR-4: Enhanced Synthesis Prompt

The LLM synthesis prompt MUST instruct extraction of:
- Review counts alongside ratings
- Platform URLs (yelp.com/biz/, google.com/maps/place/, etc.)
- Specific whyRecommended reasons (not generic text)
- Multiple platform links when available
- All optional fields must be omittable — never fabricate

### FR-5: Domain Agnostic

The system MUST NOT use hardcoded domain categories. It works through:
- Platform-specific URL patterns (not service-type logic)
- Generic search strategies (not industry-specific rules)
- Universal trust signals (reviews, ratings, links) that apply to all domains

### FR-6: Backward Compatibility

- All new schema fields are optional
- Existing tests MUST continue to pass
- The `find_recommendations` tool input schema unchanged
- MCP tool input schema unchanged
- Timeout increased from 30s to 45s for multi-pass

### FR-7: UI Display Updates

The RecommendationItem component MUST display:
- Rating + review count: `4.5 ★ (123 reviews)` next to title
- Why recommended: explanatory text below description
- Platform links: tappable chips ("Yelp", "Google", etc.) opening platform URLs
- Pricing: displayed when available

## Technical Requirements

### New Files
- `convex/research/platformSearch.ts` — multi-platform search routing and execution
- `convex/research/enrichment.ts` — post-synthesis entity enrichment

### Modified Files
- `convex/chat/specialistPrompts.ts` — enriched Zod schema + synthesis prompt
- `convex/research/actions.ts` — two-pass `findRecommendationsCore()`
- `convex/chat/toolExecutor.ts` — data mapping with new fields
- `components/cards/types/recommendation.ts` — UI types
- `components/cards/RecommendationItem.tsx` — rich display
- `components/chat/MessageBubble.tsx` — type cast update
- `convex/research/actions.test.ts` — new test cases

### Reusable Infrastructure
- `jinaSearch()` from `convex/lib/jina.ts` — web search with `site:` filter support
- `jinaReaderBatch()` from `convex/lib/jina.ts` — parallel URL reading
- Existing `parallelJinaReader()` in `actions.ts` — reads top N sources
- Existing `synthesize()` in `actions.ts` — LLM synthesis (reused with new prompt)

## Acceptance Criteria

### AC-1: Schema Enrichment
GIVEN the existing RecommendationSynthesisSchema
WHEN the new fields are added (reviewCount, platformLinks, sourcePlatform)
THEN all existing tests pass without modification
AND new fields are all optional

### AC-2: Multi-Platform Search
GIVEN a recommendation query "plumbers" with location "Salt Lake City"
WHEN findRecommendationsCore executes
THEN 3-5 parallel platform-targeted searches are executed
AND results from multiple platforms are combined

### AC-3: Enrichment Pass
GIVEN synthesis produces entities without platformLinks
WHEN the enrichment pass runs
THEN entities are enriched with platform URLs, ratings, and review counts
AND enriched data merges correctly into the response

### AC-4: Domain Agnostic
GIVEN queries for different domains (plumbers, therapists, headphones)
WHEN findRecommendationsCore executes for each
THEN all produce valid recommendations with trust signals
AND no domain-specific hardcoded logic is used

### AC-5: UI Rich Display
GIVEN a recommendation with rating 4.5, reviewCount 123, and platformLinks
WHEN rendered in RecommendationItem
THEN rating and review count are displayed next to the title
AND platform links appear as tappable chips
AND whyRecommended text is visible

### AC-6: Backward Compatibility
GIVEN existing test cases for findRecommendationsCore
WHEN the pipeline is upgraded
THEN all existing tests pass without modification
AND the response shape is a superset of the original

## Non-Functional Requirements

- **Timeout:** 45 seconds max (increased from 30s for multi-pass)
- **Latency overhead:** Multi-platform search adds <15s vs single search
- **Token budget:** Enrichment pass uses targeted searches (limit=3) to minimize tokens
- **Error handling:** Individual platform search failures don't break the pipeline
- **Rate limits:** Individual error handling per Jina Search call

## Out of Scope

- Direct API integration (Yelp Fusion, Google Places API) — future enhancement
- Evaluator-optimizer self-correction loops — future enhancement
- Confidence-based query routing — future enhancement
- Caching enrichment data per entity — future enhancement
