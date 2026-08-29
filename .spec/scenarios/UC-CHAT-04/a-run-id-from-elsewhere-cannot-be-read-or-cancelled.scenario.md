---
service: agent-chat
feature: UC-CHAT-04
priority: P0
type: security
tier: holdout
---

# A run id from elsewhere cannot be read or cancelled

Take the record id of a run belonging to a different conversation, and one belonging to a different owner entirely in the seeded fixture set. Issue read and cancel calls for both directly against the application's own endpoints with the operator's real session. Both must be refused, and the refusal must not disclose whether the id exists. Confirm the device platform log shows the targeted runs still in their original states and that no cancellation was attempted for either.
