---
service: public-reader
feature: UC-READ-06
priority: P1
type: edge_case
tier: holdout
---

# URL punctuation a chat client added does not break a link

Request the same valid token five ways: with a trailing slash, with a trailing period that a mail client appended, with ?utm_source=slack attached, with a #section fragment, and with the token in a different letter case than it was minted. Each must resolve to the same document with its full prose, and the canonical link element in the head must state the same clean URL in all five cases so a forwarded copy converges on one address rather than five.
