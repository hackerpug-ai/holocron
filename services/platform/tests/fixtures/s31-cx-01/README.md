# S31-CX-01 fixtures — content-blind reconcile + non-gating FK audit

Migration fixtures used by
`services/platform/tests/integration/sprint31-cx-01-red-reconcile-fk.test.ts`.

## corrupt_content_matching_counts

| Field | Value |
| --- | --- |
| seed_method | `migration_fixture` |
| export | `services/platform/tests/fixtures/etl-valid-export` (shared Sprint 14 archive) |
| catalog | `.spec/prds/mk6-migration/10-technical-requirements/12-convex-source-catalog.yaml` |
| plant | After `etl:run`, UPDATE `documents.title` for `legacy_convex_id = doc_legacy_1` to a known corrupt marker while leaving row counts untouched |

Contract (desired, green after S31-CX-03):

- `sourceCount == loadedCount` for `documents` (counts still match)
- reconcile JSON reports `ok: false`
- `fieldDigestMismatches >= 1`
- process exit code != 0

On HEAD before S31-CX-03, count-only reconcile yields `ok: true` with variance 0 — the RED suite asserts the desired fail-closed fields and therefore fails.

See `corrupt-content-recipe.json` for the exact plant parameters.

## loaded_db_no_domain_fks

| Field | Value |
| --- | --- |
| seed_method | `migration_fixture` |
| state | Same loaded fixture DB: domain tables present (`documents`, `chat_messages`, …) |
| domain FKs | Zero `FOREIGN KEY` constraints on migrated domain tables (control-plane FKs such as `etl_stage_run_id_fkey` may exist) |

Contract (desired, green after S31-CX-04):

- FK audit reports `enforcedForeignKeys` (counter present)
- `ok: false` when constraint-eligible referential edges lack matching DB FKs
- `unenforcedEdges.length > 0` (or equals eligible edge count)

Must not accept `ok: true` when eligible domain edges exist and are unenforced.
