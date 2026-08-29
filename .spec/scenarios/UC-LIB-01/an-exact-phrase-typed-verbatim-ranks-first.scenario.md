---
service: archive-library
feature: UC-LIB-01
priority: P0
type: boundary
tier: visible
ac_ref: AC-2
test_tier: e2e
start_state: {"description": "Seeded archive of 200 documents, one of which contains the exact sentence `Batch size above 32 stops improving throughput on the smaller node`", "seed_method": "cli", "records": ["`holo.ts seed:e2e --reset` writes that sentence into exactly 1 document body", "at least 3 other documents discuss batching semantically without that wording"]}
action: {"actor": "user", "steps": ["Paste the exact 11-word sentence into Library search and read the ranked result list"]}
end_state: {"must_observe": ["the source document at rank `1`", "the rank-1 row visible without scrolling on a 1440x900 viewport", "a snippet on that row containing `Batch size above 32`"], "must_not_observe": ["the source document absent from the first screen", "0 results for a verbatim phrase present in the archive", "a semantically similar non-match outranking the exact match"]}
negative_control: {"would_fail_if": ["ranking is semantic-only, so the verbatim match is buried below paraphrases", "the query is passed to a stub that returns the most recent documents regardless of terms", "the result list is a static ordering disconnected from the query"]}
evidence: {"artifact_type": "screenshot", "required_capture": true}
---

# An exact phrase typed verbatim ranks first

Copy the exact eleven-word sentence 'Batch size above 32 stops improving throughput on the smaller node' out of a seeded document and paste it verbatim into search. The source document must be the first result on the first screen without scrolling. This is the case where a purely semantic ranker fails: assert the rank position, not merely presence in the result set.
