---
service: share-lifecycle
feature: UC-SHARE-02
priority: P1
type: boundary
tier: holdout
---

# Share state is correct on first paint, with no flash of the wrong answer

From a cold profile and a cold worker, load a Library of 200 rows and record the paint sequence frame by frame. Every row's share state must be correct in the first painted frame, with all seven public rows marked. A pass where all rows first render unshared and then seven flip to shared fails: a screenshot taken during that window is a wrong answer to a security question, and the operator takes exactly that kind of glance.
