---
service: operator-shell
feature: UC-SHELL-01
priority: P0
type: security
tier: visible
ac_ref: AC-4
test_tier: integration
start_state: {"description": "Deployed app and deployed Worker with 1 public document at token `share-e2e-figures`; the requesting context holds 0 session cookies", "seed_method": "cli", "records": ["`holo.ts seed:e2e --reset` publishes 1 document with 5 figures", "no operator session exists in the requesting context"]}
action: {"actor": "api_client", "steps": ["GET `/chats` and `/library` with no session cookie", "GET `https://docs.holocrnlib.com/d/share-e2e-figures` with the same empty context, then repeat with cookies blocked entirely"]}
end_state: {"must_observe": ["both `/chats` and `/library` redirecting to the sign-in route", "the public document returning HTTP `200` with the body containing `Edge Inference Cost Curves` in both public runs", "`0` redirects on the public path", "`0` `Set-Cookie` headers on the public response"], "must_not_observe": ["a `302` to sign-in on the public document path", "an empty body on the public response", "a `Set-Cookie` header on the public response", "`/chats` returning `200` without a session"]}
negative_control: {"would_fail_if": ["the auth middleware matcher is too broad and the public path inherits the redirect, converting every stranger into a bounce", "the auth check is omitted from the operator routes, so an unauthenticated request reaches the archive", "a session cookie is set unconditionally by shared middleware on the public host"]}
evidence: {"artifact_type": "api_response", "required_capture": true}
---

# The auth gate covers the shell and never touches the public reader

With no session cookie, request /chats and /library and expect a redirect to sign-in for both. Then request https://docs.holocrnlib.com/d/share-e2e-figures with the same empty context and expect HTTP 200 with the document, no redirect, no 401, and no Set-Cookie. Repeat the public request from a browser context where cookies are entirely blocked: the stranger must still get the document, proving the public path carries no session requirement at all.
