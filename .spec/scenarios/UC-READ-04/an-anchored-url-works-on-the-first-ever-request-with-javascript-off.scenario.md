---
service: public-reader
feature: UC-READ-04
priority: P1
type: boundary
tier: holdout
---

# An anchored URL works on the first ever request with JavaScript off

Purge the edge cache, disable JavaScript, and request a deep-linked section URL directly from a fresh profile. All 14 heading ids must be present in the HTML on the wire and the browser's native fragment scrolling must land the reader on the named section without any client script running. If anchors are assigned by a hydration pass, this first-request cold-boot case is exactly where a forwarded section link will fail.
