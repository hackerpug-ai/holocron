---
service: archive-library
feature: UC-LIB-01
priority: P1
type: edge_case
tier: holdout
---

# Hostile and degenerate queries are handled, not passed through

Submit each of these: a single character; only punctuation; a 2,000-character paste; a query containing a double quote and a colon-asterisk full-text operator; a query containing a semicolon and a DROP TABLE fragment; and a query of only spaces. Each must return either real results or a clean empty state within the normal latency budget. None may return a 500, expose a database error string, hang the input, or appear in the device platform log as a syntactically injected query. Confirm the archive still holds its 200 rows afterwards.
