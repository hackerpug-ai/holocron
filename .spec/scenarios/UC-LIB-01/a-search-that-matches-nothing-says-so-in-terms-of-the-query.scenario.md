---
service: archive-library
feature: UC-LIB-01
priority: P1
type: edge_case
tier: holdout
---

# A search that matches nothing says so in terms of the query

Search for 'quarterly amphibian logistics'. The surface must state in real copy that nothing matched, echo or reference the query so the operator knows what was searched, and offer a way back to the unfiltered archive of 200 documents. It must not render phantom rows, must not fall back to showing the most recent documents as though they matched, and must not show the previous result set still on screen under a new query.
