---
service: agent-chat
feature: UC-CHAT-05
priority: P1
type: boundary
tier: holdout
---

# Quitting the browser entirely preserves the marker across a cold start

Interrupt a streaming turn by quitting the browser process outright, wait five minutes, and start a new browser from a cold profile. Sign in and open the conversation. The interrupted turn must be there on first paint with its marker, its original prompt text, its surviving records, and its re-ask control. Nothing about this may depend on session storage, an unload handler, or anything the operating system would have discarded when the process died.
