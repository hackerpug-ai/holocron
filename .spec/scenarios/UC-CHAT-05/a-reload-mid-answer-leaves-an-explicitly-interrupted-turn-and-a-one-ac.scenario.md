---
service: agent-chat
feature: UC-CHAT-05
priority: P0
type: happy_path
tier: visible
ac_ref: AC-1
test_tier: e2e
start_state: {"description": "A conversation with a real streaming turn in flight, driven by a real model provider, whose prompt was `summarise the March pricing transcript in detail`", "seed_method": "public_api", "records": ["the turn row exists on the platform in state `streaming`", "approximately 200 words have streamed into the transcript at the moment of the reload"]}
action: {"actor": "user", "steps": ["Hard-reload the page after roughly 200 words have streamed", "Activate the re-ask control on the interrupted turn once and capture the dispatched prompt"]}
end_state: {"must_observe": ["the turn carrying an explicit `interrupted` marker after the reload, persisted server-side", "the original prompt text `summarise the March pricing transcript in detail` still present in the transcript", "`1` activation dispatching a new turn whose prompt is byte-identical to the original", "at least `1` new streamed token on the re-asked turn"], "must_not_observe": ["the turn absent from the transcript after the reload", "an empty assistant bubble with no marker", "the partial answer presented with completed-turn styling", "a re-ask that sends a different or empty prompt"]}
negative_control: {"would_fail_if": ["interruption state is browser-local, so a reload leaves no record and the turn is simply gone", "the truncated text is rendered as a completed answer, so the operator reads an unfinished answer as finished", "the re-ask control is a static button with no prompt bound to it"]}
evidence: {"artifact_type": "screenshot", "required_capture": true}
---

# A reload mid-answer leaves an explicitly interrupted turn and a one-action re-ask

Send a question that produces a long streamed answer. After roughly 200 words have streamed, hard-reload the page. The transcript must show that turn explicitly marked as interrupted, visually and in words, distinguishable at a glance from a completed turn. The partial text may remain, but it must never read as a finished answer - no completed-turn affordance, no final-answer styling. A re-ask control on that turn must resend the original question without the operator retyping a character.
