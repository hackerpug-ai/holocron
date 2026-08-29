---
service: public-reader
feature: UC-READ-04
priority: P1
type: edge_case
tier: visible
ac_ref: AC-3
test_tier: e2e
start_state: {"description": "`share-e2e-long` published with 4,200 words, opened at a 390x844 viewport", "seed_method": "cli", "records": ["`holo.ts seed:e2e --reset` writes a document whose rendered height at 390px exceeds 20 viewports", "the document is public at token `share-e2e-long`"]}
action: {"actor": "user", "steps": ["Sample the progress element at 10 scroll positions from top to bottom at 390x844", "Repeat the full sweep with `prefers-reduced-motion: reduce`"]}
end_state: {"must_observe": ["progress value `<= 2%` at scrollY `0`", "progress value `>= 98%` at the document end", "a monotonically non-decreasing series across all `10` samples", "the same `10`-sample series under `prefers-reduced-motion: reduce`"], "must_not_observe": ["0 progress elements on the page", "a progress value that never changes across the 10 samples", "the progress rail rendered inside the reading measure"]}
negative_control: {"would_fail_if": ["the rail is a static bar with no scroll listener bound", "progress is a hardcoded percentage rather than computed from scroll position", "the rail is removed entirely under reduced motion, leaving 0 signal"]}
evidence: {"artifact_type": "screenshot", "required_capture": true}
---

# A phone reader can tell how far through a long document they are

Open share-e2e-long on a 390x844 viewport. A progress signal must exist outside the reading measure - a thin rail at the page edge qualifies. At the top of the document it must read near zero; after scrolling to the last heading it must read near complete; the values must move monotonically with scroll. With prefers-reduced-motion enabled the rail must still update, just without animated transitions.
