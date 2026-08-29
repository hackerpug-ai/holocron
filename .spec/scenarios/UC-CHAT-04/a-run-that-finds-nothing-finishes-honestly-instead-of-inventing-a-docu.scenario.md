---
service: agent-chat
feature: UC-CHAT-04
priority: P1
type: edge_case
tier: holdout
---

# A run that finds nothing finishes honestly instead of inventing a document

Dispatch a deep research run on a deliberately unanswerable topic so that it completes with no document produced. The card must reach a finished state whose copy states that no document resulted, and must offer no open-document action that leads nowhere. No placeholder document row may appear in the Library, and the Library count must be unchanged from the 200 rows it held before the run.
