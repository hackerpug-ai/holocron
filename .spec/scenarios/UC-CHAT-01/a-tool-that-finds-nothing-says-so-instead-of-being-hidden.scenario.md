---
service: agent-chat
feature: UC-CHAT-01
priority: P1
type: edge_case
tier: holdout
---

# A tool that finds nothing says so instead of being hidden

Ask a question whose archive search genuinely returns zero rows, such as a topic that does not exist in the seeded fixture set. The tool line must still render as one collapsed line, and must state zero results rather than being suppressed because it was uninteresting. The answer must acknowledge in prose that nothing was found rather than producing a confident summary of documents that do not exist. A transcript that hides empty calls is a transcript that cannot be used to debug a wrong answer.
