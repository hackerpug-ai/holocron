---
service: agent-chat
feature: UC-CHAT-01
priority: P1
type: edge_case
tier: holdout
---

# Degenerate prompts do not produce degenerate transcripts

Send, in sequence: an empty submission, a submission of only whitespace, a single character, and a 30,000-character paste. Empty and whitespace must not create a turn at all. The single character must produce a real turn with a real answer. The oversized paste must either be accepted and answered or refused with a clear stated limit - it must not silently truncate to something the operator did not ask, and it must not leave the input locked or the transcript holding a turn that never resolves.
