---
service: agent-chat
feature: UC-CHAT-05
priority: P1
type: edge_case
tier: visible
ac_ref: AC-4
test_tier: integration
start_state: {"description": "Two real turns: turn A interrupted after 1 document record was created, turn B interrupted before any record existed", "seed_method": "public_api", "records": ["Postgres holds 1 document record created by turn A before its interruption", "Postgres holds 0 records for turn B"]}
action: {"actor": "user", "steps": ["Open the transcript and read the interrupted markers and record surfaces for both turn A and turn B"]}
end_state: {"must_observe": ["turn A showing exactly `1` card for the surviving record, matching the row in Postgres", "turn B carrying copy stating that `0` records were produced", "both turns carrying the `interrupted` marker", "the 2 turns rendering distinguishably from each other"], "must_not_observe": ["turn A rendering 0 cards for a record the database holds", "turn B implying a record was produced", "an empty interrupted turn with no explanation in either case"]}
negative_control: {"would_fail_if": ["surviving records are omitted from an interrupted turn, so the operator cannot tell what actually ran", "both cases render the same static interrupted banner with no record surface", "the record surface is disconnected from the store and always claims nothing survived"]}
evidence: {"artifact_type": "db_query", "required_capture": true}
---

# The transcript states what survived the interruption

Run a turn that creates one document record and then interrupt it after that record exists but before the answer completes. The interrupted turn must show that the document record survived, with its card rendered once from the record. Run a second turn interrupted before any record is produced: that turn must state that nothing was produced. The operator must be able to tell these two cases apart without opening the Library.
