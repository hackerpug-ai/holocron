---
service: public-reader
feature: UC-READ-01
priority: P1
type: edge_case
tier: visible
ac_ref: AC-3
test_tier: e2e
start_state: {"description": "`share-e2e-figures` published, its third figure captioned `Provider matrix` stored at 2400x1600", "seed_method": "cli", "records": ["asset `a3` is a 2400x1600 PNG with caption `Provider matrix`", "the document is public at token `share-e2e-figures`"]}
action: {"actor": "user", "steps": ["Open the public page at a 390x844 viewport with touch emulation, scroll to the `Provider matrix` figure and tap it", "Dismiss three ways in three separate runs: tap outside, activate the close control, press `Escape`"]}
end_state: {"must_observe": ["an overlay at `>= 95%` of the 390px viewport width", "page scroll locked while the overlay is open (`body` scroll offset unchanged across a 200px swipe)", "scroll position restored within `50` px of the pre-tap value after each of the 3 dismissal paths"], "must_not_observe": ["an overlay that stays open after `Escape`", "an empty overlay with 0 image bytes loaded", "the chart rendered at the 68-character measure width inside the overlay"]}
negative_control: {"would_fail_if": ["the enlarge handler is a no-op and the tap does nothing", "the overlay is a static container that never receives the figure source", "scroll position is not captured, so dismissal returns the reader to the top of the document"]}
evidence: {"artifact_type": "screenshot", "required_capture": true}
---

# A dense chart enlarges and dismisses on a phone

On a 390x844 viewport open share-e2e-figures and tap the figure captioned 'Provider matrix' (a 2400x1600 chart). Expect it to enlarge beyond the 68-character reading measure to at least 95 percent of viewport width, expect the page behind it to stop scrolling while enlarged, and expect a tap outside the image, an explicit close control, and the Escape key to each return the reader to the same scroll position they were at before enlarging.
