---
service: archive-library
feature: UC-LIB-03
priority: P1
type: error_handling
tier: holdout
---

# Malformed markdown does not take the reading column down

Seed a document containing an unclosed code fence, a table with mismatched columns, a raw HTML script tag, an image with an empty src, a link with an empty href, and 500 nested list levels. Open it. All of its prose must render, the script must not execute, the empty link must not become an anchor to nowhere, and the page must not blank or throw. Compare against the public rendering of the same document: both surfaces must degrade identically, since they are supposed to share the renderer.
