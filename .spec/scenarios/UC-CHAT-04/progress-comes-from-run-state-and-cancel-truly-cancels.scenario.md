---
service: agent-chat
feature: UC-CHAT-04
priority: P0
type: error_handling
tier: visible
ac_ref: AC-3
test_tier: integration
start_state: {"description": "A real deep-research job in flight on the device platform, its card visible in the transcript, with the provider call log tailing", "seed_method": "public_api", "records": ["the platform reports the job in state `running` with a phase field and a last-updated timestamp", "the provider call log holds a recorded baseline count for this run"]}
action: {"actor": "user", "steps": ["Read the fields backing the card's progress rendering from source and from the live payload", "Press cancel on the card and capture the platform log and provider call log across the boundary"]}
end_state: {"must_observe": ["every progress element deriving from a device-reported run-state field such as `phase`, `step` or `updated_at`", "`0` elapsed-wall-clock timer inputs feeding the progress rendering", "the card reaching state `cancelled` within `5` seconds of the press", "`0` provider calls billed for that run after the cancel timestamp"], "must_not_observe": ["a `setInterval` or elapsed-time value driving the progress animation", "an empty run-state payload behind a fully animated card", "provider calls in the log after the cancel timestamp"]}
negative_control: {"would_fail_if": ["progress is driven by a timer, so the animation is identical for a live and a dead run \u2014 the defect that teaches distrust of every future card", "cancel is a client-side no-op that hides the card while the device job keeps spending", "the card animates from a static loop disconnected from the reported run state"]}
evidence: {"artifact_type": "event_log", "required_capture": true}
---

# Progress comes from run state, and cancel truly cancels

While a run is in flight, read the fields backing the card's progress and confirm every visible element derives from reported run state - phase, step count, or last-updated timestamp from the device - and none from elapsed wall-clock time in the browser. Then press cancel on the card: within five seconds the card must reach a cancelled state, and the device platform log must show the job terminated with no further provider calls billed after that point.
