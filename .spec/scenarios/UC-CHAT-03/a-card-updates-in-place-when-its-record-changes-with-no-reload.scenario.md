---
service: agent-chat
feature: UC-CHAT-03
priority: P0
type: edge_case
tier: visible
ac_ref: AC-2
test_tier: e2e
start_state: {"description": "A conversation holding 6 records, one of them a research record in state `running` with its card visible on screen", "seed_method": "public_api", "records": ["the research record row reads state `running` at the start", "exactly 1 card is rendered for that record id"]}
action: {"actor": "background_job", "steps": ["Mutate the record to state `complete` through the real platform API, not through the browser", "Then reload the page and reopen the conversation from the conversation list"]}
end_state: {"must_observe": ["the card showing state `complete` within the invalidation window with `0` page reloads", "still exactly `1` card for that record id after the update", "after the reload, all `6` records rendering `1` card each in the states stored in Postgres"], "must_not_observe": ["a second card appearing beside the updated one", "the card still reading `running` after the record changed", "an empty card body after the state transition"]}
negative_control: {"would_fail_if": ["the card renders from the stored message payload, so a record change leaves it stale until a reload", "the invalidation is dropped, so the surface is disconnected from the record store", "the update path appends a new card instead of re-rendering the existing one"]}
evidence: {"artifact_type": "db_query", "required_capture": true}
---

# A card updates in place when its record changes, with no reload

With a card visible for a research record in a running state, change that record's state on the device directly - through the platform API, not through the browser. Within the invalidation window the card must move to the new state in place, without a page reload and without a second card appearing beside it. Then reload the page and reopen the conversation from the Library of conversations: the same six cards must be present in the same states, proving the transcript is rendered from records rather than from stored message content.
