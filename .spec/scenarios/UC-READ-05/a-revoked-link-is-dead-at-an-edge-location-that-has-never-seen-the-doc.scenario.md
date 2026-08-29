---
service: public-reader
feature: UC-READ-05
priority: P1
type: boundary
tier: holdout
---

# A revoked link is dead at an edge location that has never seen the document

Revoke a document, then request it from an edge location with no prior cache entry for that token, immediately after revocation. The first ever request at that point of presence must return the withdrawn page with its designed copy, not the document, because a cold cache falls through to a live check. Then confirm the withdrawn response is itself cached at that new location for the second request, reported as a hit.
