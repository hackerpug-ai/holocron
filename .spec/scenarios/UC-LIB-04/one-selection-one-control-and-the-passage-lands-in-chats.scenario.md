---
service: archive-library
feature: UC-LIB-04
priority: P0
type: happy_path
tier: visible
ac_ref: AC-2
test_tier: e2e
start_state: {"description": "`Edge Inference Cost Curves` open in the reading column at 1440px, scrolled to paragraph 14 which contains the sentence `Batch size above 32 stops improving throughput on the smaller node.`", "seed_method": "cli", "records": ["`holo.ts seed:e2e --reset` writes the document containing that exact sentence", "the device platform is awake with a real model provider credential configured"]}
action: {"actor": "user", "steps": ["Select that sentence, count the controls offered at the selection, and activate the single one", "Type `why would that be` in Chats and send, then navigate back to the document"]}
end_state: {"must_observe": ["exactly `1` control offered on the selection", "Chats opening with the sentence `Batch size above 32 stops improving throughput on the smaller node.` quoted verbatim as context", "the source document identified by title `Edge Inference Cost Curves` and by id in the dispatched request payload", "an answer naming `Edge Inference Cost Curves` and referring to the quoted sentence", "the restored scroll position within `50` px of the departure value"], "must_not_observe": ["0 controls appearing on a real selection", "2 or more controls on the selection", "an empty quote arriving in Chats", "the source document missing from the request payload", "the document reopening at scrollY 0"]}
negative_control: {"would_fail_if": ["the quote is passed as display text only and omitted from the request payload, so the answer addresses the wrong thing", "the source document id is dropped in transit, leaving the passage unattributed", "scroll position is never captured, so return lands at the top of a 4,200-word document"]}
evidence: {"artifact_type": "api_response", "required_capture": true}
---

# One selection, one control, and the passage lands in Chats

In the reading column, scroll to paragraph 14 and select the sentence 'Batch size above 32 stops improving throughput on the smaller node.' Exactly one control must appear at the selection, labelled to mean 'ask about this'. Activate it: Chats must open with that sentence quoted as context and the source document named by title, with the caret already in the input. Type 'why would that be' and send: the answer must refer to the quoted sentence and name the source document. Return to the document and land within 50 pixels of the scroll position that was left.
