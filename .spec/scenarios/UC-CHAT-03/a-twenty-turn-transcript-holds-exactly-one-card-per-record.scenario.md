---
service: agent-chat
feature: UC-CHAT-03
priority: P0
type: happy_path
tier: visible
ac_ref: AC-1
test_tier: e2e
start_state: {"description": "A scripted conversation of 20 turns driven against the real device platform, of which 6 turns produce records: 3 research runs and 3 documents", "seed_method": "public_api", "records": ["the platform holds 6 record rows created by the 20-turn conversation", "each record row carries a distinct id"]}
action: {"actor": "user", "steps": ["Scroll the full transcript top to bottom and back, grouping rendered cards by record id after each traversal"]}
end_state: {"must_observe": ["exactly `6` record id groups", "exactly `1` rendered card in each of the `6` groups", "the same `6` groups of size `1` after the second traversal"], "must_not_observe": ["any record id mapping to 2 or more cards", "0 cards for a record the platform reports exists", "a card with no record id attached"]}
negative_control: {"would_fail_if": ["a record is rendered both as a stored message row and as a live record view, producing 2 cards \u2014 the exact defect the architecture change removes", "cards are keyed by array index rather than record id, so virtualisation duplicates them", "the transcript is a static list of stored message payloads disconnected from the record store"]}
evidence: {"artifact_type": "screenshot", "required_capture": true}
---

# A twenty-turn transcript holds exactly one card per record

Drive a conversation of twenty turns against the real device platform, of which six produce records - three research runs and three documents. Then count rendered cards by record id across the whole scrollback: each of the six record ids must appear exactly once, giving six cards total. Scroll to the top and back down and count again to confirm virtualisation has not duplicated anything. The historical defect this catches is a record rendered both as a stored message row and as a live record view.
