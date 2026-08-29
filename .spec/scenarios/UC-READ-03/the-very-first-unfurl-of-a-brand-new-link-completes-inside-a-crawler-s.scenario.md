---
service: public-reader
feature: UC-READ-03
priority: P1
type: boundary
tier: holdout
---

# The very first unfurl of a brand-new link completes inside a crawler's patience

Mint a share link for a document nobody has ever opened, so the edge has no cached copy anywhere, and immediately fetch it with a crawler user agent while timing the response. Complete metadata with the real title and a real description must arrive in under five seconds on the first request, with no redirect chain longer than one hop. This is the common case in practice - the operator pastes the link seconds after creating it - and it is the case a warm-cache-only implementation silently fails.
