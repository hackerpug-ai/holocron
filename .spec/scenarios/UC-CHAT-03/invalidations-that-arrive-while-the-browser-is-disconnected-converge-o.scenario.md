---
service: agent-chat
feature: UC-CHAT-03
priority: P0
type: error_handling
tier: holdout
---

# Invalidations that arrive while the browser is disconnected converge on one current card

With a conversation open, drop the network, change two records on the device three times each, then restore the network. After reconnection each record must have exactly one card, each showing its final state as stored in Postgres, with no duplicates created by replayed invalidations and no card stuck on the state it held before the disconnect. Repeat with the tab backgrounded for two minutes rather than disconnected.
