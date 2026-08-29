---
service: operator-shell
feature: UC-SHELL-01
priority: P0
type: happy_path
tier: visible
ac_ref: AC-1
test_tier: e2e
start_state: {"description": "Real BetterAuth against real Postgres with 1 seeded operator account, a seeded archive of 200 documents, and the device platform awake behind the real tunnel", "seed_method": "cli", "records": ["`holo.ts seed:e2e --reset` writes 1 operator account and 200 document rows", "the browser context starts with 0 cookies and 0 storage entries"]}
action: {"actor": "user", "steps": ["Sign in with the seeded operator credentials", "Type the draft `pricing tiers question` into the Chats prompt input, navigate to Library, apply the `infrastructure` chip, return to Chats, then repeat the round trip twice more", "Hard-reload Chats, Library and a document route"]}
end_state: {"must_observe": ["the post-sign-in route equal to `/chats`", "`0` sign-in routes in the navigation history across `6` destination switches", "the draft text `pricing tiers question` still present in the Chats input on return", "the `infrastructure` chip still applied with the same result count on return to Library", "all `3` hard reloads rendering the authenticated destination"], "must_not_observe": ["an empty prompt input after returning to Chats", "0 chips applied after returning to Library", "any `401` response during the sequence", "a redirect to `/sign-in` after the reloads"]}
negative_control: {"would_fail_if": ["destination state is not preserved, so the draft is empty and the chips are removed on every switch", "the session cookie is not persisted, so a reload lands on a static sign-in page", "navigation remounts a disconnected shell that discards both destinations' state"]}
evidence: {"artifact_type": "screenshot", "required_capture": true}
---

# One sign-in reaches both destinations and survives a reload

From a clean browser profile, open the app root, sign in with the seeded operator credentials, and land in Chats. Navigate to Library and back to Chats twice: no re-authentication may occur and no sign-in route may appear in the navigation history. Type a draft into the Chats prompt input, switch to Library, apply a filter, return to Chats: the draft must still be there, and returning to Library must restore the applied filter. Reload each destination with a hard refresh: the operator remains signed in on both.
