---
service: agent-chat
feature: UC-CHAT-01
priority: P0
type: happy_path
tier: visible
ac_ref: AC-1
test_tier: e2e
start_state: {"description": "Operator signed in with an archive of 200 seeded documents including the March pricing transcript, the device platform awake behind the real tunnel, and a real model provider credential configured", "seed_method": "cli", "records": ["`holo.ts seed:e2e --reset` writes 200 documents, one titled `March pricing transcript`", "the conversation starts with 0 prior turns"]}
action: {"actor": "user", "steps": ["Send `What did the March pricing transcript say about usage tiers?` from the Chats prompt input", "Sample the DOM every 250ms for the duration of the turn"]}
end_state: {"must_observe": ["the first streamed token arriving with `0` approval controls having rendered at any sample", "at least `2` collapsed tool lines, each naming its tool and a result summary such as `searched holocron \u2014 12 results`", "the rendered tool-line count `==` the invocation count in the device platform log", "a completed assistant answer of at least `40` words"], "must_not_observe": ["any control labelled `Approve`, `Confirm` or `Run plan`", "a plan message rendered before execution", "0 tool lines for a turn the platform log shows made 2 invocations", "an empty assistant message"]}
negative_control: {"would_fail_if": ["the approval and plan message types from the existing pipeline are still reachable, so the turn stalls on a confirmation", "tool lines are omitted from the transcript, so the platform log and the rendered surface disagree", "the answer is a static canned string disconnected from the archive search"]}
evidence: {"artifact_type": "screenshot", "required_capture": true}
---

# A question executes immediately with visible, terse tool lines

Signed in with the real device platform and a real model provider configured, send: 'What did the March pricing transcript say about usage tiers?'. The first streamed token must appear without any intervening plan, confirmation, or per-tool approval affordance rendering at any point - assert on the absence of any approval control in the DOM for the whole turn. Each tool call must appear as exactly one collapsed line naming the tool and its result, for example a search line naming the tool and a result count. Expect at least two tool lines in this turn and exactly one line per underlying call.
