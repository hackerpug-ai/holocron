---
service: archive-library
feature: UC-LIB-01
priority: P0
type: happy_path
tier: visible
ac_ref: AC-1
test_tier: e2e
start_state: {"description": "Seeded archive of 200 documents including `Edge Inference Cost Curves`, plus a semantically related document `Serving economics of small models` that shares none of the query's words", "seed_method": "cli", "records": ["`holo.ts seed:e2e --reset` writes 200 document rows with embeddings for the real hybrid search path", "the archive holds at least 1 research output, 1 transcript and 1 digest"]}
action: {"actor": "user", "steps": ["Type `cost per token across providers` into Library search and read the ranked result rows"]}
end_state: {"must_observe": ["`Edge Inference Cost Curves` within the top `5` results", "`Serving economics of small models` present in the result set, ranked below the lexical match", "a non-empty body snippet on each of the first `10` rows", "a kind marker on each of the first `10` rows matching the kind stored in Postgres"], "must_not_observe": ["0 results for a query whose terms appear verbatim in the archive", "rows with an empty snippet", "a snippet string equal to the row's title", "rows with no kind marker"]}
negative_control: {"would_fail_if": ["search is lexical-only, so the semantically related document is absent from the set", "the client re-ranks or filters a static list instead of driving the server hybrid search", "snippets are omitted and the row falls back to the title, so a document whose title is forgotten stays unreachable"]}
evidence: {"artifact_type": "screenshot", "required_capture": true}
---

# A half-remembered fragment finds the document

With the seeded archive of 200 documents, type the fragment 'cost per token across providers' into Library search. The document 'Edge Inference Cost Curves' must appear within the first five results. Every result row must carry a matching snippet drawn from the body - not the title repeated - and a visible kind marking it as a research output, a transcript, or a digest. Confirm results are hybrid by checking that a semantically related document with none of the typed words also appears in the set, ranked below the lexical match.
