---
service: archive-library
feature: UC-LIB-02
priority: P0
type: security
tier: holdout
---

# The shared chip reflects the database, not the last thing the browser did

Apply the shared chip and note the list of seven. Now change one document's share state through the MCP share tool - a completely different client - and refresh the filtered view. The list must reflect the new truth with eight rows. Then unshare a document from another browser while the chip is applied here: after invalidation the row must leave the filtered set. A share filter driven by a client-side optimistic flag will pass a single-browser test and fail this one, and the operator uses this filter to answer a security question.
