---
service: public-reader
feature: UC-READ-05
priority: P0
type: happy_path
tier: visible
ac_ref: AC-1
test_tier: e2e
start_state: {"description": "`share-e2e-revoked` was published and confirmed resolving with HTTP `200`, then unshared through the real platform API more than 60 seconds ago", "seed_method": "public_api", "records": ["the document row moved from `is_public = true` to `is_public = false` via the platform share endpoint", "a pre-revocation GET of the token returned HTTP `200` with the document body"]}
action: {"actor": "user", "steps": ["Open `https://docs.holocrnlib.com/d/share-e2e-revoked` in a fresh browser context", "Repeat the request with a valid operator session cookie present"]}
end_state: {"must_observe": ["the withdrawn copy `This document is no longer shared` rendered in the product's own typography", "body text length `> 40` characters on the withdrawn page", "`0` sign-in links, auth forms or account-creation controls in both runs"], "must_not_observe": ["a blank body with 0 characters of copy", "a framework stack trace or default error page", "the document's own prose or title", "a bare status code as the only content"]}
negative_control: {"would_fail_if": ["revocation falls through to the framework's default 404, which is a static error page rather than a designed state", "the withdrawn branch is absent, so a revoked token renders an empty body", "the withdrawn page is a stub that still echoes the document title"]}
evidence: {"artifact_type": "screenshot", "required_capture": true}
---

# A withdrawn link resolves to a calm, designed page

Publish share-e2e-revoked, confirm it resolves, then unshare it and wait for the stated bound. Open the same URL. The page must state in plain words that the document is no longer shared, in the same typography and colour treatment as a live document page. It must contain no stack trace, no framework error text, no raw status code as the only content, and must not be a blank body. It must offer no sign-in control, no account creation prompt, and no wording implying the reader could see the document if they had an account.
