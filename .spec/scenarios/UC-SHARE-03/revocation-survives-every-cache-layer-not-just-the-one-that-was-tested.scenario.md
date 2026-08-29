---
service: share-lifecycle
feature: UC-SHARE-03
priority: P0
type: security
tier: holdout
---

# Revocation survives every cache layer, not just the one that was tested

Before revoking, request the document from three different edge locations so it is cached in each, confirming all three serve the full 4,200 words. Revoke. Then poll all three locations plus a request with a cache-busting query string plus a request from a browser with a warm disk cache. Every one must return the withdrawn page within the stated bound. Inspect the live response headers on the document itself: both Cache-Control and Cloudflare-CDN-Cache-Control must be present with a max-age no greater than sixty seconds. A deployment that sets only the standard header inherits the zone's default edge TTL, and the link stays readable all afternoon while the operator believes it is dead.
