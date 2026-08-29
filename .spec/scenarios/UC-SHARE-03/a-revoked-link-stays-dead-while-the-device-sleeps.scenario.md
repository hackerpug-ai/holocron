---
service: share-lifecycle
feature: UC-SHARE-03
priority: P0
type: error_handling
tier: holdout
---

# A revoked link stays dead while the device sleeps

Revoke a widely-forwarded document, then stop the device platform and close the tunnel. Request the link 100 times from three edge locations. Every response must be the withdrawn page with its designed copy, served from the edge, and the platform access log must show zero requests for that token once it comes back up. A withdrawn response that is not itself cacheable turns every stale reader into load on a sleeping machine, and a revocation that cannot be served without the origin can fail open.
