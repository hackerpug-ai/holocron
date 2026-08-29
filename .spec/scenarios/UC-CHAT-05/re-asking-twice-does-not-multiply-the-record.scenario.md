---
service: agent-chat
feature: UC-CHAT-05
priority: P1
type: edge_case
tier: holdout
---

# Re-asking twice does not multiply the record

Interrupt a turn, press re-ask, and interrupt the replacement too. Then press re-ask on both. The transcript must remain readable as a sequence of distinct attempts with distinct outcomes, each carrying its own prompt text; it must not accumulate duplicate cards for the same record, must not stack two live turns at once, and must not lose the original question text after the second re-ask. Count cards by record id at the end: still one card per record.
