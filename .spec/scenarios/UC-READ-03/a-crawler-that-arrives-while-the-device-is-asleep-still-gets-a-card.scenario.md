---
service: public-reader
feature: UC-READ-03
priority: P1
type: error_handling
tier: holdout
---

# A crawler that arrives while the device is asleep still gets a card

Warm the edge for a shared document, stop the device platform, and then fetch the page with a Slackbot user agent under a five-second timeout. Complete metadata carrying the real title and description must return from the edge inside the timeout. Repeat the same fetch against a token whose page has never been cached and whose device is down: the response must be the designed unavailable or withdrawn page, never a raw origin error page whose meta tags describe an error rather than a document.
