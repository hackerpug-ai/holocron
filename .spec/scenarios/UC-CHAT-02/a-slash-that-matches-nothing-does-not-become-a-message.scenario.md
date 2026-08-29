---
service: agent-chat
feature: UC-CHAT-02
priority: P1
type: edge_case
tier: holdout
---

# A slash that matches nothing does not become a message

Type /zzz into the prompt input with the palette open. The palette must show an explicit no-match state carrying real copy rather than an empty floating box. Press Enter: the client must not send /zzz to the agent as a bare message and must not silently do nothing with no explanation - the operator must be told the command is unknown. Then type a slash mid-sentence, as in 'compare a/b testing', and confirm the palette does not hijack it and the sentence submits intact.
