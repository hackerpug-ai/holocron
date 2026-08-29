---
service: operator-shell
feature: UC-SHELL-01
priority: P1
type: edge_case
tier: holdout
---

# A deep link survives the trip through sign-in

While signed out, open the direct URL of a specific document inside the Library, for example /library/doc/edge-inference-cost-curves. Expect sign-in, complete it, and expect to land on that exact document with its 4,200 words rendered - not on Chats, and not on the Library index. Repeat with a deep link that includes a filter query string: the filter state must survive the round trip too. Losing the destination through sign-in is the difference between a link an operator can send himself and one he cannot.
