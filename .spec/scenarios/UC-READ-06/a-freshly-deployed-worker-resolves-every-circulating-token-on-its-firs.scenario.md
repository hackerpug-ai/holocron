---
service: public-reader
feature: UC-READ-06
priority: P1
type: boundary
tier: holdout
---

# A freshly deployed worker resolves every circulating token on its first request

Deploy the reader to a worker version that has never served traffic, purge all caches, and request the entire fixture set of twelve circulating tokens exactly once each, in parallel, with no warm-up. Every currently public token must return its document with real prose on that single cold request. No token may require a second attempt, and no response may depend on a cache entry that a first-ever deployment cannot have.
