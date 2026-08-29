---
service: agent-chat
feature: UC-CHAT-05
priority: P0
type: security
tier: holdout
---

# Interruption state is not a browser-local opinion

Interrupt a turn, then open the same conversation from a completely different machine and browser. The interrupted marker must be present there too with the original prompt intact, because it is a property of the record and not of the tab that was closed. Also confirm the re-ask control on another conversation's interrupted turn cannot be triggered with a substituted turn id.
