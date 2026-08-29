---
service: share-lifecycle
feature: UC-SHARE-01
priority: P1
type: boundary
tier: holdout
---

# The first share of a fresh session takes the operator all the way to the stranger's page

From a browser profile that has never used the application and a cold worker, sign in, find a document, share it, copy the link, and open the real public URL in a new tab - all as one uninterrupted first-run sequence. The public page must render fully with all five of its figures on that first ever request, before any edge cache exists for it. This is the exact path the operator will take the first time he trusts the product with a real recipient.
