---
service: archive-library
feature: UC-LIB-02
priority: P1
type: happy_path
tier: visible
ac_ref: AC-4
test_tier: e2e
start_state: {"description": "Library with 4 chips and the query `latency` applied against the seeded 200-document archive", "seed_method": "cli", "records": ["`holo.ts seed:e2e --reset` writes 200 document rows", "the filtered view shows fewer than 20 rows before clearing"]}
action: {"actor": "user", "steps": ["Activate the clear control exactly once and read the chip set, the query input, the row count and the URL"]}
end_state: {"must_observe": ["`0` chips applied after `1` interaction", "a query input of `0` characters", "the full archive count of `200` restored", "the URL `==` the unfiltered `/library` address with `0` filter parameters"], "must_not_observe": ["chips still applied after the clear", "a filter parameter left in the URL", "an empty result list after clearing", "more than 1 interaction required to clear all filters"]}
negative_control: {"would_fail_if": ["clear removes only the chip the control is nearest to, leaving the rest applied", "the query state persists in the URL and is re-applied on the next render", "clear resets the visible chips but not the underlying request, so the row set is unchanged"]}
evidence: {"artifact_type": "screenshot", "required_capture": true}
---

# Everything clears in one action

With four chips and a query applied, press the clear control once. All chips must drop, the query must clear, and the full unfiltered archive must return with its total count. This must take exactly one interaction - not one press per chip - and the URL must return to the unfiltered Library address so the state is not stranded in a query string the operator cannot see.
