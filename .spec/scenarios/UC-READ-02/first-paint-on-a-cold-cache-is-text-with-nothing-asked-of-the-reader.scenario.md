---
service: public-reader
feature: UC-READ-02
priority: P0
type: boundary
tier: visible
ac_ref: AC-5
test_tier: e2e
start_state: {"description": "`share-e2e-long` published, its edge cache entry purged, requested from a browser context with 0 cookies and 0 storage entries on a Fast 3G profile", "seed_method": "cli", "records": ["`holo.ts seed:e2e --reset` writes the document containing the sentence `Batch size above 32 stops improving throughput on the smaller node`", "the edge cache holds 0 entries for token `share-e2e-long` at the moment of the request"]}
action: {"actor": "user", "steps": ["Request the public URL with a performance trace recording, then repeat the request with JavaScript disabled and capture the raw response body"]}
end_state: {"must_observe": ["the first contentful paint element is a `p` node of body prose", "the raw HTML response body contains the string `Batch size above 32`", "`0` elements matching skeleton, shimmer or spinner selectors across every trace frame", "response headers containing no `Set-Cookie` entry"], "must_not_observe": ["an empty article body in the first response", "a redirect to `/sign-in`", "a `Set-Cookie` header on the response", "any element with a `dialog` role"]}
negative_control: {"would_fail_if": ["the page is client-rendered, so the first response body is an empty shell hydrated later", "a loading skeleton is rendered while the document query is in flight", "the document HTML is fetched client-side and the server returns a static app shell"]}
evidence: {"artifact_type": "file_artifact", "required_capture": true}
---

# First paint on a cold cache is text, with nothing asked of the reader

Purge the edge cache, then request the document on a throttled Fast 3G profile from a fresh browser context. The first contentful paint must be document text. No spinner, skeleton block, shimmer, or loading placeholder may appear at any point in a recorded trace. No sign-in prompt, cookie banner, consent modal, or app-install interstitial may render, and the response must carry no Set-Cookie header. Following the page's own navigation must never land on a sign-in route.
