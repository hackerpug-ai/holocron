---
service: share-lifecycle
feature: UC-SHARE-02
priority: P0
type: edge_case
tier: visible
ac_ref: AC-3
test_tier: e2e
start_state: {"description": "Library open against the seeded archive with exactly 7 documents public and an 8th target document currently unshared", "seed_method": "cli", "records": ["`holo.ts seed:e2e --reset` writes 200 rows with 7 public", "the target row reads unshared at the start"]}
action: {"actor": "user", "steps": ["Toggle the 8th document public from its row with no page reload", "Return to that row and read its share affordance before taking any further action", "Toggle it back off"]}
end_state: {"must_observe": ["the row showing shared with `0` page reloads", "the shared filter count moving from `7` to `8`", "the row stating `Public` before any further share action", "the count returning to `7` after the off toggle, within the same interaction"], "must_not_observe": ["an empty share-state indicator on the toggled row", "a count still reading `7` after a successful share", "the row unchanged until a reload", "an already-public row whose control is indistinguishable from an unshared row's", "the UI showing shared while Postgres still reads `is_public = false`"]}
negative_control: {"would_fail_if": ["the row is not re-rendered after the write, so the operator re-shares something already public", "the count is a static value computed once at page load", "the UI state leads the database, so it claims shared on a write that never landed"]}
evidence: {"artifact_type": "db_query", "required_capture": true}
---

# A toggled row changes state immediately and warns against re-sharing

Toggle an eighth document public. Its row must show the new state without any page reload, and the shared filter count must move from seven to eight. Now return to that row: it must be readable as already public before any further share action, so the operator does not mint a second link for something already out. Toggle it back off and confirm the row and the count both return within the same interaction.
