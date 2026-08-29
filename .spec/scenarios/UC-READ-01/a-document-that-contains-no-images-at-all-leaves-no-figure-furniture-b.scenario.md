---
service: public-reader
feature: UC-READ-01
priority: P1
type: edge_case
tier: holdout
---

# A document that contains no images at all leaves no figure furniture behind

Publish the fixture share-e2e-plain, an 800-word write-up with no image syntax anywhere in its markdown. Open the public page. Nothing image-shaped may appear: no figure element, no empty caption slot, no reserved aspect-ratio box holding open vertical space, no lightbox handler bound to the article. The prose should occupy the full measure top to bottom, and the 800 words of real body text must all be present. A renderer that emits an empty figure wrapper for a document with zero images will pass its own image tests and fail this one.
