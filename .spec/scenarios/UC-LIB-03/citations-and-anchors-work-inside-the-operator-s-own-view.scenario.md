---
service: archive-library
feature: UC-LIB-03
priority: P1
type: happy_path
tier: visible
ac_ref: AC-4
test_tier: e2e
start_state: {"description": "The same document open in the reading column, carrying 6 real citations and 14 headings including `Latency under batch load`", "seed_method": "cli", "records": ["`holo.ts seed:e2e --reset` writes 6 citation targets and 14 heading blocks into the document", "the same document is public so its public-page slugs can be compared"]}
action: {"actor": "user", "steps": ["Follow 1 citation from its claim and read the resulting address", "Activate the anchor for `Latency under batch load`, copy it, and compare the slug against the public page's slug for the same heading"]}
end_state: {"must_observe": ["all `6` citations rendered as anchors with absolute href values and visible source identity", "the followed citation navigating to its stored target URL `https://arxiv.org/abs/2403.01234`", "the heading `Latency under batch load` scrolled into view after activating its anchor", "the copied slug `latency-under-batch-load` identical to the public page's slug"], "must_not_observe": ["0 citations rendered for a document that stores 6", "a citation rendered as inert plain text", "an empty clipboard after copying the anchor", "a slug that differs between the reading column and the public page"]}
negative_control: {"would_fail_if": ["citations are stripped by the reading-column renderer, so claims read as unsourced", "the two surfaces use different slug functions, so a copied anchor is dead on the public page", "the anchor control is static decoration with no clipboard write bound"]}
evidence: {"artifact_type": "screenshot", "required_capture": true}
---

# Citations and anchors work inside the operator's own view

In the same document, follow a citation from a claim to its source and confirm it opens the cited URL with the source identity visible before the click. Then jump to the heading 'Latency under batch load' by its anchor, and copy that anchor: the clipboard must contain a URL that reopens the document scrolled to that section. The anchor scheme must produce the same slug the public page produces for the same heading.
