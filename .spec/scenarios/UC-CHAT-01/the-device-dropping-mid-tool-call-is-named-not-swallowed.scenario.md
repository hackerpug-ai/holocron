---
service: agent-chat
feature: UC-CHAT-01
priority: P0
type: error_handling
tier: holdout
---

# The device dropping mid-tool-call is named, not swallowed

Start a multi-tool turn and stop the device platform after the first tool line renders. The transcript must mark the turn as failed with the archive host named as the cause, the completed tool line must remain visible with its real result count, and the answer must not end mid-sentence as though it had finished. Cancel must not still be presented as available on a turn that is already dead, and no retry must fire automatically against a machine that is asleep.
