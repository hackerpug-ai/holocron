---
service: operator-shell
feature: UC-SHELL-02
priority: P0
type: happy_path
tier: visible
ac_ref: AC-1
test_tier: e2e
start_state: {"description": "Operator signed in against an archive of 200 seeded documents, then the device platform process stopped and the tunnel closed for real", "seed_method": "cli", "records": ["`holo.ts seed:e2e --reset` writes 200 document rows before the platform is stopped", "the platform process is not running and the tunnel refuses connections at the moment of the request"]}
action: {"actor": "user", "steps": ["Open Library, then open Chats and send the question `what did the March transcript say`", "Restart the device platform, then press the retry control on each screen without navigating away"]}
end_state: {"must_observe": ["Library copy naming the archive host as not answering, of length `> 20` characters", "a retry control labelled `Retry` on both Library and Chats", "the Chats turn marked `failed` with the same named condition", "`200` document rows in Library after retry, with the route unchanged", "`1` completed Chats turn after retry"], "must_not_observe": ["an empty-archive state or the copy `No documents`", "a result count of 0 presented as a genuine answer", "an undifferentiated `Something went wrong` message", "a redirect away from the current route in order to recover"]}
negative_control: {"would_fail_if": ["a failed fetch is mapped to an empty array, so an unreachable archive renders as an empty archive \u2014 the exact confusion the operator reports as data loss", "the error branch is a generic static toast with no named condition", "retry is a no-op that does not re-issue the request"]}
evidence: {"artifact_type": "screenshot", "required_capture": true}
---

# An unreachable device is named on both destinations and retried in place

With the operator signed in, stop the device platform process and close the tunnel. Open Library: it must state that the device is not answering, in words a human reads as such, and must not render an empty archive, a zero-results state, or a generic error. Open Chats and send a question: the turn must fail with the same named condition. Restart the device, then press the retry control offered on each screen without navigating away: Library must populate with the seeded documents and Chats must complete a turn.
