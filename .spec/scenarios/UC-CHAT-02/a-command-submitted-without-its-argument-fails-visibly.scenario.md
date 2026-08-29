---
service: agent-chat
feature: UC-CHAT-02
priority: P1
type: edge_case
tier: holdout
---

# A command submitted without its argument fails visibly

Complete /search from the palette and submit it with no argument at all. The client must either refuse with a stated reason in real copy or produce a turn that visibly reports the missing argument. It must not dispatch an empty search to the device, must not leave a turn spinning forever, and must not consume the keystroke and reset the input as if nothing happened. Repeat for /deep-research, where a blank argument would otherwise start a twenty-minute run on nothing.
