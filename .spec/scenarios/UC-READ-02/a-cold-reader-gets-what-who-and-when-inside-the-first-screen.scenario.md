---
service: public-reader
feature: UC-READ-02
priority: P0
type: happy_path
tier: visible
ac_ref: AC-1
test_tier: e2e
start_state: {"description": "`share-e2e-long` published: 4,200 words, 14 headings, title `Edge Inference Cost Curves`, publisher identity set, published date `2026-03-12`", "seed_method": "cli", "records": ["`holo.ts seed:e2e --reset` writes the document row with a non-null title, publisher and `published_at`", "the document is public at token `share-e2e-long`"]}
action: {"actor": "user", "steps": ["Open `https://docs.holocrnlib.com/d/share-e2e-long` at a 390x844 viewport with `prefers-color-scheme: light`, take no scroll action"]}
end_state: {"must_observe": ["the title `Edge Inference Cost Curves` inside the 390x844 viewport at scrollY `0`", "a publisher identity string of at least `2` characters inside the same viewport", "the date `2026-03-12` inside the same viewport", "header band height `<= 25%` of 844px", "at least `3` lines of body prose inside the first viewport", "measured line length between `45` and `75` characters"], "must_not_observe": ["an empty header band", "0 characters of body prose above the fold", "`document.scrollWidth > window.innerWidth`", "the strings `undefined` or `Invalid Date` in the header"]}
negative_control: {"would_fail_if": ["the header is a static band with no document fields bound to it", "publisher and date are omitted from the server render", "the page renders the body only, disconnected from the document metadata"]}
evidence: {"artifact_type": "screenshot", "required_capture": true}
---

# A cold reader gets what, who and when inside the first screen

On a 390x844 phone viewport with the OS colour scheme set to light, open https://docs.holocrnlib.com/d/share-e2e-long. Without any scrolling, the reader must be able to read the document title 'Edge Inference Cost Curves', the publisher identity string, and the publication date. Body text must also be present in the initial viewport, and the header band must occupy no more than 25 percent of viewport height. Measure the rendered body: line length must fall between 45 and 75 characters and the document must not scroll horizontally at 390px.
