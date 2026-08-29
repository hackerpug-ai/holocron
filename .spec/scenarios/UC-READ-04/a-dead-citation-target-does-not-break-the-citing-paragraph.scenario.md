---
service: public-reader
feature: UC-READ-04
priority: P2
type: error_handling
tier: holdout
---

# A dead citation target does not break the citing paragraph

Publish a document whose citations point at three URLs: one live, one that returns 404, and one on a host that never answers. All three must render as followable links from the claim they support, with visible source identity, and the surrounding paragraphs must be complete. The page must not attempt to validate or prefetch them at render time, must not block first paint on them, and must not silently drop the two broken ones - a citation that disappears because its target is down is worse than a citation that leads somewhere dead, because the claim then looks unsourced.
