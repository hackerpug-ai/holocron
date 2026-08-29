---
service: agent-chat
feature: UC-CHAT-03
priority: P0
type: security
tier: holdout
---

# The stream carries references, never contents

Capture every frame the client receives during a turn that produces two records. Inspect the payloads: record frames may carry only a kind and an id, plus invalidation frames carrying the same pair. No frame may contain a document body, a research result payload, a title, or a snippet. Then verify the negative case: block the record query endpoint while allowing the stream, and confirm the card cannot render its contents. If a card still renders full content with the query blocked, the stream is carrying contents and the duplication defect can return.
