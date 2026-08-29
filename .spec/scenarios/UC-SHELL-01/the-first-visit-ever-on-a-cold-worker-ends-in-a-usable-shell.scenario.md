---
service: operator-shell
feature: UC-SHELL-01
priority: P1
type: boundary
tier: holdout
---

# The first visit ever, on a cold worker, ends in a usable shell

Deploy a fresh worker version, purge caches, and from a browser profile with no cookies and no storage complete a full first-run: land on the entry route, sign in, and reach Chats with a focused prompt input that accepts a typed question. Measure the whole path. No step may depend on a pre-existing local value, no route may render twice due to a hydration mismatch, and no console error may be emitted during the sequence.
