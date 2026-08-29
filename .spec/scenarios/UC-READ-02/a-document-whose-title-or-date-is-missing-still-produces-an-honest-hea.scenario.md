---
service: public-reader
feature: UC-READ-02
priority: P1
type: edge_case
tier: holdout
---

# A document whose title or date is missing still produces an honest header

Seed a published document whose title column is an empty string and whose published-at timestamp is null, but whose body carries 1,200 real words beginning with the heading 'Provider pricing, March 2026'. Open its public URL. The header band must still say something true and human: a fallback drawn from that first heading, and the creation date if the publication date is absent. The strings 'undefined', 'null', 'NaN', 'Invalid Date' and an empty header band are all failures. The band must not collapse to zero height and push undated body text to the top of the page as if provenance were never part of the design.
