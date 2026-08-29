---
service: agent-chat
feature: UC-CHAT-02
priority: P2
type: boundary
tier: holdout
---

# The keystroke works before any conversation exists

On a first-run account with zero conversations, press the palette keystroke from the empty Chats destination and from the empty Library. Both must focus a working prompt input and offer the full six-command list. The palette must not depend on an active conversation id, and submitting a command from this state must create the first conversation and produce a real turn rather than failing on a missing parent.
