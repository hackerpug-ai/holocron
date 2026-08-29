---
service: archive-library
feature: UC-LIB-04
priority: P0
type: boundary
tier: visible
ac_ref: AC-5
test_tier: e2e
start_state: {"description": "The 4,200-word document open in the reading column at 1440px with no text selected", "seed_method": "cli", "records": ["`holo.ts seed:e2e --reset` writes the 4,200-word document with 5 figures and 14 headings", "the browser selection is empty at the start of the traversal"]}
action: {"actor": "user", "steps": ["Scroll the full document top to bottom, hovering paragraphs, headings and figures, without selecting anything", "Then select a sentence and count the controls"]}
end_state: {"must_observe": ["`0` interactive controls inside the reading measure across the whole traversal", "all `14` headings and `5` figures rendered during the traversal", "exactly `1` control appearing immediately after the selection"], "must_not_observe": ["an empty reading column with `0` paragraphs rendered during the traversal", "a hover-triggered affordance on any paragraph, heading or figure", "a persistent assistant control docked inside the measure", "summarise, explain or rewrite actions alongside the single control"]}
negative_control: {"would_fail_if": ["an assistant control is rendered unconditionally, so the calm column is chrome from the first paint", "hover handlers show the affordance on every paragraph, littering the reading surface", "the control set is a static menu of several actions rather than the one licensed affordance"]}
evidence: {"artifact_type": "screenshot", "required_capture": true}
---

# The reading column has no AI surface until text is selected

Read the full 4,200-word document top to bottom at desktop width, hovering paragraphs, headings and figures, without selecting anything. No AI affordance of any kind may appear: no summarise, no explain, no rewrite, no floating assistant, no hover button. Enumerate every interactive control rendered inside the measure and assert the set is empty. Then select text and confirm exactly one control appears - not a menu of several.
