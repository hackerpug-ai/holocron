---
service: archive-library
feature: UC-LIB-03
priority: P0
type: security
tier: holdout
---

# A document id that is not in the archive does not open a blank column

Open the reading column at a document id that has been deleted, and at an id belonging to a fixture row outside the operator's archive. Both must produce an explicit not-found state with real copy inside the shell, with navigation intact. Neither may produce an empty reading column that looks like a document with no words, and neither may leak a title or any body fragment for the out-of-archive id.
