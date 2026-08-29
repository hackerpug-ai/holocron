---
service: public-reader
feature: UC-READ-02
priority: P1
type: error_handling
tier: holdout
---

# A sleeping device does not become a loading state on the reader's screen

Warm the edge for a shared document, then stop the device platform and close the tunnel. Request the document from a new browser profile on a throttled connection. The reader must get the full 4,200-word text within a second or two from the edge. If the page cannot be served at all, the outcome must be a designed page carrying real copy, not an origin error, a spinning indicator, or a partially rendered shell. At no point may the reader see a skeleton state that implies content is on its way.
