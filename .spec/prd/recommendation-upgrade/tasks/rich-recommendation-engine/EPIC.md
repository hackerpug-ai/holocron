# Epic 1: Rich Recommendation Engine

## Overview

Upgrade the backend recommendation pipeline from one-pass/single-search behavior to a two-pass, multi-platform, domain-agnostic engine that returns additive trust metadata while preserving the current tool input contract.

## Theme

Contract-first backend upgrade:
- expand the synthesis contract
- add bounded multi-platform discovery
- selectively enrich incomplete entities

## Human Test Steps

1. Ask for a local-service recommendation with a location and confirm ratings, review counts, and direct platform links appear when sources support them.
2. Ask for a product-style or non-local recommendation and confirm the same pipeline returns trust signals without domain-specific branching.
3. Ask for a sparse or niche query and confirm recommendations still return without fabricated trust fields.
4. Simulate or observe a partial platform failure and confirm successful sources still produce recommendations.
5. Confirm the tool still returns the same top-level `{ items, sources, query, durationMs }` shape within the `45s` cap.

## Source Coverage

- `FR-1`, `FR-2`, `FR-3`, `FR-4`, `FR-5`, `FR-6`
- `AC-1`, `AC-2`, `AC-3`, `AC-4`, `AC-6`

## Dependencies

- Depends on no prior epic
- Blocks `recommendation-trust-signal-ui`

## Task List

| Task | Title | Specialist | Estimate |
|---|---|---|---:|
| `REC-UPG-01` | Expand the recommendation synthesis contract for additive trust metadata | `pi-agent-planner` | 75m |
| `REC-UPG-02` | Add a domain-agnostic multi-platform discovery fan-out helper | `convex-planner` | 95m |
| `REC-UPG-03` | Implement second-pass enrichment and refactor `findRecommendationsCore()` into a two-pass pipeline | `convex-planner` | 135m |

## Wall-Clock Estimate

- Sequential: `305 minutes`
- Expected with normal overlap after contract work: `230-250 minutes`

## Definition Of Done

- Rich recommendation schema validates legacy and enriched payloads.
- Discovery fans out to 3-5 bounded platform-targeted searches.
- Enrichment only runs for materially incomplete items.
- Timeout cap is `45_000` with graceful partial/fallback behavior.
- Existing recommendation tests remain green and new coverage passes.

