---
service: agent-chat
feature: UC-CHAT-03
priority: P1
type: error_handling
tier: holdout
---

# A reference to an id that does not resolve renders once and says so

Inject a record reference for an id that has never existed into a live stream. The transcript must render exactly one placeholder for it, carrying copy naming that the record could not be resolved. It must not render zero elements and leave the answer referring to something invisible, must not render two, must not throw and blank the transcript, and must not retry in a tight loop against the platform.
