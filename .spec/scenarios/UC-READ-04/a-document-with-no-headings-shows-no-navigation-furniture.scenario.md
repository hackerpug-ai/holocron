---
service: public-reader
feature: UC-READ-04
priority: P1
type: edge_case
tier: holdout
---

# A document with no headings shows no navigation furniture

Publish a 900-word document written as five unbroken paragraphs with no headings whatsoever. All 900 words must render. The page must render no outline container, no empty table-of-contents rail, and no anchor affordances hovering over paragraph text. Reading progress may still be present because it derives from scroll, not from structure. An implementation that always renders an outline shell will show an empty box here and fail.
