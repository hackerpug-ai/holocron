# S31-CX-03 fixtures — content digests + empty retained source fail-closed

Hermetic fixtures for `sprint31-cx-03-content-reconcile.test.ts`.

## empty_retained_source_table

Built at test runtime by copying `etl-valid-export` and truncating
`documents/documents.jsonl` to 0 rows while keeping the table directory present.
Catalog disposition for `documents` remains `preserve` (not approved-empty).

Desired: `etl:reconcile` exits non-zero and names `EMPTY_SOURCE_TABLE` + `documents`.

## defaulted_column_source_null

Built at test runtime by copying `etl-valid-export` and setting `status: null`
on `doc_legacy_1`. After load, Postgres applies `documents.status` default
(`draft`). Reconcile must list `documents.status` under `defaulted_column`.

## clean_s29_pair

Uses the shared `etl-valid-export` + catalog load path (hermetic stand-in for
the retained Sprint 29 archive pair). Desired: `fieldDigestMismatches == 0`
on a clean load (no planted corruption).
