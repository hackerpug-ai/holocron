---
service: public-reader
feature: UC-READ-05
priority: P1
type: edge_case
tier: holdout
---

# A malformed token is handled by the same calm page, not by the framework

Request tokens containing a script tag, a percent-encoded path traversal, a 4,000-character string, a null byte, and a single quote with a SQL fragment. Every one must return the same designed page with its real copy. None may echo the submitted token into the HTML, return a 500, expose a framework error page, or produce a differently sized response that reveals parsing behaviour. Confirm the device platform log shows no query attempt for the SQL-shaped token.
