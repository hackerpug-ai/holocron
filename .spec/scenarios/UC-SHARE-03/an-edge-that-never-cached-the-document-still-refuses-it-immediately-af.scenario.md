---
service: share-lifecycle
feature: UC-SHARE-03
priority: P1
type: boundary
tier: holdout
---

# An edge that never cached the document still refuses it immediately after revocation

Revoke a document, then request it from an edge location that has never held a copy, within five seconds of the revocation. That first ever request at that location must return the withdrawn page with its real copy rather than fetching a live document, because a cold cache goes to the source of truth. Then confirm the withdrawn response is cached there for the next request, reported as a hit.
