---
service: public-reader
feature: UC-READ-05
priority: P0
type: security
tier: holdout
---

# A token that never existed is indistinguishable from a token that was withdrawn

Request /d/share-this-token-was-never-minted-0000 and compare the response byte for byte against the response for a genuinely revoked token. Status, visible copy and cache headers must match exactly, and both must carry the real withdrawn copy rather than nothing. Any difference - a different message, a different status, a different response time beyond noise - lets an attacker enumerate which tokens once existed. The page must also never disclose the document's title, author, or the date of withdrawal.
