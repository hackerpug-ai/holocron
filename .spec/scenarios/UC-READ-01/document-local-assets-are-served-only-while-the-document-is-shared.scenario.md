---
service: public-reader
feature: UC-READ-01
priority: P0
type: security
tier: visible
ac_ref: AC-4
test_tier: integration
start_state: {"description": "`share-e2e-figures` published with 3 stored asset rows, and a second published fixture `share-e2e-plain` owning a different asset id", "seed_method": "cli", "records": ["`holo.ts seed:e2e --reset` writes asset `a1` of 48,102 bytes under document `share-e2e-figures`", "both documents have `is_public = true` at seed time"]}
action: {"actor": "api_client", "steps": ["GET `https://docs.holocrnlib.com/d/share-e2e-figures/assets/a1` while public", "Unshare the document through the real platform API, wait 60 seconds, GET the same asset URL again", "Re-share, then GET `https://docs.holocrnlib.com/d/share-e2e-plain/assets/a1` using the other document's token"]}
end_state: {"must_observe": ["HTTP `200` with content type `image/png` and a body length of `48102` bytes while the document is public", "a non-`200` status carrying `0` image bytes within `60` seconds of the unshare", "a non-`200` status for the cross-token request `share-e2e-plain/assets/a1`"], "must_not_observe": ["`0`-byte success responses that pass a naive status check", "any `image/*` body after the 60-second bound", "the document title or any metadata in the refused response"]}
negative_control: {"would_fail_if": ["the asset route is keyed on asset id alone and ignores the token, so an unshared or foreign document's bytes are still served", "share state is read from a stale cache rather than the store, so revocation is a no-op on the asset path", "the route is stubbed to always return the stored bytes"]}
evidence: {"artifact_type": "api_response", "required_capture": true}
---

# Document-local assets are served only while the document is shared

With share-e2e-figures public, request https://docs.holocrnlib.com/d/share-e2e-figures/assets/a1 directly and expect HTTP 200 with image/png bytes whose length matches the row stored on the device. Unshare the document, wait for the stated sixty-second bound, and request the same asset URL again: expect a non-200 that carries no image bytes and no document metadata. Then, with the document public again, request /d/share-e2e-plain/assets/a1 (an asset id belonging to a different document) and expect a refusal rather than the image, proving the asset route is scoped to the token, not just to the asset id.
