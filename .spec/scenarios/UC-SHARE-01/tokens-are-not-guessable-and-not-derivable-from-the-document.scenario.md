---
service: share-lifecycle
feature: UC-SHARE-01
priority: P0
type: security
tier: holdout
---

# Tokens are not guessable and not derivable from the document

Mint tokens for twenty seeded documents and inspect them. None may contain the document id, title slug, or a sequential counter, and all must carry at least 128 bits of entropy. Then take a valid token and mutate one character in ten different positions, requesting each: all ten must return the withdrawn page with its designed copy. Confirm the device platform log records no successful document lookup for any mutation.
