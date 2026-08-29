---
service: public-reader
feature: UC-READ-05
priority: P0
type: error_handling
tier: visible
ac_ref: AC-4
test_tier: integration
start_state: {"description": "`share-e2e-revoked` unshared through the real platform API, with the device platform running and access logging enabled", "seed_method": "public_api", "records": ["the platform access log holds a recorded baseline count of requests for token `share-e2e-revoked`", "the document row has `is_public = false`"]}
action: {"actor": "api_client", "steps": ["GET the revoked URL once and capture the response headers", "GET the same URL 20 more times from 3 edge locations, then read the device platform access log"]}
end_state: {"must_observe": ["a `Cache-Control` header with `max-age` no greater than `60`", "a `Cloudflare-CDN-Cache-Control` header with `max-age` no greater than `60`", "at least `1` response reporting a cache `HIT`", "exactly `0` new origin requests for that token in the platform access log after the first"], "must_not_observe": ["an empty `Cache-Control` value on the withdrawn response", "a missing `Cloudflare-CDN-Cache-Control` header", "`max-age` greater than `60` on either header", "the 404 marked uncacheable or bypassing the edge"]}
negative_control: {"would_fail_if": ["only the standard `Cache-Control` header is set, so the zone default TTL applies and the withdrawn state is uncached", "404 responses are excluded from caching, so every stale reader reaches the origin", "the cache headers are omitted entirely on the withdrawn branch"]}
evidence: {"artifact_type": "api_response", "required_capture": true}
---

# The withdrawn response is cached at the edge so dead links never reach the device

After revoking share-e2e-revoked, request the URL and capture the response headers. Both Cache-Control and Cloudflare-CDN-Cache-Control must be present with a max-age no greater than 60 seconds, and the 404 status must be cacheable rather than bypassed. Request the URL twenty more times from three different edge locations while tailing the device platform's access log: the log must show zero origin requests after the first, and at least one response must report a cache hit.
