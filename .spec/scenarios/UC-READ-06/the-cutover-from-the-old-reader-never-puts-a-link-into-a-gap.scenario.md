---
service: public-reader
feature: UC-READ-06
priority: P0
type: error_handling
tier: holdout
---

# The cutover from the old reader never puts a link into a gap

During the switch from the standalone reader to the rewritten one, poll a circulating token once per second from an external client throughout the deployment. Every response in the series must be a 200 carrying the document or the designed withdrawn page. A single 502, 503, connection reset, or DNS failure in the sequence fails this scenario: the operator's links are in other people's inboxes and cannot be told to retry.
