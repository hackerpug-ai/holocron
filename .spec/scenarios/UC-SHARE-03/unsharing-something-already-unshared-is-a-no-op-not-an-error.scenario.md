---
service: share-lifecycle
feature: UC-SHARE-03
priority: P1
type: edge_case
tier: holdout
---

# Unsharing something already unshared is a no-op, not an error

Press unshare on a document that is already unshared, then press it twice more in quick succession, then unshare from two browsers at the same instant. Every case must leave the document unshared with no error dialog, no duplicate state, and no row stuck mid-transition. The stated bound must be shown consistently rather than restarting a countdown that implies the document was live again in between.
