---
service: share-lifecycle
feature: UC-SHARE-02
priority: P0
type: security
tier: holdout
---

# A share made outside the browser shows up in the browser

With the Library open, share a document using the MCP share tool from a Claude Code session - a completely different client writing to the same platform. After invalidation, that document's row must show as public and the shared filter count must include it, moving from seven to eight, with no manual page reload. Then unshare it the same way and confirm it leaves. 'What is public under my name right now' is only a real answer if it reflects every writer, not just this tab.
