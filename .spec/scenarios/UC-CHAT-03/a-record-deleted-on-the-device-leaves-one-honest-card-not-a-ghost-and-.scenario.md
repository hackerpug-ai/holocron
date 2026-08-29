---
service: agent-chat
feature: UC-CHAT-03
priority: P1
type: edge_case
tier: holdout
---

# A record deleted on the device leaves one honest card, not a ghost and not a twin

With a card rendered for a document record, delete that record from the device Postgres and trigger the invalidation. Exactly one card must remain in that position, and it must state in real copy that the record is no longer available. There must not be two cards, a card frozen on stale content, or a silently vanished card that leaves an unexplained gap in a transcript the operator reads as memory.
