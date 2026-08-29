---
service: archive-library
feature: UC-LIB-04
priority: P2
type: boundary
tier: holdout
---

# The very first use, with no conversation to land in, still works

On a first-run account with zero conversations, open a document, select a passage and ask about it. A new conversation must be created carrying the verbatim quote and the source title, and the caret must be in the input. Nothing may fail on a missing current-conversation id, and returning to the document must still restore the reading position on this first pass.
