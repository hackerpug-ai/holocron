---
service: archive-library
feature: UC-LIB-02
priority: P0
type: happy_path
tier: visible
ac_ref: AC-1
test_tier: e2e
start_state: {"description": "Seeded archive of 200 documents spanning 4 categories, 3 research types and 3 statuses, with 7 of them public", "seed_method": "cli", "records": ["`holo.ts seed:e2e --reset` writes 200 rows whose category, research type, status and share state are known", "exactly 7 rows have `is_public = true`"]}
action: {"actor": "user", "steps": ["Apply the `infrastructure` category chip, then the `deep-research` type chip, then the `complete` status chip, reading the count after each", "Type `latency` into search with all 3 chips still applied", "Apply the `shared` chip and compare the row set against a direct Postgres query"]}
end_state: {"must_observe": ["the result count strictly decreasing across the `3` chip applications", "every visible row satisfying all `3` chip predicates, matching the Postgres set at each step", "the count updating again after the `latency` query, with every row satisfying chips and query together", "the `shared` chip yielding exactly the `7` public documents"], "must_not_observe": ["a row violating an applied chip", "a count that stays unchanged after a chip is applied", "an empty result set for a chip combination the database can satisfy", "a stale count left over from the previous query"]}
negative_control: {"would_fail_if": ["chips are decorative and the query ignores them, so the same 200 rows render regardless", "filtering happens client-side over a static page of results rather than in the query", "the count is a hardcoded total disconnected from the filtered set"]}
evidence: {"artifact_type": "db_query", "required_capture": true}
---

# Chips narrow the archive and combine with a query

In the seeded archive, apply the category chip 'infrastructure', then the research-type chip 'deep-research', then the status chip 'complete'. The visible result count must decrease at each step and every remaining row must satisfy all three. Now type 'latency' into search with the chips still applied: the count must update again and the rows must satisfy the chips and the query together. Apply the shared chip and confirm only documents whose share state is public remain.
