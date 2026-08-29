---
service: public-reader
feature: UC-READ-06
priority: P0
type: boundary
tier: visible
ac_ref: AC-3
test_tier: integration
start_state: {"description": "A 6-case token matrix seeded in the real Postgres: valid-public, valid-revoked, never-minted, malformed, path-traversing, whitespace-padded", "seed_method": "cli", "records": ["`holo.ts seed:e2e --reset` writes 1 public document and 1 revoked document", "the never-minted and malformed cases have 0 corresponding rows"]}
action: {"actor": "api_client", "steps": ["GET `/d/<token>` for all 6 matrix cases against the deployed Worker and record status plus content type for each"]}
end_state: {"must_observe": ["all `6` responses being either the document page or the withdrawn page", "the valid-public case returning HTTP `200` with the body containing `Edge Inference Cost Curves`", "content type `text/html` on all `6` responses"], "must_not_observe": ["a redirect to `/sign-in` on any of the 6", "a JSON error body or a `500` anywhere in the matrix", "an empty `200` response with 0 characters of copy", "a directory listing"]}
negative_control: {"would_fail_if": ["the malformed case falls through to the framework's static 500 page", "the never-minted case is disconnected from the withdrawn branch and returns a bare status", "auth middleware is applied to the public path, so an unauthenticated request is redirected to sign-in"]}
evidence: {"artifact_type": "api_response", "required_capture": true}
---

# The token path has exactly two outcomes and no third

Drive the /d/<token> route across the full fixture matrix: valid and public, valid and revoked, never minted, malformed, expired-looking, and with trailing whitespace. Every response must be either the document or the withdrawn page. No response may be a redirect to sign-in, a JSON error body, a framework 500 page, a directory listing, or an empty 200. Record the status and content type of every case in the evidence artifact.
