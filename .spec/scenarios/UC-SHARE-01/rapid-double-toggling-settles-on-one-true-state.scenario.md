---
service: share-lifecycle
feature: UC-SHARE-01
priority: P1
type: edge_case
tier: holdout
---

# Rapid double-toggling settles on one true state

Press the share toggle six times in two seconds, ending on the on position. After the dust settles, the row must show shared, the database must hold exactly one active token, and the public URL must resolve to the document with all 4,200 words. Repeat ending on the off position: the row must show unshared and the URL must resolve to the withdrawn page. No sequence may leave the row and the database disagreeing, and no sequence may create a second token.
