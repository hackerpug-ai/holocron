---
service: public-reader
feature: UC-READ-03
priority: P0
type: happy_path
tier: visible
ac_ref: AC-3
test_tier: integration
start_state: {"description": "`share-e2e-figures` published, opening paragraph beginning `Hosted inference pricing moved to per-token billing`, first figure `assets/a1` available as a hero candidate", "seed_method": "cli", "records": ["`holo.ts seed:e2e --reset` writes the document with a non-empty opening paragraph and 3 asset rows", "the document is public at token `share-e2e-figures`"]}
action: {"actor": "api_client", "steps": ["GET `https://docs.holocrnlib.com/d/share-e2e-figures` with a crawler user agent and parse the `head`", "GET the value of `og:image` and read its status and dimensions"]}
end_state: {"must_observe": ["`og:title` equal to `Edge Inference Cost Curves`", "`og:description` of between `60` and `200` characters drawn from the opening paragraph", "`og:image` an absolute https URL returning `200` with dimensions at least `600x315`", "`og:url` equal to `https://docs.holocrnlib.com/d/share-e2e-figures`", "`twitter:card` equal to `summary_large_image`"], "must_not_observe": ["0 og meta tags in the head", "an empty `og:description`", "an `og:image` with a relative or empty value", "the head of a generic error page"]}
negative_control: {"would_fail_if": ["metadata is a hardcoded site-wide default rather than derived from the document", "the head is a static template with no document fields bound", "og tags are omitted entirely, which is the current behaviour that makes every pasted link a bare URL"]}
evidence: {"artifact_type": "api_response", "required_capture": true}
---

# A shared document emits complete OpenGraph and Twitter card metadata

Request the public page for share-e2e-figures with a crawler user agent and parse the head. Expect og:title equal to the document title, og:description drawn from the opening prose and between 60 and 200 characters, og:image pointing at an absolute https URL that itself returns 200 with an image content type and dimensions of at least 600x315, plus og:type, og:url matching the canonical https://docs.holocrnlib.com/d/share-e2e-figures, twitter:card set to summary_large_image, and twitter:title and twitter:description present. Then paste the same URL into a real Slack channel, a real iMessage thread and a real mail client and confirm all three render a card with title, description and image.
