---
service: agent-chat
feature: UC-CHAT-05
priority: P1
type: edge_case
tier: holdout
---

# An interruption before the first token still leaves a turn behind

Send a question and reload after 300 milliseconds, before a single token has streamed. The operator's question must still be in the transcript in full, marked interrupted. What must not happen: the question vanishing entirely as though it were never asked, or an empty assistant bubble with no explanation sitting under it. The operator paid for that turn and must be able to see that he asked it.
