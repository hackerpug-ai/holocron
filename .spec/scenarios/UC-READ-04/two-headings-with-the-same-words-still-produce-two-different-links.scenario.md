---
service: public-reader
feature: UC-READ-04
priority: P1
type: edge_case
tier: holdout
---

# Two headings with the same words still produce two different links

Publish a document containing the heading 'Results' three times, plus a heading written as 'Coût & Latence — 2026' and a heading that is only an emoji. Collect every heading id on the page: all must be unique, all must be non-empty, and all must be usable in a URL without manual encoding. Copy the anchor for the second 'Results' and open it in a clean context: the reader must land on the second occurrence, not the first. Finally open the page with #a-heading-that-was-renamed-last-week appended: the reader must land at the top of a fully rendered document with all its prose present, never on an error and never on a blank frame.
