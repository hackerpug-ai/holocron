---
service: share-lifecycle
feature: UC-SHARE-01
priority: P1
type: edge_case
tier: holdout
---

# An almost-empty document publishes to something honest

Publish a document whose body is a single sentence and which has no title. Open the resulting public URL. Either the page renders that one sentence with an honest fallback header carrying real copy, or the share is refused with a stated reason before a token is minted. What must not happen is a live token whose public page shows an empty article, a header reading 'undefined', or a document that a recipient would read as broken - the operator would send that link without knowing.
