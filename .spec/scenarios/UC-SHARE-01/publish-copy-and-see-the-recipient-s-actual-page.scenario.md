---
service: share-lifecycle
feature: UC-SHARE-01
priority: P0
type: happy_path
tier: visible
ac_ref: AC-1
test_tier: e2e
start_state: {"description": "`Edge Inference Cost Curves` (4,200 words, 5 figures) present in the seeded archive with `is_public = false` and 0 active tokens", "seed_method": "cli", "records": ["`holo.ts seed:e2e --reset` writes the document with 5 asset rows and `is_public = false`", "the token table holds 0 rows for this document"]}
action: {"actor": "user", "steps": ["Toggle the document public from its Library row", "Activate the copy control once and read the clipboard", "Activate the open control and inspect the new tab's address and rendered figures"]}
end_state: {"must_observe": ["a URL matching `https://docs.holocrnlib.com/d/<token>` presented in the same view with `0` navigations", "clipboard content `==` that presented URL, with a copy confirmation rendered", "the new tab address `==` that same public URL", "`5` figures on the opened public page each reporting `naturalWidth > 0`", "`1` token row in Postgres for that document with `is_public = true`"], "must_not_observe": ["an empty clipboard after the copy", "0 figures on the opened public page", "an internal preview route or a `?preview=` parameter in the opened address", "a URL shape other than `/d/<token>`"]}
negative_control: {"would_fail_if": ["the open control points at an internal preview surface rather than the real public URL, so the operator never sees the recipient's page and an image defect ships unnoticed", "the copy is a no-op and the confirmation is a static toast, so the operator pastes a stale clipboard", "the URL is rendered optimistically before the share write lands, so the link resolves to nothing"]}
evidence: {"artifact_type": "screenshot", "required_capture": true}
---

# Publish, copy, and see the recipient's actual page

In the Library, toggle 'Edge Inference Cost Curves' public from its row. Its URL must appear in the same view in the exact form https://docs.holocrnlib.com/d/<token>. Press copy once: the clipboard must contain that URL and a visible confirmation must appear. Activate the open control: a new tab must load that real public URL - the same address a stranger would use, not an internal preview route. On that page, count the figures: all five must render, matching the count in the operator's own reading column.
