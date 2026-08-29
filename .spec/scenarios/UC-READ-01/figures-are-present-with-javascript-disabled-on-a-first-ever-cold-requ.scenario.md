---
service: public-reader
feature: UC-READ-01
priority: P0
type: boundary
tier: holdout
---

# Figures are present with JavaScript disabled on a first-ever cold request

Purge the edge cache for the token, use a browser profile with no cookies, no storage and JavaScript switched off, and request share-e2e-figures for the first time. All five figures must be present in the HTML that arrives on the wire, with resolvable src attributes, because the images are part of the server-rendered document rather than something hydration attaches later. Assert against the raw response body, not the live DOM: if the figures only exist after client JavaScript runs, this scenario fails.
