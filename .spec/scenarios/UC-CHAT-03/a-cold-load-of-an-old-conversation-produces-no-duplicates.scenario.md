---
service: agent-chat
feature: UC-CHAT-03
priority: P1
type: boundary
tier: holdout
---

# A cold load of an old conversation produces no duplicates

From a browser profile that has never seen the application, sign in and open a conversation from six weeks ago containing twelve records. On first paint, count cards by record id: twelve cards, one each, all carrying their real content. No card may briefly render twice during hydration and then reconcile - record the paint sequence and assert on it, because a duplicate that exists for 200 milliseconds is the same architectural defect as one that persists.
