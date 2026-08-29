---
service: agent-chat
feature: UC-CHAT-04
priority: P1
type: edge_case
tier: holdout
---

# Cancelling twice, and cancelling something already done, are harmless

Press cancel twice in rapid succession on a running card, then press cancel on a card whose run already finished, then press cancel on a card whose run already failed. None may produce an error dialog, a second cancelled state, a duplicate card, or a request that the device rejects with a 500. A finished run must keep its finished state and its document link intact, because the transcript is a record and a record must not be rewritten by a late click.
