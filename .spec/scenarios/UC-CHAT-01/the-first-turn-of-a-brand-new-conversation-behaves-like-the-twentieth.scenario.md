---
service: agent-chat
feature: UC-CHAT-01
priority: P1
type: boundary
tier: holdout
---

# The first turn of a brand-new conversation behaves like the twentieth

From a fresh browser profile against a cold worker, sign in and send the very first message of the operator's very first conversation. Streaming must begin and produce a real answer, tool lines must render collapsed with their result counts, and cancel must be available - all without any prior conversation state existing. Confirm no client-side cache warm-up is required by repeating with storage disabled between the sign-in and the send.
