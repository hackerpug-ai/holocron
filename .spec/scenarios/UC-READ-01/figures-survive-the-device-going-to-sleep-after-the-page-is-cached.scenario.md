---
service: public-reader
feature: UC-READ-01
priority: P1
type: error_handling
tier: holdout
---

# Figures survive the device going to sleep after the page is cached

Load share-e2e-figures once so the page and its five assets are warm at the edge. Now stop the device platform process entirely and shut the tunnel. Open the same URL from a second, cold browser profile. The page and every previously served figure must still arrive from the edge with all five images loaded, and no request may hang the render: any asset that genuinely cannot be served must fail fast rather than leaving an image request open for thirty seconds. The page must not render a spinner or a skeleton at any point, even with the origin dead.
