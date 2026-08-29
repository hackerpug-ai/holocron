---
service: archive-library
feature: UC-LIB-03
priority: P0
type: happy_path
tier: visible
ac_ref: AC-2
test_tier: e2e
start_state: {"description": "`Edge Inference Cost Curves` (4,200 words, 5 figures) present in the archive and published at token `share-e2e-figures`, so both the reading column and the public page can render the same document", "seed_method": "cli", "records": ["`holo.ts seed:e2e --reset` writes the document with 5 asset rows", "the document has `is_public = true`"]}
action: {"actor": "user", "steps": ["Open the document in the Library reading column at 1440px and measure the text column width and figure count", "Open its real public URL at 1440px and take the same 2 measurements"]}
end_state: {"must_observe": ["column widths on the 2 surfaces differing by no more than `5%`", "`5` loaded figures on both surfaces", "body text contrast of at least `7:1` in the reading column", "`0` interactive controls, glows, tints or borders inside the reading measure"], "must_not_observe": ["a figure count of 0 on either surface", "a width divergence greater than 5%", "chrome elements rendered inside the measure", "an empty reading column for a document with 4,200 words"]}
negative_control: {"would_fail_if": ["the reading column uses a separate renderer from the public page, so the two drift and the operator's self-check stops meaning anything", "figures are omitted in the reading column, leaving the operator unable to see what he is about to send", "the column is a static shell disconnected from the document body"]}
evidence: {"artifact_type": "screenshot", "required_capture": true}
---

# The operator reads at the same measure and figure treatment as the stranger

Open the 4,200-word document 'Edge Inference Cost Curves' in the Library reading column at a 1440px viewport, and open its public page at the same viewport. Measure the rendered text column width in pixels on both: they must match within 5 percent. Count figures on both: they must be equal, and the images must load on both. Confirm the reading column contains no glow, tint, border, badge or control inside the measure, and that body text contrast against its background is at least 7:1.
