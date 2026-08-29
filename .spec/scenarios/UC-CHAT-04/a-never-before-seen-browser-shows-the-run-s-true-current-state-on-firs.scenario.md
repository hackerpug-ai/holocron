---
service: agent-chat
feature: UC-CHAT-04
priority: P1
type: boundary
tier: holdout
---

# A never-before-seen browser shows the run's true current state on first paint

Start a long run in one browser, then open the same conversation in a second browser profile that has never seen this application, with a cold worker. The card must render the run's actual current state on first paint - not a default filling animation that then corrects itself, and not an empty slot that populates a second later. Repeat once while the run is finished and once while it is cancelled, and confirm the painted state matches the platform's stored state each time.
