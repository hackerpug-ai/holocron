---
service: public-reader
feature: UC-READ-01
priority: P0
type: happy_path
tier: visible
ac_ref: AC-1
test_tier: e2e
start_state: {"description": "Seeded archive holding the fixture document `Edge Inference Cost Curves` (4,100 words) published at token `share-e2e-figures`, carrying 2 remote absolute-URL images and 3 document-local images written as `assets/a1`, `assets/a2`, `assets/a3`", "seed_method": "cli", "records": ["`bun services/platform/src/cli/holo.ts seed:e2e --reset` writes 1 document row and 3 asset rows into the real Postgres on the device platform", "the document row has `is_public = true` and token `share-e2e-figures`"]}
action: {"actor": "user", "steps": ["Open `https://docs.holocrnlib.com/d/share-e2e-figures` in Chromium at 1440px against the deployed Cloudflare Worker"]}
end_state: {"must_observe": ["5 `figure` elements inside the article", "each of the 5 `img` nodes reporting `naturalWidth > 0` after load", "5 image responses with HTTP status `200` and an `image/*` content type", "the title text `Edge Inference Cost Curves` in the header band"], "must_not_observe": ["0 figure elements in the article", "the literal characters `![` anywhere in the body text", "any anchor whose href is `#`", "a broken-image placeholder glyph"]}
negative_control: {"would_fail_if": ["the markdown renderer has no image rule, so image syntax falls through as the literal text `![alt](src)` \u2014 the exact year-old defect", "the public Worker does not route `/d/<token>/assets/<id>`, so every document-local `img` resolves to an empty href and stays 0-width", "the article is served as a static text-only shell disconnected from the asset store"]}
evidence: {"artifact_type": "screenshot", "required_capture": true}
---

# Every figure in a shared document renders on the public page

Seed the real device Postgres with the fixture document 'Edge Inference Cost Curves' (token share-e2e-figures, 4,100 words) containing two absolute-URL remote images and three document-local images written as ![Cost curve](assets/a1), ![Latency histogram](assets/a2) and ![Provider matrix](assets/a3). Toggle it public and open https://docs.holocrnlib.com/d/share-e2e-figures in a real browser. Expect exactly five figure elements in the body, each wrapping an img whose naturalWidth is greater than zero after load, each constrained to the reading measure. Expect all five image responses to return HTTP 200 with an image/* content type. Expect zero occurrences of the literal sequence '![' in the rendered text, zero anchors with href='#' inside the article, and zero broken-image placeholder glyphs.
