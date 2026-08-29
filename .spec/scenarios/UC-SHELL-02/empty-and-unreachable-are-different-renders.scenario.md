---
service: operator-shell
feature: UC-SHELL-02
priority: P0
type: error_handling
tier: visible
ac_ref: AC-4
test_tier: e2e
start_state: {"description": "Two real runs: run A has the platform awake with an archive of 0 documents; run B has an archive of 200 documents with the platform stopped", "seed_method": "cli", "records": ["run A: `holo.ts seed:e2e --reset --no-documents` leaves 0 document rows with the platform answering", "run B: 200 document rows exist but the platform process is stopped"]}
action: {"actor": "user", "steps": ["Open Library in run A and capture the rendered copy and controls", "Open Library in run B and capture the rendered copy and controls"]}
end_state: {"must_observe": ["run A copy naming an empty archive, of length `> 15` characters", "run B copy naming the archive host as unreachable, of length `> 20` characters", "the 2 copy strings differing from each other", "a retry control labelled `Retry` in run B and `0` retry controls in run A"], "must_not_observe": ["the same `No documents` string in both runs", "a retry control offered on a genuinely empty archive", "0 characters of explanatory copy in either run"]}
negative_control: {"would_fail_if": ["both a failed fetch and an empty array route to the same empty-state component", "the unreachable branch is absent, so a disconnected archive falls through to the empty render", "the copy is a single hardcoded string reused for every zero-row outcome"]}
evidence: {"artifact_type": "screenshot", "required_capture": true}
---

# Empty and unreachable are different renders

Capture the Library render in two states: device up with an archive of zero documents, and device down with an archive of 200 documents. The two renders must differ in visible copy, and the unreachable render must offer retry while the empty render must not. Assert on the actual strings: an implementation that maps both a failed fetch and an empty array to the same 'No documents' component fails here, and that is exactly the failure the operator reported as data loss.
