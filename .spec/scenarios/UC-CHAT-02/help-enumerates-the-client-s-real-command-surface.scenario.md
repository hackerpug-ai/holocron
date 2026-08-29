---
service: agent-chat
feature: UC-CHAT-02
priority: P1
type: happy_path
tier: visible
ac_ref: AC-4
test_tier: e2e
start_state: {"description": "Operator signed in with the device platform awake and the client command registry holding 6 declared commands", "seed_method": "cli", "records": ["the command registry source declares exactly 6 commands", "the conversation starts with 0 prior turns"]}
action: {"actor": "user", "steps": ["Run `/help` and capture the rendered command list", "Open the palette and capture its list, then read the registry from source"]}
end_state: {"must_observe": ["the `/help` output listing all `6` commands with their descriptions", "the `/help` set equal to the palette set", "the palette set equal to the `6`-entry registry set"], "must_not_observe": ["an empty `/help` response", "a command present in the palette and absent from `/help`", "0 descriptions in the `/help` output"]}
negative_control: {"would_fail_if": ["`/help` prints a hardcoded string that has drifted from the registry", "the palette and `/help` read from two separate static lists", "`/help` is a no-op that produces an empty turn"]}
evidence: {"artifact_type": "stdout", "required_capture": true}
---

# /help enumerates the client's real command surface

Run /help and read the result. It must list all six supported commands with their descriptions and must match, exactly, the set the palette offers - no command listed in help that the palette lacks, and none in the palette that help omits. Cross-check the list against the command registry in the source so that a command added to one surface and not the other fails this criterion.
