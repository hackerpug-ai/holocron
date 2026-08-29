---
service: archive-library
feature: UC-LIB-01
priority: P1
type: boundary
tier: holdout
---

# The first search of a fresh session works without warm-up

From a browser profile that has never used the application, sign in, go straight to Library, and type a query as the very first action. Real ranked results with snippets must return on that first request against a cold worker, with no dependency on a prior index fetch, a cached document list, or a previously established connection. Repeat with storage disabled.
