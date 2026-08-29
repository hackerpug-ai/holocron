---
service: agent-chat
feature: UC-CHAT-01
priority: P0
type: error_handling
tier: visible
ac_ref: AC-4
test_tier: e2e
start_state: {"description": "A conversation with 0 prior turns, one archive tool deliberately pointed at an unavailable dependency so it genuinely fails, and the device platform log tailing", "seed_method": "cli", "records": ["`holo.ts seed:e2e --reset` writes 200 documents", "the browse tool's target endpoint is stopped, so its next invocation returns an error"]}
action: {"actor": "user", "steps": ["Send a question that provokes both a search and a browse call, and inspect the collapsed lines without expanding", "Expand the failed line, then collapse it again", "In a second turn with a long tool chain, press cancel after the 2nd tool line appears"]}
end_state: {"must_observe": ["the failed line carrying a `failed` marker while still collapsed", "the expanded line showing `2` sections, the input arguments and the error output, matching the platform log entry", "the `failed` marker still present after re-collapsing", "streaming stopping within `2` seconds of cancel and the turn marked `cancelled`", "`0` further tool or provider invocations in the platform log after the cancel timestamp"], "must_not_observe": ["a failed call rendered identically to a successful one while collapsed", "an empty expansion with 0 characters of input or output", "tool invocations in the platform log after cancel", "a turn that keeps streaming tokens after being marked cancelled"]}
negative_control: {"would_fail_if": ["the failure state is only rendered inside the expanded body, so a wrong answer reads as a confident one", "cancel is a client-side no-op that hides the stream while the device keeps spending", "the expansion is a static placeholder disconnected from the real invocation record"]}
evidence: {"artifact_type": "event_log", "required_capture": true}
---

# A failed tool is visible while collapsed, and cancel actually stops the run

Force one tool to fail by pointing it at an unavailable dependency mid-turn. Its collapsed line must show the failure without being expanded, distinguishably from a successful line. Expand it and confirm both input and output are readable, then collapse it again and confirm the failure marker persists. In a separate turn, send a question that provokes a long chain, press cancel after the second tool line appears, and confirm streaming stops within two seconds, the turn is marked cancelled, and the device platform log shows no further tool invocations for that run.
