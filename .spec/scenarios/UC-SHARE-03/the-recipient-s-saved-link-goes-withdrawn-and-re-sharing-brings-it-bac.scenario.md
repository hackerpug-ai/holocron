---
service: share-lifecycle
feature: UC-SHARE-03
priority: P0
type: happy_path
tier: visible
ac_ref: AC-5
test_tier: e2e
start_state: {"description": "A public document loaded and bookmarked in a second browser profile on a separate network host, confirmed showing the document before revocation", "seed_method": "public_api", "records": ["the second profile loaded the document and its 5 figures successfully before the revocation", "the document row reads `is_public = true` at that point"]}
action: {"actor": "user", "steps": ["Revoke the document from the Library row and wait past the 60-second bound", "Hard-reload the bookmark in the second profile", "Re-share the document from the Library row and reload the bookmark again after the bound"]}
end_state: {"must_observe": ["the withdrawn page returned to the bookmark after the `60`-second bound", "`0` document content in that response body", "the document with all `5` figures resolving again within `60` seconds of the re-share", "the Library row reading `Public` after the re-share"], "must_not_observe": ["the document served from any cache layer after the bound", "an empty page in place of the withdrawn state", "the link staying dead past the bound after the re-share"]}
negative_control: {"would_fail_if": ["the revoked response is cached indefinitely, so the re-share cannot take effect and the link is permanently dead", "revocation is a no-op on a warm edge, so the bookmark keeps serving the document", "the re-share mints a different token that the row does not reflect"]}
evidence: {"artifact_type": "api_response", "required_capture": true}
---

# The recipient's saved link goes withdrawn, and re-sharing brings it back

Have a second browser open the working link and bookmark it. Revoke the document. After the stated bound, that browser reloading the bookmark must get the withdrawn page rather than the document, including on a hard reload and from a second browser profile on another network host. Then re-share the document from the Library row and confirm the public URL resolves to the document again within the same stated bound.
