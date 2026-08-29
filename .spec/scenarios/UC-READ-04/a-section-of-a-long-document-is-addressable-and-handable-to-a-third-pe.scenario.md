---
service: public-reader
feature: UC-READ-04
priority: P0
type: happy_path
tier: visible
ac_ref: AC-1
test_tier: e2e
start_state: {"description": "`share-e2e-long` published: 4,200 words across 14 headings, one of which reads `Latency under batch load`", "seed_method": "cli", "records": ["`holo.ts seed:e2e --reset` writes the document with 14 heading blocks", "the document is public at token `share-e2e-long`"]}
action: {"actor": "user", "steps": ["Open the public page at 1440px, hover the heading `Latency under batch load` and activate its anchor control", "Read the clipboard, then open the copied URL in a second clean browser context"]}
end_state: {"must_observe": ["clipboard content equal to `https://docs.holocrnlib.com/d/share-e2e-long#latency-under-batch-load`", "in the second context, the heading `Latency under batch load` inside the first viewport after load", "`14` heading entries exposed in the document outline", "an explicit length signal reading `4,200 words` or an equivalent reading-time value"], "must_not_observe": ["an empty clipboard after activating the anchor", "`0` heading ids on the rendered page", "the second context landing at scrollY `0` with the heading off-screen"]}
negative_control: {"would_fail_if": ["heading ids are absent from the markup, so the fragment resolves to nothing and the reader lands at the top", "the anchor control is a static decoration with no clipboard write bound to it", "the outline is a hardcoded stub rather than derived from the document's headings"]}
evidence: {"artifact_type": "screenshot", "required_capture": true}
---

# A section of a long document is addressable and handable to a third person

Open share-e2e-long, a 4,200-word document with 14 headings including one titled 'Latency under batch load'. Hover that heading at desktop width to reveal its anchor control, activate it, and read the clipboard: it must contain https://docs.holocrnlib.com/d/share-e2e-long#latency-under-batch-load. Open that exact URL in a second, clean browser context and confirm the heading is scrolled into view within the first viewport. Confirm the reader can also see the document's heading structure and gauge its length before starting to read, via a visible outline or an explicit length signal.
