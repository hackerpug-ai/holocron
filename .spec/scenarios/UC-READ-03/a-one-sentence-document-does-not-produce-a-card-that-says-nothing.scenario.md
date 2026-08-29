---
service: public-reader
feature: UC-READ-03
priority: P2
type: edge_case
tier: holdout
---

# A one-sentence document does not produce a card that says nothing

Publish a document whose entire body is the single sentence 'Pricing tiers moved to usage-based billing on 12 March.' Paste the link. The description on the resulting card must be that exact sentence, not an empty string, not the title repeated verbatim, and not an ellipsis. Confirm the same for a document whose first block is a markdown table rather than a paragraph: the description generator must skip to prose rather than emitting pipe characters and dashes into a chat client.
