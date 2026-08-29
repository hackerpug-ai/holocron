---
service: operator-shell
feature: UC-SHELL-01
priority: P1
type: edge_case
tier: holdout
---

# A brand-new operator with an empty archive gets a shell, not a broken app

Point the app at a database seeded with an authenticated operator and literally nothing else: zero conversations, zero documents. Sign in. Chats must render an inviting empty state with a working prompt input that accepts typed text, and Library must render an explicit empty-archive state naming that the archive is empty. Neither may show a spinner that never resolves, an error, a count of NaN, or a device-unreachable message - the device is answering perfectly; it simply has nothing to say.
