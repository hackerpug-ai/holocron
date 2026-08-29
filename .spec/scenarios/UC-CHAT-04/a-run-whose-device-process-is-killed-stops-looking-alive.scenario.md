---
service: agent-chat
feature: UC-CHAT-04
priority: P0
type: error_handling
tier: holdout
---

# A run whose device process is killed stops looking alive

Start a deep research run, let the card reach a visibly working state, then kill the device job process outright so no completion or failure is ever reported. Watch the card for two minutes. It must stop advancing and must name in real copy that its state is stale or that the archive host stopped answering. If the card's animation continues at the same rhythm it had while the run was healthy, this scenario fails: an animation identical for a live and a dead run is the defect, and it is the one that teaches the operator to distrust every future card.
