---
service: share-lifecycle
feature: UC-SHARE-01
priority: P0
type: error_handling
tier: holdout
---

# A share that failed on the device is never shown as shared

Stop the device platform, then press the share toggle. The row must not enter a shared state, no URL may be presented, and the copy control must not offer a link. The failure must be named in real copy. Restart the platform and confirm the document's share state in Postgres is still unshared, then toggle successfully and confirm the row and the database agree. An optimistic UI that shows a token before the write lands hands the operator a URL that resolves to nothing, which is worse than a failed toggle.
