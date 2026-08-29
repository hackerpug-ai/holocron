---
service: agent-chat
feature: UC-CHAT-04
priority: P0
type: happy_path
tier: visible
ac_ref: AC-1
test_tier: e2e
start_state: {"description": "Operator signed in with the device platform awake, a real model provider credential configured, an archive of 200 documents, and 0 jobs currently running", "seed_method": "cli", "records": ["`holo.ts seed:e2e --reset` writes 200 document rows", "the platform job table holds 0 running jobs at the start"]}
action: {"actor": "user", "steps": ["Send `/deep-research inference cost per token across hosted providers, 2026`", "Close the browser tab entirely, wait 5 minutes while polling the platform job state, then reopen the conversation in a new context", "When the job reaches a finished state, activate the open control on the card once"]}
end_state: {"must_observe": ["a dispatch acknowledgement plus a card carrying the run's record id within `2` seconds of send", "`1` job created on the platform with that record id", "the platform job state advancing during the `5` minutes when `0` browser clients are connected", "`1` activation opening the finished document, whose id is also present in the Library listing and in Postgres"], "must_not_observe": ["the browser holding an open request in place of a dispatched job", "0 jobs on the platform after the send", "job state frozen at the moment the tab closed", "a finished run whose document is absent from the Library"]}
negative_control: {"would_fail_if": ["the run lives inside the browser request, so closing the tab kills it and the platform job state stops advancing", "the acknowledgement is a static optimistic message with no job actually created on the device", "the finished document is never written to the archive, so the card links to nothing"]}
evidence: {"artifact_type": "db_query", "required_capture": true}
---

# A deep research run is dispatched, survives the tab, and lands in the Library

Send /deep-research with the topic 'inference cost per token across hosted providers, 2026'. Within two seconds the transcript must show an acknowledgement that the run was dispatched to the device, with a card carrying the run's record id. Close the tab entirely, wait, and reopen the conversation: the card must be present and progressing or finished, and the device platform must show the job still running throughout. When it finishes, open the resulting document from the card in a single action and confirm the same document id is present in the Library.
