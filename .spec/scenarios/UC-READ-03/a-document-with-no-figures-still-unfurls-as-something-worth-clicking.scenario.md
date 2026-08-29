---
service: public-reader
feature: UC-READ-03
priority: P1
type: edge_case
tier: visible
ac_ref: AC-1
test_tier: integration
start_state: {"description": "`share-e2e-plain` published: 800 words, title `Usage-based billing rollout`, 0 images anywhere in its markdown", "seed_method": "cli", "records": ["`holo.ts seed:e2e --reset` writes the document with 0 asset rows", "the document is public at token `share-e2e-plain`"]}
action: {"actor": "api_client", "steps": ["GET `https://docs.holocrnlib.com/d/share-e2e-plain` with a crawler user agent, parse the head, then resolve any `og:image` value found"]}
end_state: {"must_observe": ["`og:title` equal to `Usage-based billing rollout`", "`og:description` of at least `60` characters of real prose from the body", "either `0` `og:image` tags, or exactly `1` `og:image` resolving with HTTP `200`"], "must_not_observe": ["an `og:image` tag with an empty value", "an `og:image` URL returning `404`", "a description string equal to the title string"]}
negative_control: {"would_fail_if": ["og:image is emitted unconditionally with an empty src when the document has no figures", "the description falls back to a hardcoded placeholder string", "the unfurl head is a static template that always claims a hero image"]}
evidence: {"artifact_type": "api_response", "required_capture": true}
---

# A document with no figures still unfurls as something worth clicking

Paste the link for share-e2e-plain, which contains no images at all. The card must still carry the real title and a description drawn from the opening prose. og:image must either be absent entirely or point at a resolvable fallback card image that returns 200 - an og:image tag with an empty, relative, or 404ing value is a failure, because a broken hero renders worse in Slack than no hero at all.
