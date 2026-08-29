---
service: agent-chat
feature: UC-CHAT-02
priority: P0
type: security
tier: holdout
---

# The palette keystroke does nothing on the public reader

Open a shared document on the docs host as an unauthenticated stranger and press the palette keystroke, then type a slash. Nothing may open, no prompt input may exist, and no operator command surface may be reachable from the public page in any form, while the document's 4,200 words stay fully rendered. Confirm the public page ships no command registry and no palette handler by inspecting the delivered client payload.
