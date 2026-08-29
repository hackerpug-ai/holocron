---
service: operator-shell
feature: UC-SHELL-02
priority: P1
type: error_handling
tier: holdout
---

# A device that answers with garbage is still named as a device problem

Leave the tunnel up but make the platform return HTTP 500 with an HTML body, then a 200 with malformed JSON, then a 200 with a valid envelope but a null payload. In all three cases the Library must render a named failure with real copy and a retry control rather than an empty archive, and Chats must mark the turn as failed rather than streaming nothing and stopping. The application must never treat an unparseable response as zero results.
