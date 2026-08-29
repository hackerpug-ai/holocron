---
service: agent-chat
feature: UC-CHAT-02
priority: P0
type: happy_path
tier: visible
ac_ref: AC-1
test_tier: e2e
start_state: {"description": "Operator signed in with the device platform awake, positioned in turn on Chats, Library, and an open document in the reading column", "seed_method": "cli", "records": ["`holo.ts seed:e2e --reset` writes 200 documents so the Library and a document route are both reachable", "the client command registry declares 6 commands"]}
action: {"actor": "user", "steps": ["Press the palette keystroke from each of the 3 origins and read `document.activeElement`", "Type `/`, arrow to `/search`, complete it, type the argument `pricing tiers`, and submit using the keyboard only"]}
end_state: {"must_observe": ["`document.activeElement` equal to the prompt input from all `3` origins", "the palette listing exactly `6` commands: `/research`, `/deep-research`, `/search`, `/browse`, `/stats`, `/help`", "a non-empty description string on each of the `6` entries", "`0` pointer events in the completion-and-submit sequence", "the platform receiving the command with the argument `pricing tiers` intact"], "must_not_observe": ["an empty palette list", "0 commands offered from the Library origin", "a description string of 0 characters on any entry", "the argument arriving at the platform empty"]}
negative_control: {"would_fail_if": ["the palette is bound only to the Chats route, so the keystroke is a no-op from Library", "the command list is a static array with no descriptions bound", "submission drops the argument, so the platform receives an empty command"]}
evidence: {"artifact_type": "screenshot", "required_capture": true}
---

# One keystroke from anywhere reaches a self-describing command palette

From Library, from an open document, and from Chats, press the palette keystroke and confirm the caret lands in the prompt input each time with no navigation having occurred in between. Type a forward slash and confirm the palette lists exactly /research, /deep-research, /search, /browse, /stats and /help, each with a one-line description of what it does. Arrow to /search, complete it, type an argument, and submit with the keyboard alone - no pointer event may be required anywhere in the sequence.
