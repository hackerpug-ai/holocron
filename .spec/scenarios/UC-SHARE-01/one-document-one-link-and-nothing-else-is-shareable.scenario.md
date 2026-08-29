---
service: share-lifecycle
feature: UC-SHARE-01
priority: P1
type: boundary
tier: visible
ac_ref: AC-5
test_tier: integration
start_state: {"description": "Seeded archive of 200 documents plus 3 conversations, 1 saved filter view and 4 research cards, with 1 target document currently unshared", "seed_method": "cli", "records": ["`holo.ts seed:e2e --reset` writes 200 documents, 3 conversations and 4 research records", "the target document holds 0 active tokens"]}
action: {"actor": "user", "steps": ["Enumerate every share affordance rendered across Library rows, document views, conversations, search result sets, filter views and research cards", "Toggle the same document public twice and query the token table"]}
end_state: {"must_observe": ["share affordances present on exactly `2` surface kinds: the document row and the document view", "`0` share affordances on conversations, collections, search result sets, filter views and research cards", "exactly `1` active token row in Postgres after the 2nd toggle"], "must_not_observe": ["a second token minted by the repeated toggle", "any share control on a conversation", "0 tokens for a document the row reports as public"]}
negative_control: {"would_fail_if": ["the share control is a generic component mounted on every list item, so conversations become shareable", "each toggle mints a new token, leaving stale links that were never revoked", "the row's public state is a static flag disconnected from the token table"]}
evidence: {"artifact_type": "db_query", "required_capture": true}
---

# One document, one link, and nothing else is shareable

Enumerate every share affordance in the application. A share control may exist on a document row and inside a document view, and nowhere else - no share on a conversation, a search result set, a filter view, a collection, or a research card. Then toggle the same document public twice and read the database: exactly one active token must exist for it, and the second toggle must not mint a second link.
