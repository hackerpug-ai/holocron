---
service: public-reader
feature: UC-READ-06
priority: P0
type: happy_path
tier: visible
ac_ref: AC-1
test_tier: e2e
start_state: {"description": "A fixture set of 12 tokens minted by the previous standalone reader, including `share-e2e-legacy`, each with a recorded pre-cutover document id", "seed_method": "migration_fixture", "records": ["12 pre-rewrite token rows exist in the real Postgres with their original document ids recorded", "`share-e2e-legacy` resolved to document id `doc-0417` before the cutover"]}
action: {"actor": "api_client", "steps": ["GET each of the 12 circulating tokens against the rewritten reader on the real docs hostname", "Mint 1 new share link through the application share path and read the returned URL"]}
end_state: {"must_observe": ["HTTP `200` for all `12` circulating tokens", "`share-e2e-legacy` resolving to document id `doc-0417`, the same id as before the cutover", "`0` redirects that change the path shape for any of the 12", "the newly minted URL matching `https://docs.holocrnlib.com/d/<token>`"], "must_not_observe": ["any `404` among the 12 circulating tokens", "an empty response body for a token that previously served a document", "a path shape other than `/d/<token>`"]}
negative_control: {"would_fail_if": ["the rewrite introduces a new path prefix, so old tokens 404 and every circulating link is dead", "the token lookup is disconnected from the legacy token table, so pre-rewrite tokens resolve to nothing", "the share path returns a new URL shape, breaking the promise the MCP share tool makes to every agent session"]}
evidence: {"artifact_type": "api_response", "required_capture": true}
---

# Links already in circulation resolve unchanged after the rewrite

Take the fixture list of tokens minted by the previous standalone reader, including share-e2e-legacy. With the rewritten reader serving the docs host, request each token and expect HTTP 200, the same document id as before the cutover, at the same address, with no redirect to a different path shape. Then mint a new link through the share path and assert the returned URL matches exactly https://docs.holocrnlib.com/d/<token> - the shape the MCP share tool describes to every agent session.
