# MK6-DATA-001: Restore Postgres data-plane truth

> Status: 🟡 In Progress
> Cycle: 6
> Updated: 2026-08-18T00:00:00Z
> Assignee: mastra-implementer
> Reviewer: mastra-reviewer
> Priority: P0
> Type: bugfix
> Wave: 1
> Proposed by: mastra-planner
> Files: services/platform/src/etl/composite-corpus.ts, services/platform/src/etl/archive.ts, services/platform/src/etl/run.ts, services/platform/src/etl/reconcile.ts, services/platform/src/etl/latest-run.ts, services/platform/src/cutover/data-plane-content.ts, services/platform/tests/integration/mk6-data-plane-truth-live.test.ts, scripts/verify-mk6-data-plane-truth.sh, .tmp/MK6-DATA-001/${RUN_ID}/**
> Depends on: MK6-DEP-001

## Outcome

An isolated real Postgres target contains the complete union of the retained real Convex cutover export and every post-cutover local SQLite write. Canonically admitted sources, full losslessly dispositioned inventories, symmetric semantic snapshots, two-way provenance accounting, loaded rows, referenced blobs, and deterministic document bytes served by the exact authenticated Hono document-read route all agree through independently recomputed identities and hashes.

## Use-case classification

Workflow-only. Source admission, snapshotting, provenance derivation, loading, reconciliation, witness selection, server/target binding, and mutation controls are deterministic data operations. This task adds no Mastra Agent, model call, memory, scorer, or processor; agent tripwire requirements do not apply.

## Canonical source admission

The verifier admits one composite corpus rooted at a single canonical directory. Its default is the recovered `$HOME/.holocron`; an operator may instead set `MK6_DATA_CANONICAL_ROOT` to an explicitly equivalent durable root. The three source locations are derived from that root and cannot be independently redirected:

| Source | Required relative path | Admission requirement |
|---|---|---|
| Convex cutover export | `exports/convex-dev-cutover-2026-08-09` | Full real table/storage tree; derive every table count and digest from the admitted snapshot. |
| Local SQLite database | `holocron.db` | Real SQLite backup with `PRAGMA quick_check=ok`; derive every materialized/provenance count from the same snapshot. |
| Local blob store | `blobs` | Complete recursively discovered blob-root inventory; join `file_objects` only after discovery and derive every disposition plus missing/hash result from the snapshot. |

Admission resolves the root and each path with `realpath`, requires the supplied spelling to equal its absolute canonical path, and rejects a symlink in any path component. The admitted root must be a durable operator-selected corpus root, not the repository, a worktree, the run root, project `.tmp`, system temporary storage, `fixtures`, `testdata`, or a generated/copy directory. While the recovered default exists, an alternate root is equivalent only when all three preflight semantic identities equal those independently derived from the default; a byte-identical explicitly admitted alternate is equivalent, while an unproven or modified clone is arbitrary and rejected. The verifier records hashes of the canonical root and paths, but no secret-bearing path value. Arbitrary per-source overrides and symlink indirection fail before snapshotting.

The unmounted `/Volumes/Archives/...` location is not an input. A fixture, generated seed archive, empty corpus, or byte-identical clone outside the admitted root is not an acceptable substitute.

## Symmetric immutable snapshot recipe

The operator admits the canonical root and deliberately invokes the verifier. Every source must satisfy semantic equality at `source-pre`, `snapshot-copy`, and `source-post`; a one-sided copy hash is insufficient.

1. Create a cryptographically unique `RUN_ID` and a new `.tmp/MK6-DATA-001/${RUN_ID}/` with exclusive-create semantics. Reject an existing or symlinked run root.
2. **Export:** recursively `lstat` every direct-root entry and descendant without following links. Reject symlink or special-node entries; for every directory or regular file derive its relative-path identity, node type, deterministic logical size, and content-or-tree SHA-256. Compute the canonical digest over the sorted complete entry records, copy the complete tree, recompute the snapshot entry records/digest, and after all Postgres and Hono probes recompute the source records/digest. Require `export-source-pre == export-snapshot-copy == export-source-post`. This includes discovered root metadata files and never adds a sidecar to the retained export.
3. **SQLite:** use SQLite backup semantics for the initial immutable snapshot; raw database/WAL/SHM copying is forbidden. Run `PRAGMA quick_check=ok`. Derive a canonical semantic digest over schema/version plus ordered mapped-table rows, `import_batches`, `import_row_provenance`, and `file_objects`. After all probes, take a second SQLite backup from the live source and derive the same digest. Require `sqlite-source-backup-pre == sqlite-snapshot-copy == sqlite-source-backup-post`; SQLite file-layout equality is not a substitute for table/provenance semantic equality.
4. **Blobs:** recursively discover the complete blob-root file inventory before consulting `file_objects`; reject traversal, symlinks, and special nodes; compute a sorted relative-path identity/type/byte-length/SHA-256 digest over every file, referenced or not; copy the complete inventory; recompute the complete digest from the snapshot and again from the original source after all probes. Require `blob-source-pre == blob-snapshot-copy == blob-source-post`. Join snapshot `file_objects` identities to this complete inventory afterward and preserve every unreferenced file with an explicit immutable nonmaterialized disposition, never as an invented row or an exclusion from drift detection.
5. Write `manifest.json` last with schema `holocron.mk6.composite-corpus.v2`, code SHA, canonical source-path hashes, all three semantic checkpoints per source, SQLite backup methods and quick checks, derived provenance/accounting digests, per-table identities/counts/content digests, blob inventory/reference digests, external process/target identity, and witness identities. It contains identifiers, counts, and hashes only—never document bodies, connection URLs, credentials, or secret values.
6. Independently rederive every manifest fact from the immutable snapshots before success. The verifier accepts no free-form real-source claim, success value, expected count, expected hash, local-origin claim, or witness ID.

Per-source mutation controls operate only on disposable derivatives after a healthy canonical-source baseline; they never mutate the admitted export, SQLite database/WAL/SHM, or blob root.

## Full source inventory and lossless disposition

Before loading, derive a complete inventory from the immutable snapshots. Never use a catalog count, a hand-maintained allowlist, only selected root names, or only the tables the loader already understands as the inventory boundary. `manifest.json` contains the following sorted arrays and a canonical SHA-256 for each array and their union:

1. `convex.filesystemEntries`: recursively inventory every direct-root entry and descendant with `lstat`, without following links or skipping dotfiles. Every source entry has exactly one manifest record containing canonical relative path, path-identity SHA-256, node type, deterministic logical size, content-or-tree SHA-256, root-owner class, disposition, target/formula, and mapped/archived identity digest. Regular-file size and digest come from exact bytes; directory size is the sum of descendant regular-file bytes and its tree digest covers the sorted immediate-child identity/type/size/digest tuples. The root-owner classes are cataloged table subtree, underscore system subtree, and root metadata. Root metadata is every discovered direct-root regular file not owned by the table or system classes; it is derived from the snapshot surface, never a filename allowlist, and each item is preserved as immutable nonmaterialized export metadata. Symlink and special-node types fail closed. Require a one-to-one source-entry-to-manifest-entry-to-snapshot-entry bijection, exact class partition, and exact pre/copy/post entry-set and digest equality.
2. `convex.tables`: discover the full snapshot set first by parsing every name in `_tables/documents.jsonl` and requiring exact equality with every non-underscore top-level table directory; only then reconcile it to catalog tables plus non-underscore catalog exclusions. For each table record its name, referenced `convex.filesystemEntries` identities, relative `documents.jsonl` and `generated_schema.jsonl` identities, schema digest, ordered row count/identity/content digest, observed-field digest, catalog-entry or derived-disposition digest, disposition, target/formula, and mapped/archived identity digest. A discovered table absent from the catalog, including `migrationFenceAudit`, may receive the versioned `source-backed-catalog-drift-archive` disposition only when every export identity/content digest is also losslessly accounted for in SQLite logical rows and provenance; preserve both source chains and never materialize deleted or synthetic bytes. Otherwise catalog drift is unmapped and fails. Catalog scalar expected counts never define or authorize the discovered set. Missing, extra, duplicate, malformed, omitted, or unmapped entries fail.
3. `convex.systemEntries`: reference every `convex.filesystemEntries` identity under an underscore-prefixed root entry, including `_tables`, `_storage`, and `_components`. Every entry must have exactly one versioned system disposition; an unlisted system entry, mismatched type/size/digest, or entry omitted from either manifest array fails.
4. `convex.storageMetadata` and `convex.storageObjects`: parse every `_storage/documents.jsonl` metadata identity and reference every non-metadata object in `convex.filesystemEntries`. Require a bijection between metadata identity and object file, with exact byte length/SHA-256/content type. Independently discover zero or more source-row field references to each storage identity and reconcile every discovered reference to a catalog storage-field disposition. Referenced objects retain all source refs; zero-reference metadata/object pairs receive the versioned source-derived `unreferenced-storage-evidence` disposition and preserve metadata plus exact bytes without inventing a catalog reference or product row. Missing, duplicate, orphaned, forged-reference, undispositioned, or unmapped metadata/object/reference entries fail, including objects approved for archive/drop.
5. `sqlite.physicalTables`: derive every `main` schema table from snapshot `PRAGMA table_list` except the SQLite pseudo-table `sqlite_schema`. Record name, SQLite type (`table`, `virtual`, or `shadow`), `sqlite_master.sql` digest, ordered column/PK digest, ordered row count/content digest, class, disposition, target/formula, and mapping digest. Table classes are application data, `etl_misc` envelope, provenance (`import_batches`, `import_row_provenance`), blob catalog (`file_objects`), schema metadata (`schema_migrations`), FTS virtual, and FTS shadow. Each physical table belongs to exactly one class; omission or an unknown/unmapped class fails.
6. `sqlite.logicalRows`: inventory application tables by their real primary-key identity and split every `etl_misc` row by its `table_name` plus `id`, after strict JSON parsing of `payload`. Each logical source table/class has a catalog-backed materialize/merge/archive/regenerate disposition and a lossless identity/content digest. Provenance and schema rows remain evidence; FTS virtual/shadow tables are explicitly derived/rebuilt and verified from their owning application tables. A nonmaterialized nonempty class requires an existing versioned approval plus lossless manifest accounting; no row disappears merely because it is not loaded as a standalone target row.
7. `sqlite.referencedBlobs` and `sqlite.blobFiles`: inventory every snapshot `file_objects` identity (`storage_id`, declared SHA-256/bytes/content type, hashed relative-path identity), every referring logical row/field, and every recursively discovered snapshot blob file. Each unique `storage_id` must map totally to exactly one CAS key `(canonical relative path, recomputed SHA-256, byte length)`, but multiple storage identities may map to one CAS object only in an explicitly proven dedup group whose members have the same declared path/hash/bytes/content type, recomputed exact bytes, and complete source references. A storage identity mapping to multiple CAS keys, different bytes sharing one claimed CAS key/path, or an alias lacking complete proof is an invalid collision. Every discovered unreferenced file receives a lossless immutable nonmaterialized disposition and remains in pre/copy/post drift hashes. Missing, replaced, invalid-alias, collision, traversal, omitted, orphaned, or unmapped identities/files fail.

For each source class, require `source identities = materialized identities + explicitly nonmaterialized identities`, disjointly and without omissions; every materialized identity must have one target mapping and every nonmaterialized identity must retain its source digest and approved disposition. The complete export filesystem additionally requires `source lstat entry identities = convex.filesystemEntries identities = snapshot lstat entry identities`, with an exact three-class root-owner partition. Global unmapped, omitted, unclassified, duplicate, ambiguous-disposition, type-mismatch, size-mismatch, and digest-mismatch counts must all be zero. This inventory accounting is conjunctive with row/content/FK/blob reconciliation; counts alone never authorize success.

## Two-way local provenance accounting

The verifier first full-outer-joins materialized identities and provenance identities for every mapped table, classifies every identity exactly once as materialized-only, both, or provenance-only, and rejects any unclassified identity or unexplained materialized-only imported row. The local-document policy refines the full-outer join on `(table_name='documents', row_id)`:

- `materialized-local`: a local document and its local provenance row both exist.
- `provenance-only-tombstone`: the local provenance identity exists but the materialized document does not. Preserve its identifiers and a `canonical-provenance-record-v1` SHA-256 over the RFC 8785 canonical JSON object containing exactly `table_name`, `row_id`, `import_batch_id`, `source_origin`, `first_imported_at`, `last_imported_at`, and `import_count`. This attests only to available normalized provenance fields; it is never described as a deleted source-row or document-content digest, and no document row or bytes are invented.
- `materialized-local-missing-provenance`: a local document exists without its required provenance. This is an error, never an inferred success.

Require both equations:

```text
N = materializedLocalWithProvenance + materializedLocalMissingProvenance
P = materializedLocalWithProvenance + M
N > 0
P >= N
```

Here `N` is the snapshot-derived materialized local-document count, `M` is the snapshot-derived classified provenance-only tombstone count, and `P` is the snapshot-derived local-document provenance count. `materializedLocalMissingProvenance` and `unclassifiedLocalProvenance` must be zero. No prior observed cardinality can authorize success or be compared as an expected count.

The `local-writes` batch is valid only when the snapshot row itself has `id='local-writes'`, `source='local'`, `deployment IS NULL`, `cutover_date='ongoing'`, positive `started_at`, `finished_at IS NULL`, `export_path IS NULL`, `stats_json IS NULL`, and `note='Post-cutover local writes'`. Each materialized local document must carry `source_origin='local'` and `import_batch_id='local-writes'`; its provenance row must have the same origin/batch, positive finite timestamps with `first_imported_at <= last_imported_at`, and `import_count >= 1`. Each tombstone digest is recomputed independently from the same seven typed SQLite fields and must identify exactly one `(table_name,row_id)` provenance record; omitted fields, alternate normalization, a hand-authored digest, or one digest ambiguously assigned to multiple records fails. A manifest declaration cannot replace these semantic source facts.

For every mapped table, expected identities are the lossless union of export materialized identities, SQLite-only materialized identities, and classified provenance-only identities. Common materialized identities must agree on canonical content bytes. The loader imports materialized rows only, uses production transforms and `convex_id_map` lineage, and reconciles missing and extra target identities while retaining tombstone accounting in the manifest.

## Witness, release identity, authentication, and exact Postgres/Hono binding

Select one real, non-empty document witness per source origin (`convex`, `local`). For each candidate:

```text
contentSha256 = sha256(exact UTF-8 source content bytes)
identityKey = sha256(sourceOrigin + NUL + "documents" + NUL + sourceId + NUL + contentSha256)
```

Choose the lexicographically smallest `identityKey` per origin. Resolve exactly one `convex_id_map` row with `table_name='documents'`, `old_id=sourceId`, and `new_id=mappedPostgresId`, and require the reverse `(table_name,new_id)` lookup also resolves only that source identity. Local SQLite documents receive the same mapping contract during composite loading. Zero, multiple, conflicting, or cross-table mappings fail.

The only external witness API is authenticated `GET /api/documents/{id}`, where `{id}` is `encodeURIComponent(mappedPostgresId)`. It has no query string or request body. `/api/content-probe`, any collection route, and any alternate path/method are forbidden witness surfaces. Capture raw response bytes, require HTTP 200 and media type `application/json` with UTF-8 charset, decode with fatal UTF-8 validation, and require this success schema with no type coercion:

```text
{
  document: {
    id: string == mappedPostgresId,
    title: string | null,
    content: nonempty string,
    category: string | null,
    status: string | null,
    date: string | null
  },
  data_plane: "postgres",
  source: "postgres"
}
```

For each origin, persist one chain record satisfying `sourceId -> mappedPostgresId -> response.document.id`, `response.document.id == mappedPostgresId`, source-snapshot origin equals the chain origin, and `sha256(UTF8(response.document.content)) == directPostgresContentSha256 == sourceSnapshotContentSha256`. UTF-8 content is hashed exactly with no trimming, normalization, replacement decoding, or reserialization. The response `source` field denotes the serving data plane and must never be inferred as corpus origin; origin comes only from the independently verified source/provenance identity. Evidence may contain IDs, origin, content length, hashes, and `identityKey`, but no content bytes. No fixed ID, title, body fragment, fixture record, arbitrary route result, or hand-authored expected hash may influence selection.

The product-surface proof must use an operator-provided Hono base URL that was already listening before the verifier started, and the verifier must run in the same host and socket/container observation namespace as that listener. The verifier must not launch its positive-path Hono server. The operator independently provides `MK6_DATA_RELEASE_LOCK_PATH`, an immutable release lock containing the exact expected `sourceRevision`, `imageDigest`, `composeGeneration`, `composeSha256`, host, runtime tuple, and canonical deployed compose-release artifact identity. The lock cannot be derived from `/health`, the server under test, the running container, or the verifier's current checkout. Existing `verifyExternalDeploymentIdentity` from `services/platform/src/http/deployment-identity.ts` validates the HTTP tuple, while independent read-only kernel/process/container observation binds that tuple to the actual listener.

Before loading and again after external witness reads, the verifier fetches real `/health` and requires:

- HTTP readiness plus a positive PID unequal to the verifier PID; canonical read-only kernel socket observation (`lsof`/`ss` for the exact effective address/port) yields one owner PID, and process-table/cgroup observation proves that PID started before the verifier and owns the running Hono container/process. `/health` PID is corroboration only and must equal this independently observed owner; it cannot establish ownership itself.
- `database_target.fingerprint` equals the credential-free `database-target-v1` fingerprint independently derived from the direct isolated Postgres connection before loading and after probes.
- Direct pre/post fingerprints agree, health pre/post fingerprints agree, and all four identify the same host/effective-port/database tuple without printing the connection URL.
- The PID-owned container/process is inspected read-only through the canonical host runtime: its immutable running image/executable digest, source-revision attestation, compose generation/labels, and realpath/no-symlink deployed compose-release artifact SHA-256 must match the independent release lock. `/health.deployment.identity` must match the same fields before and after, but copied health values cannot substitute for the OS/container/artifact observations. Only sanitized hashes/identifiers and the release-lock SHA-256 are captured.
- Both external witness reads use the pinned document-read API on that same pre-existing process and satisfy the unique source-to-mapping-to-external identity/origin/content-hash chain.

A wrong-target Hono process, a verifier-created listener returning self-minted health/content JSON, a pre-started correct-target impostor under the wrong code identity, and a pre-existing correct-database impostor that copies every `/health` identity value must fail when the independently observed PID-owned image/executable or compose release artifact differs from the lock—even when response shapes, copied identities, and witness hashes appear valid.

External witness requests require one operator-loaded RN-scoped bearer token under the names-only inputs `HOLO_KEY_RN` (preferred) or `MK6_DATA_EXTERNAL_BEARER_TOKEN` (an explicitly supplied RN-authorized verifier token). The operator loads it from the local `.env`, `services/platform/config/secrets.yaml`, or an explicitly selected `HOLOCRON_SECRETS_PATH`/`HOLO_SECRETS_PATH`; the verifier does not read or copy secret stores into evidence. It sends exactly `Authorization: Bearer <token>` on each witness request. It must fail as `WITNESS_AUTH_MISSING` before issuing a witness request when no token is available, reject HTTP 401 or 403 as `WITNESS_AUTH_REJECTED` without an unauthenticated retry, and never print the token, header, or credential-bearing source value.

## Acceptance Criteria

- [ ] AC-1: `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --case composite-positive --json` admits only the canonical composite source, proves symmetric semantic pre/copy/post equality for export/SQLite/blobs, derives lossless two-way provenance, loads the materialized union into isolated real Postgres, and proves non-empty source/content/FK/blob parity plus two selected witnesses through the exact pre-existing Hono process bound to that Postgres target.
- [ ] AC-2: `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control count-equal-content-corrupt --json` succeeds only when a byte mutation in isolated Postgres preserves row counts but is rejected as `CONTENT_DIGEST_MISMATCH`.
- [ ] AC-3: `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control provenance-matrix --json` succeeds only when missing local delta, forged general provenance, missing materialized-local provenance, dropped provenance-only tombstone, forged local-batch semantics, and forged or ambiguous canonical provenance-record digests are rejected with their specified failure classes.
- [ ] AC-4: `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control snapshot-blob-matrix --json` succeeds only when independent export, SQLite, and complete blob-inventory post-snapshot drift plus missing/replaced referenced blobs and mutated/omitted/unmapped unreferenced blob files are rejected with their specified failure classes.
- [ ] AC-5: `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control identity-source-matrix --json` succeeds only when nonexistent selected document, fixture path, arbitrary source clone, and symlink source indirection are rejected with their specified failure classes.
- [ ] AC-6: `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control external-binding-matrix --json` succeeds only when a pre-existing Hono bound to the wrong Postgres target, a verifier-created listener, a wrong-code process, and a correct-database impostor copying `/health` identity are rejected by direct target plus independent OS/container/release-artifact observation.
- [ ] AC-7: `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control witness-auth-matrix --json` succeeds only when absent witness credentials fail before any witness request as `WITNESS_AUTH_MISSING` and real HTTP 401/403 responses fail as `WITNESS_AUTH_REJECTED` without credential/header disclosure or unauthenticated retry.
- [ ] AC-8: `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control full-inventory-matrix --json` succeeds only when every recursively discovered Convex entry, snapshot-first catalog drift, zero-ref storage pair, SQLite class, storage-identity-to-CAS mapping, and referenced/unreferenced blob file is losslessly dispositioned and every named mutant is rejected.
- [ ] AC-9: `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control external-witness-contract-matrix --json` succeeds only when arbitrary content-probe, wrong route/method, missing/wrong/ambiguous mappings, wrong external ID/origin/digest, and invalid UTF-8/response schema are rejected.

Each negative-control invocation must first pass the unmodified real baseline, mutate only a disposable derivative or isolated target, observe the exact named rejection, and then exit zero. It exits non-zero if the mutant is accepted, the baseline is unhealthy, the expected class is absent, or retained sources are touched.

## Test Criteria

| ID | Binary statement | Maps | Verify |
|---|---|---|---|
| TC-1 | The canonical composite source, isolated Postgres, and exact pre-existing Hono target agree across all required identities and bytes. | AC-1 | `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --case composite-positive --json` |
| TC-2 | Count-equal byte corruption is rejected. | AC-2 | `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control count-equal-content-corrupt --json` |
| TC-3 | Omitting all local materialized delta rows is rejected. | AC-3 | `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control missing-local-delta --json` |
| TC-4 | Forging provenance without matching source records is rejected. | AC-3 | `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control forged-provenance --json` |
| TC-5 | Changing a disposable export source after snapshot is rejected. | AC-4 | `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control export-mutated-after-snapshot --json` |
| TC-6 | Removing one referenced blob from a disposable snapshot is rejected. | AC-4 | `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control missing-blob --json` |
| TC-7 | Replacing referenced snapshot blob bytes is rejected. | AC-4 | `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control replaced-blob --json` |
| TC-8 | A selected document absent from source bytes is rejected. | AC-5 | `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control nonexistent-selected-document --json` |
| TC-9 | A repository fixture or synthetic source path is rejected. | AC-5 | `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control fixture-path --json` |
| TC-10 | Changing a disposable SQLite source after snapshot is rejected by its second-backup semantic digest. | AC-4 | `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control sqlite-mutated-after-snapshot --json` |
| TC-11 | Changing referenced bytes in a disposable blob source after snapshot is rejected. | AC-4 | `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control blob-source-mutated-after-snapshot --json` |
| TC-12 | An unproven or modified copied source tree outside the admitted canonical root is rejected. | AC-5 | `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control arbitrary-source-clone --json` |
| TC-13 | Any symlink in the canonical root or source path chain is rejected. | AC-5 | `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control symlink-source-indirection --json` |
| TC-14 | Hono health bound to a different database target is rejected. | AC-6 | `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control wrong-postgres-target --json` |
| TC-15 | A verifier-created listener with self-minted health/content JSON is rejected. | AC-6 | `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control self-minted-listener --json` |
| TC-16 | A materialized local document without local provenance is rejected. | AC-3 | `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control missing-materialized-local-provenance --json` |
| TC-17 | Dropping a provenance-only tombstone identity from accounting is rejected. | AC-3 | `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control dropped-provenance-tombstone --json` |
| TC-18 | Forging any semantic field of the local-writes batch or row lineage is rejected. | AC-3 | `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control forged-local-batch-fields --json` |
| TC-19 | A pre-started correct-target server with copied bytes but wrong release identity is rejected. | AC-6 | `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control wrong-code-identity --json` |
| TC-20 | Missing witness credentials fail before the first witness request. | AC-7 | `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control missing-witness-auth --json` |
| TC-21 | A real witness HTTP 401 or 403 is rejected without unauthenticated retry. | AC-7 | `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control witness-auth-rejected --json` |
| TC-22 | Omitting any retained Convex table from the inventory is rejected. | AC-8 | `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control omitted-convex-table --json` |
| TC-23 | Leaving any retained Convex table without a lossless disposition/mapping is rejected. | AC-8 | `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control unmapped-convex-table --json` |
| TC-24 | Omitting any Convex storage metadata/object identity is rejected. | AC-8 | `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control omitted-convex-storage-object --json` |
| TC-25 | Leaving any Convex storage metadata/object identity unmapped is rejected. | AC-8 | `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control unmapped-convex-storage-object --json` |
| TC-26 | Omitting any SQLite physical table, logical `etl_misc` table, or class is rejected. | AC-8 | `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control omitted-sqlite-table-or-class --json` |
| TC-27 | Leaving any SQLite physical/logical table or class without a lossless disposition/mapping is rejected. | AC-8 | `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control unmapped-sqlite-table-or-class --json` |
| TC-28 | Omitting any referenced SQLite blob identity/file is rejected. | AC-8 | `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control omitted-referenced-blob --json` |
| TC-29 | Leaving any referenced SQLite blob without a lossless mapping is rejected. | AC-8 | `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control unmapped-referenced-blob --json` |
| TC-30 | Using `/api/content-probe` as either witness surface is rejected. | AC-9 | `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control arbitrary-content-probe --json` |
| TC-31 | Using the wrong route or HTTP method is rejected. | AC-9 | `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control wrong-document-route --json` |
| TC-32 | A selected source document without exactly one mapping row is rejected. | AC-9 | `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control missing-document-mapping --json` |
| TC-33 | A response document ID different from the unique mapped Postgres ID is rejected. | AC-9 | `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control wrong-witness-external-id --json` |
| TC-34 | A witness chain with the wrong source origin is rejected. | AC-9 | `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control wrong-witness-origin --json` |
| TC-35 | A witness response with a wrong exact UTF-8 content digest is rejected. | AC-9 | `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control wrong-witness-content-digest --json` |
| TC-36 | Duplicate or conflicting forward/reverse document mappings are rejected. | AC-9 | `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control ambiguous-document-mapping --json` |
| TC-37 | A document-read success body outside the pinned response schema is rejected. | AC-9 | `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control invalid-witness-response-schema --json` |
| TC-38 | Invalid or replacement-decoded UTF-8 witness bytes are rejected. | AC-9 | `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control invalid-witness-utf8 --json` |
| TC-39 | Omitting the deterministic discovered root-metadata entry from a disposable export snapshot is rejected. | AC-8 | `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control omitted-convex-root-metadata --json` |
| TC-40 | Retyping the deterministic discovered root-metadata entry in its manifest is rejected. | AC-8 | `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control retyped-convex-root-metadata --json` |
| TC-41 | Same-size replacement bytes for the deterministic discovered root-metadata file are rejected. | AC-8 | `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control replaced-convex-root-metadata --json` |
| TC-42 | Omitting a snapshot-discovered catalog-drift table from lossless accounting is rejected. | AC-8 | `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control omitted-convex-catalog-drift-entry --json` |
| TC-43 | Leaving a snapshot-discovered catalog-drift table without its proven source-backed disposition is rejected. | AC-8 | `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control unmapped-convex-catalog-drift-entry --json` |
| TC-44 | A local blob alias without identical declared and recomputed CAS evidence is rejected. | AC-8 | `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control invalid-local-blob-alias --json` |
| TC-45 | One local storage identity mapping to multiple CAS objects or conflicting bytes sharing a CAS key is rejected. | AC-8 | `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control local-blob-cas-collision --json` |
| TC-46 | A declared local CAS alias whose exact bytes disagree with its group is rejected. | AC-8 | `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control local-blob-byte-mismatch --json` |
| TC-47 | Omitting a zero-reference Convex storage metadata/object pair is rejected. | AC-8 | `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control omitted-unreferenced-convex-storage-object --json` |
| TC-48 | Leaving a zero-reference Convex storage pair without its source-derived disposition is rejected. | AC-8 | `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control unmapped-unreferenced-convex-storage-object --json` |
| TC-49 | Inventing a source-row or catalog reference for an unreferenced Convex storage pair is rejected. | AC-8 | `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control forged-convex-storage-reference --json` |
| TC-50 | Post-snapshot drift in a discovered unreferenced local blob file is rejected. | AC-4 | `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control unreferenced-blob-source-mutated-after-snapshot --json` |
| TC-51 | Omitting a discovered unreferenced local blob file is rejected. | AC-4 | `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control omitted-unreferenced-blob-file --json` |
| TC-52 | Leaving a discovered unreferenced local blob file without a lossless disposition is rejected. | AC-4 | `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control unmapped-unreferenced-blob-file --json` |
| TC-53 | A correct-database impostor copying all `/health` identity fields fails independent OS/container/artifact observation. | AC-6 | `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control copied-health-identity-impostor --json` |
| TC-54 | A hand-authored or stale provenance-record digest for a tombstone is rejected. | AC-3 | `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control forged-tombstone-provenance-digest --json` |
| TC-55 | A tombstone digest omitting fields or ambiguously identifying multiple provenance records is rejected. | AC-3 | `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control ambiguous-tombstone-provenance-digest --json` |

Static seed corpora, fixture archives, arbitrary clones, symlinked sources, loader-known-only inventories, catalog-count inventories, table/system-only export inventories, root-filename allowlists, omitted or unmapped source classes/objects/metadata, authorizing historical counts, row-count-only checks, one-sided source hashes, raw live-SQLite copies, existence-only blob checks, successful empty reads, health-derived expected release identity, `/api/content-probe`, ambiguous ID mapping, lossy/nonfatal UTF-8 decoding, unauthenticated witness requests, self-started positive-path Hono, and tests that pass with Postgres or Hono stopped are non-oracles.

## Implementation boundary and MCP branch decision

MK6-DATA-001 does **not** require the local-only MCP branch to land first. The platform task consumes the already-materialized SQLite format through new `services/platform/src/etl/composite-corpus.ts` code and does not import source from the MCP worktree. The read-only schema reference is branch `mcp-sqlite-local` at `85c49b0abc8bf103c20c82e980eb55154ea2311c`. Existing `services/platform/src/db/connection.ts` and `services/platform/src/http/health.ts` remain read-only dependencies. Existing `scopeExportForEtl` is not a completeness boundary because it drops uncataloged tables and storage; the composite loader discovers and accounts for the immutable raw snapshot first and derives the source-backed catalog-drift/unreferenced dispositions inside the already-allowed composite ETL/reconcile paths.

Implementation may modify only the eight listed source/test/script paths. Generated writes are limited to a newly created `.tmp/MK6-DATA-001/${RUN_ID}/**`, the operator-authorized isolated Postgres target, and loopback impostor listeners used only as rejection mutants. The retained export, live SQLite database/WAL/SHM, local blob store, release lock, operator secret stores, operator non-target databases, pre-existing Hono process, MCP worktree, and repository fixtures are read-only. No package or schema migration is implied; discovery of a required additional path or dependency triggers another spec repair before implementation.

## Human verification

The operator must accept the recovered `$HOME/.holocron` default or explicitly name one equivalent canonical root, invoke the verifier in the already-listening Hono process's host/runtime observation namespace, provide the Hono base URL, isolated direct Postgres connection, independent release-lock path, and one named bearer-token environment variable, and authorize only run-scoped snapshots plus writes to that isolated target. The operator reviews complete export/blob inventory digests, every disposition and CAS alias group, snapshot-derived equations, provenance-record digests, witness mapping chains, identifiers/counts/hashes, kernel-observed listener/process identity, running image/executable and deployed compose artifact hashes, database-target and release-lock fingerprints, and manifest hash. No historical count authorizes success; no research body, connection URL, token, authorization header, or secret-bearing process metadata may be printed.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "MK6-DATA-001",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "data_plane_contract": {
    "schema": "holocron.mk6.composite-corpus.v2",
    "sources": [
      "convex-export",
      "sqlite-database",
      "sqlite-blob-store"
    ],
    "source_admission": {
      "canonical_root_default": "$HOME/.holocron",
      "explicit_equivalent_root_env": "MK6_DATA_CANONICAL_ROOT",
      "derived_relative_paths": {
        "convex-export": "exports/convex-dev-cutover-2026-08-09",
        "sqlite-database": "holocron.db",
        "sqlite-blob-store": "blobs"
      },
      "require_absolute_realpath_equality": true,
      "reject_symlink_in_any_component": true,
      "arbitrary_per_source_override_allowed": false,
      "equivalent_root_proof": "all-three-preflight-semantic-identities-equal-recovered-default-while-default-exists",
      "rejected_root_classes": [
        "repository",
        "worktree",
        "run-root",
        "project-.tmp",
        "system-temp",
        "fixtures",
        "testdata",
        "generated-copy"
      ]
    },
    "snapshot_semantics": {
      "convex-export": {
        "copy": "run-scoped-complete-tree-copy",
        "semantic_digest": "sorted-recursive-lstat-relative-path-identity+node-type+deterministic-logical-size+content-or-tree-sha256",
        "entry_policy": "every-direct-root-entry-and-descendant-no-follow-no-skip-dotfiles-reject-symlink-or-special-node",
        "required_equal_checkpoints": [
          "export-source-pre",
          "export-snapshot-copy",
          "export-source-post"
        ]
      },
      "sqlite-database": {
        "copy": "sqlite-backup-api-never-raw-copy",
        "quick_check": "ok",
        "semantic_digest": "schema+ordered-mapped-tables+import_batches+import_row_provenance+file_objects",
        "required_equal_checkpoints": [
          "sqlite-source-backup-pre",
          "sqlite-snapshot-copy",
          "sqlite-source-backup-post"
        ]
      },
      "sqlite-blob-store": {
        "copy": "run-scoped-complete-inventory-copy",
        "verification": "complete-discovered-inventory-byte-sha256-never-referenced-only-or-existence-only",
        "semantic_digest": "sorted-every-discovered-relative-path-identity+node-type+byte-length+sha256",
        "discovery": "recursive-lstat-every-blob-root-entry-before-file_objects-join-no-follow",
        "required_equal_checkpoints": [
          "blob-source-pre",
          "blob-snapshot-copy",
          "blob-source-post"
        ],
        "unreferenced_files": "explicit-immutable-nonmaterialized-disposition-and-included-in-pre-copy-post-digest"
      }
    },
    "full_inventory": {
      "schema": "holocron.mk6.full-source-inventory.v1",
      "boundary": "derive-complete-snapshot-surface-never-loader-known-set-or-catalog-count",
      "manifest_arrays": [
        "convex.filesystemEntries",
        "convex.tables",
        "convex.systemEntries",
        "convex.storageMetadata",
        "convex.storageObjects",
        "sqlite.physicalTables",
        "sqlite.logicalRows",
        "sqlite.referencedBlobs",
        "sqlite.blobFiles"
      ],
      "convex_filesystem_entries": {
        "discovery": "recursive-lstat-every-direct-root-entry-and-descendant-without-following-links-or-skipping-dotfiles",
        "allowed_node_types": [
          "directory",
          "regular-file"
        ],
        "unsupported_node_policy": "symlink-or-special-node-fails-closed-after-discovery-never-followed",
        "per_item_fields": "canonical-relative-path+path-identity-sha256+node-type+deterministic-logical-size-bytes+content-or-tree-sha256+root-owner-class+disposition+target-or-formula+mapped-or-archived-identity-sha256",
        "size_policy": "regular-file=exact-byte-length;directory=sum-descendant-regular-file-byte-lengths",
        "digest_policy": "regular-file=sha256-exact-bytes;directory=sha256-sorted-immediate-child-relative-path-identity+type+size+digest-tuples",
        "root_owner_classes": [
          "cataloged-table-subtree",
          "underscore-system-subtree",
          "root-metadata"
        ],
        "root_metadata_discovery": "every-discovered-direct-root-regular-file-not-owned-by-table-or-underscore-system-class-never-filename-allowlist",
        "root_metadata_disposition": "preserve-as-immutable-nonmaterialized-export-metadata-with-source-digest-and-mapped-or-archived-identity",
        "negative_control_selection": "lexicographically-smallest-path-identity-sha256-among-discovered-root-metadata-regular-files-with-nonempty-bytes",
        "required_bijection": "source-lstat-entry-identities=manifest-filesystem-entry-identities=snapshot-lstat-entry-identities-one-to-one",
        "required_partition": "every-filesystem-entry-owned-by-exactly-one-root-owner-class"
      },
      "convex_tables": {
        "discovery": "snapshot-first-parse-every-name-from-_tables/documents.jsonl-and-equal-nonunderscore-top-level-table-directories-before-catalog-reconcile",
        "required_files": [
          "documents.jsonl",
          "generated_schema.jsonl"
        ],
        "per_item_fields": "name+filesystem-entry-identities+relative-file-identities+schema-sha256+row-count+row-identity-sha256+row-content-sha256+observed-field-sha256+catalog-entry-or-derived-disposition-sha256+disposition+target-or-formula+mapped-or-archived-identity-sha256",
        "mapping_authority": ".spec/prds/mk6-migration/10-technical-requirements/12-convex-source-catalog.yaml",
        "set_equation": "_tables-names=nonunderscore-table-directories=manifest-convex-table-names=cataloged-identities+source-backed-catalog-drift-identities",
        "catalog_reconciliation": "discovered-set-first-then-catalog-tables-plus-nonunderscore-exclusions-never-catalog-count-first",
        "catalog_drift_disposition": "source-backed-catalog-drift-archive-only-if-every-export-identity-and-content-digest-is-losslessly-accounted-in-sqlite-logical-rows-and-provenance",
        "required_catalog_drift_member": "migrationFenceAudit-without-hardcoded-row-count",
        "catalog_scalar_expected_counts_authorize_success": false
      },
      "convex_system_entries": {
        "discovery": "recursive-every-underscore-prefixed-root-entry",
        "per_item_fields": "relative-path+type+bytes+sha256+versioned-system-disposition",
        "required_named_classes": [
          "_tables",
          "_storage",
          "_components"
        ]
      },
      "convex_storage": {
        "metadata_source": "every-row-of-_storage/documents.jsonl",
        "object_source": "every-nonmetadata-file-under-_storage",
        "bijection": "one-metadata-identity-to-one-object-file",
        "reference_discovery": "zero-or-more-source-row-field-references-per-storage-identity-derived-before-catalog-reconcile",
        "referenced_policy": "all-discovered-source-refs-reconciled-to-catalog-storage-field-dispositions",
        "unreferenced_policy": "zero-ref-metadata-object-pair-gets-versioned-source-derived-unreferenced-storage-evidence-disposition-without-invented-ref-or-product-row",
        "per_item_fields": "storage-id+internal-id-hash+filesystem-entry-identity+bytes+sha256+content-type+all-discovered-source-row-refs+catalog-ref-or-unreferenced-authority+disposition+target-or-archive-identity",
        "include_nonmaterialized": true,
        "exactly_one_catalog_ref_required": false
      },
      "sqlite_tables": {
        "discovery": "snapshot-PRAGMA-table_list-main-schema-excluding-sqlite_schema",
        "sqlite_types": [
          "table",
          "virtual",
          "shadow"
        ],
        "classes": [
          "application-data",
          "etl-misc-envelope",
          "provenance",
          "blob-catalog",
          "schema-metadata",
          "fts-virtual",
          "fts-shadow"
        ],
        "per_item_fields": "name+sqlite-type+sqlite-master-sql-sha256+ordered-column-pk-sha256+row-count+ordered-row-content-sha256+class+disposition+target-or-formula+mapping-sha256",
        "one_class_per_physical_table": true
      },
      "sqlite_logical_rows": {
        "application_identity": "real-primary-key",
        "etl_misc_expansion": "strict-json-payload-grouped-by-table_name+id",
        "nonmaterialized_policy": "existing-versioned-approval+lossless-manifest-identity-and-content-digest",
        "fts_policy": "explicit-derived-rebuild-and-owner-table-equivalence",
        "provenance_schema_policy": "evidence-not-standalone-product-row"
      },
      "sqlite_blobs": {
        "reference_source": "every-file_objects-row-plus-every-logical-row-field-reference",
        "identity": "storage_id+declared-sha256+declared-bytes+content-type+hashed-relative-path",
        "identity_to_cas_mapping": "total-function-every-unique-storage_id-to-exactly-one-canonical-relative-path+recomputed-sha256+byte-length-CAS-key",
        "many_to_one_cas_allowed": "only-explicit-dedup-groups-with-identical-declared-path-hash-bytes-content-type+recomputed-exact-bytes+complete-source-refs",
        "collision_policy": "reject-one-storage-id-to-multiple-CAS-keys-or-conflicting-bytes-sharing-claimed-key-or-path",
        "per_dedup_group_fields": "cas-key+canonical-relative-path+recomputed-sha256+byte-length+content-type+sorted-storage-ids+sorted-source-row-refs+group-proof-sha256",
        "blob_file_discovery": "recursive-complete-snapshot-blob-files-before-reference-join",
        "unreferenced_policy": "lossless-immutable-nonmaterialized-file-disposition-included-in-pre-copy-post-digest-never-invent-materialized-row"
      },
      "source_item_equation": "source-identities=materialized-identities+explicitly-nonmaterialized-identities-disjoint",
      "required_zero_counts": [
        "unmappedSourceItemCount",
        "omittedSourceItemCount",
        "duplicateSourceIdentityCount",
        "ambiguousDispositionCount",
        "convexFilesystemEntryOmittedCount",
        "convexFilesystemEntryUnclassifiedCount",
        "convexFilesystemEntryDuplicateCount",
        "convexFilesystemEntryAmbiguousDispositionCount",
        "convexFilesystemEntryTypeMismatchCount",
        "convexFilesystemEntrySizeMismatchCount",
        "convexFilesystemEntryDigestMismatchCount",
        "convexRootEntryClassMismatchCount",
        "convexRootMetadataOmittedCount",
        "convexCatalogDriftOmittedCount",
        "convexCatalogDriftUnmappedCount",
        "convexTableSetMismatchCount",
        "convexStorageBijectionMismatchCount",
        "convexStorageUnreferencedUndispositionedCount",
        "convexStorageForgedReferenceCount",
        "sqliteUnclassifiedPhysicalTableCount",
        "sqliteUnclassifiedLogicalTableCount",
        "sqliteBlobIdentityUnmappedCount",
        "sqliteBlobInvalidAliasCount",
        "sqliteBlobCasCollisionCount",
        "sqliteBlobByteMismatchCount",
        "sqliteBlobFileOmittedCount",
        "sqliteBlobFileUndispositionedCount"
      ],
      "canonical_array_hashes_required": true
    },
    "provenance": {
      "mode": "operator-invoked-derived-attestation",
      "facts_from": [
        "convex-export-source-bytes",
        "sqlite-import_batches",
        "sqlite-import_row_provenance",
        "sqlite-source-rows",
        "sqlite-file_objects"
      ],
      "allow_handwritten_expected_hash": false,
      "allow_handwritten_expected_count": false,
      "forbidden_assertions": [
        "source=real",
        "hand-authored-success",
        "hand-authored-expected-count",
        "hand-authored-expected-hash",
        "hand-authored-local-origin"
      ]
    },
    "local_provenance_accounting": {
      "all_mapped_table_policy": "full-outer-join-materialized-and-provenance-identities-classify-each-exactly-once",
      "all_mapped_table_required_zero_counts": [
        "unclassifiedSourceOrProvenanceIdentity",
        "unexplainedMaterializedImportedIdentity"
      ],
      "join_identity": "table_name=documents+row_id",
      "classifications": [
        "materialized-local",
        "provenance-only-tombstone",
        "materialized-local-missing-provenance"
      ],
      "required_equations": [
        "N=materializedLocalWithProvenance+materializedLocalMissingProvenance",
        "P=materializedLocalWithProvenance+M"
      ],
      "required_inequalities": [
        "N>0",
        "P>=N",
        "M>=0"
      ],
      "required_zero_counts": [
        "materializedLocalMissingProvenance",
        "unclassifiedLocalProvenance"
      ],
      "local_batch_fields": {
        "id": "local-writes",
        "source": "local",
        "deployment": null,
        "cutover_date": "ongoing",
        "started_at": "positive-integer",
        "finished_at": null,
        "export_path": null,
        "stats_json": null,
        "note": "Post-cutover local writes"
      },
      "local_row_fields": {
        "source_origin": "local",
        "import_batch_id": "local-writes",
        "timestamps": "positive-and-ordered",
        "import_count": ">=1"
      },
      "tombstone_digest": {
        "schema": "canonical-provenance-record-v1",
        "algorithm": "sha256-RFC8785-canonical-JSON-UTF8",
        "exact_fields": [
          "table_name",
          "row_id",
          "import_batch_id",
          "source_origin",
          "first_imported_at",
          "last_imported_at",
          "import_count"
        ],
        "semantic_scope": "available-normalized-import_row_provenance-fields-only-never-deleted-source-row-or-document-content-bytes",
        "required_mapping": "one-recomputed-digest-to-exactly-one-table_name+row_id-record-with-all-seven-fields",
        "forbid_hand_authored_or_ambiguous_digest": true
      },
      "provenance_only_policy": "preserve-identity-and-canonical-provenance-record-digest-never-claim-deleted-content-never-materialize",
      "historical_corpus_counts_authorize_success": false
    },
    "witness_selection": {
      "origins": [
        "convex",
        "local"
      ],
      "requires_nonempty_source_bytes": true,
      "formula": "sha256(sourceOrigin+NUL+documents+NUL+sourceId+NUL+sha256(exactUtf8ContentBytes))",
      "selection": "lexicographically-smallest-identityKey-per-origin",
      "mapping": {
        "table": "convex_id_map",
        "forward": "exactly-one-row-table_name=documents+old_id=sourceId-yields-new_id=mappedPostgresId",
        "reverse": "exactly-one-row-table_name=documents+new_id=mappedPostgresId-yields-old_id=sourceId",
        "local_documents_require_mapping": true,
        "zero_or_ambiguous_mapping_failure": "WITNESS_MAPPING_MISMATCH"
      },
      "boundaries": [
        "source-snapshot",
        "direct-postgres",
        "external-product-surface"
      ]
    },
    "external_witness_api": {
      "method": "GET",
      "route_template": "/api/documents/:id",
      "path_parameter": "id=encodeURIComponent(mappedPostgresId)",
      "query": "none",
      "request_body": "none",
      "success_status": 200,
      "content_type": "application/json; charset=UTF-8",
      "decode": "fatal-utf8-no-bom-replacement-trim-normalize-or-reserialize",
      "required_server_scope": "rn",
      "schema_mode": "exact-no-additional-properties-no-coercion",
      "response_schema": {
        "document": {
          "id": "string-equals-mappedPostgresId",
          "title": "string-or-null",
          "content": "nonempty-string",
          "category": "string-or-null",
          "status": "string-or-null",
          "date": "string-or-null"
        },
        "data_plane": "postgres",
        "source": "postgres"
      },
      "origin_rule": "response-source-is-serving-plane-never-corpus-origin; origin-only-from-source-provenance-chain",
      "content_hash": "sha256-exact-UTF8-response.document.content",
      "chain": "sourceId->unique-mappedPostgresId->response.document.id plus sourceOrigin and equal source/direct-postgres/external contentSha256",
      "chain_fields": [
        "sourceOrigin",
        "sourceId",
        "identityKey",
        "mappingTable",
        "mappedPostgresId",
        "externalId",
        "sourceContentSha256",
        "directPostgresContentSha256",
        "externalContentSha256"
      ],
      "chain_equalities": [
        "mappingTable=documents",
        "sourceId=convex_id_map.old_id",
        "mappedPostgresId=convex_id_map.new_id=directPostgres.id=externalId=response.document.id",
        "sourceOrigin=source-snapshot-or-provenance-origin",
        "sourceContentSha256=directPostgresContentSha256=externalContentSha256"
      ],
      "forbidden_surfaces": [
        "/api/content-probe",
        "/api/documents collection",
        "alternate-route-or-method"
      ]
    },
    "postgres_external_binding": {
      "direct_target": "operator-authorized-isolated-real-postgres",
      "external_base_url_env": "MK6_DATA_EXTERNAL_BASE_URL",
      "health_path": "/health",
      "server_requirement": "pre-existing-before-verifier-start-never-positive-path-self-start",
      "observation_namespace": "verifier-runs-on-listener-host-with-read-only-kernel-process-container-and-deployed-artifact-access",
      "health_identity_role": "corroboration-only-never-ownership-or-release-authority",
      "pid_checks": [
        "positive-integer",
        "not-verifier-pid",
        "matches-os-listener-owner-pid",
        "stable-pre-post",
        "os-process-start-before-verifier-start",
        "uptime-advances"
      ],
      "independent_listener_observation": "kernel-socket-table-lsof-or-ss-exact-effective-address-and-port-yields-one-owner-pid",
      "independent_process_observation": "process-table-and-cgroup-bind-owner-pid-start-time-executable-and-container-id",
      "independent_runtime_observation": "read-only-host-container-inspect-binds-pid-owned-running-image-digest-source-revision-attestation-and-compose-generation-labels",
      "independent_compose_observation": "realpath-no-symlink-sha256-of-canonical-deployed-compose-release-artifact-named-by-release-lock",
      "database_target_fingerprint": "database-target-v1(host,effective_port,database)",
      "required_equal_checkpoints": [
        "direct-postgres-pre",
        "health-database-target-pre",
        "direct-postgres-post",
        "health-database-target-post"
      ],
      "release_lock_env": "MK6_DATA_RELEASE_LOCK_PATH",
      "release_lock_independence": "operator-provided-never-derived-from-health-server-or-current-checkout",
      "expected_deployment_identity_fields": [
        "host",
        "runtime",
        "sourceRevision",
        "imageDigest",
        "composeGeneration",
        "composeSha256"
      ],
      "required_observed_equalities": [
        "health.pid=kernel-listener-owner-pid=pid-owned-container-process",
        "observed-sourceRevision=release-lock-sourceRevision=health-sourceRevision",
        "observed-running-imageDigest=release-lock-imageDigest=health-imageDigest",
        "observed-composeGeneration=release-lock-composeGeneration=health-composeGeneration",
        "observed-deployed-compose-artifact-sha256=release-lock-composeSha256=health-composeSha256"
      ],
      "deployment_identity_verifier": "verifyExternalDeploymentIdentity from services/platform/src/http/deployment-identity.ts",
      "deployment_identity_checkpoints": [
        "release-lock-expected",
        "health-deployment-identity-pre",
        "health-deployment-identity-post"
      ],
      "document_read": "authenticated-GET-/api/documents/:id-through-same-pre-existing-hono",
      "forbidden": [
        "wrong-postgres-target",
        "verifier-started-positive-hono",
        "self-minted-health-or-content-json",
        "correct-target-wrong-code-identity",
        "correct-database-copied-health-identity-with-observed-runtime-mismatch"
      ]
    },
    "witness_auth": {
      "accepted_environment_names": [
        "HOLO_KEY_RN",
        "MK6_DATA_EXTERNAL_BEARER_TOKEN"
      ],
      "selection": "prefer-HOLO_KEY_RN-else-explicit-RN-authorized-verifier-token",
      "operator_local_source_names": [
        ".env",
        "services/platform/config/secrets.yaml",
        "HOLOCRON_SECRETS_PATH",
        "HOLO_SECRETS_PATH"
      ],
      "request_header": "Authorization: Bearer <token>",
      "required_before_witness_request": true,
      "missing_failure": "WITNESS_AUTH_MISSING-before-request",
      "rejected_http_statuses": [
        401,
        403
      ],
      "rejected_failure": "WITNESS_AUTH_REJECTED-no-unauthenticated-retry",
      "evidence_policy": "never-print-token-header-or-secret-source-value"
    },
    "privacy": {
      "allowed_evidence": [
        "identifiers",
        "counts",
        "hashes",
        "full-inventory-set-digests",
        "witness-mapping-chain",
        "credential-free-target-fingerprint",
        "release-lock-sha256",
        "pid-and-uptime-class",
        "sanitized-kernel-listener-owner-identity",
        "observed-running-image-or-executable-sha256",
        "observed-deployed-compose-artifact-sha256"
      ],
      "forbidden_evidence": [
        "research-document-body",
        "connection-url",
        "bearer-token",
        "authorization-header",
        "secret-value"
      ]
    },
    "mcp_dependency": {
      "branch_landing_required": false,
      "read_only_reference_sha": "85c49b0abc8bf103c20c82e980eb55154ea2311c"
    },
    "negative_controls": [
      "count-equal-content-corrupt",
      "missing-local-delta",
      "forged-provenance",
      "export-mutated-after-snapshot",
      "sqlite-mutated-after-snapshot",
      "blob-source-mutated-after-snapshot",
      "missing-blob",
      "replaced-blob",
      "nonexistent-selected-document",
      "fixture-path",
      "arbitrary-source-clone",
      "symlink-source-indirection",
      "wrong-postgres-target",
      "self-minted-listener",
      "missing-materialized-local-provenance",
      "dropped-provenance-tombstone",
      "forged-local-batch-fields",
      "wrong-code-identity",
      "copied-health-identity-impostor",
      "missing-witness-auth",
      "witness-auth-rejected",
      "omitted-convex-root-metadata",
      "retyped-convex-root-metadata",
      "replaced-convex-root-metadata",
      "omitted-convex-catalog-drift-entry",
      "unmapped-convex-catalog-drift-entry",
      "omitted-convex-table",
      "unmapped-convex-table",
      "omitted-convex-storage-object",
      "unmapped-convex-storage-object",
      "omitted-unreferenced-convex-storage-object",
      "unmapped-unreferenced-convex-storage-object",
      "forged-convex-storage-reference",
      "omitted-sqlite-table-or-class",
      "unmapped-sqlite-table-or-class",
      "omitted-referenced-blob",
      "unmapped-referenced-blob",
      "invalid-local-blob-alias",
      "local-blob-cas-collision",
      "local-blob-byte-mismatch",
      "unreferenced-blob-source-mutated-after-snapshot",
      "omitted-unreferenced-blob-file",
      "unmapped-unreferenced-blob-file",
      "forged-tombstone-provenance-digest",
      "ambiguous-tombstone-provenance-digest",
      "arbitrary-content-probe",
      "wrong-document-route",
      "missing-document-mapping",
      "wrong-witness-external-id",
      "wrong-witness-origin",
      "wrong-witness-content-digest",
      "ambiguous-document-mapping",
      "invalid-witness-response-schema",
      "invalid-witness-utf8"
    ],
    "write_allowed": [
      "services/platform/src/etl/composite-corpus.ts",
      "services/platform/src/etl/archive.ts",
      "services/platform/src/etl/run.ts",
      "services/platform/src/etl/reconcile.ts",
      "services/platform/src/etl/latest-run.ts",
      "services/platform/src/cutover/data-plane-content.ts",
      "services/platform/tests/integration/mk6-data-plane-truth-live.test.ts",
      "scripts/verify-mk6-data-plane-truth.sh",
      ".tmp/MK6-DATA-001/${RUN_ID}/**"
    ],
    "runtime_write_allowed": [
      "operator-authorized-isolated-postgres",
      "loopback-self-minted-listener-negative-control-only"
    ]
  },
  "fixtures": {
    "real_composite_corpus": {
      "seed_method": "recorded_external",
      "description": "canonically admitted retained Convex export, SQLite backup, and recursively discovered local blob inventory reconciled to SQLite; real identifiers, snapshot-derived counts, and hashes only",
      "records": [
        "canonicalRootDefault: $HOME/.holocron",
        "corpusCardinalities: snapshot-derived-never-authorizing",
        "localAccounting: N-plus-M-equals-P-with-N-positive-and-P-at-least-N",
        "fullInventorySchema: holocron.mk6.full-source-inventory.v1",
        "inventoryBoundary: complete-snapshot-surface-never-loader-known-set-or-catalog-count",
        "convexFilesystemInventory: recursive-every-root-entry-and-descendant-with-root-metadata-no-filename-allowlist",
        "convexCatalogReconciliation: snapshot-first-with-lossless-source-backed-catalog-drift-disposition",
        "convexStorageReferences: zero-or-more-with-source-derived-unreferenced-evidence-disposition",
        "localBlobMapping: total-storage-identity-to-CAS-with-explicit-proven-dedup-groups",
        "localBlobInventory: recursive-complete-root-before-reference-join-with-unreferenced-disposition",
        "tombstoneDigest: canonical-seven-field-provenance-record-never-deleted-content",
        "documentReadRoute: authenticated-GET-/api/documents/:id-with-mapped-Postgres-id",
        "witnessChain: source-id-to-unique-mapped-Postgres-id-to-external-id-origin-content-sha256",
        "releaseLockInputName: MK6_DATA_RELEASE_LOCK_PATH",
        "runtimeIdentity: kernel-listener-plus-pid-owned-container-and-deployed-compose-observation",
        "witnessAuthInputNames: HOLO_KEY_RN-or-MK6_DATA_EXTERNAL_BEARER_TOKEN",
        "secretSourceNamesOnly: operator-local-env-or-secrets-path"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN the canonically admitted retained composite source and a pre-existing Hono process bound to isolated Postgres WHEN symmetric snapshots are derived and loaded THEN source, provenance, blobs, Postgres, target identity, and both external witnesses agree exactly",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --case composite-positive --json",
      "maps_to_ac": null,
      "scenario": {
        "id": "composite-data-foundation-v2",
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "canonical-filesystem-sqlite-postgres-preexisting-hono",
        "negative_control": {
          "would_fail_if": [
            "a source inventory item is omitted/unmapped, a source is cloned, a symlink is accepted, any semantic checkpoint is empty, provenance is one-way, Postgres is disconnected, or Hono is stubbed/self-started/queried through an arbitrary route"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "real_composite_corpus",
            "action": {
              "actor": "cli_user",
              "steps": [
                "admit the canonical root, inventory every export/blob entry before catalog or reference joins, capture all symmetric checkpoints, classify catalog drift, CAS aliases, unreferenced objects, and tombstone provenance, load isolated Postgres, independently bind the listener runtime to the release lock, and fetch both witnesses"
              ]
            },
            "end_state": {
              "must_observe": [
                "manifestSchema: holocron.mk6.composite-corpus.v2",
                "manifestInventorySchema: holocron.mk6.full-source-inventory.v1",
                "manifestInventoryArrayCount: 9",
                "canonicalSourceCount: 3",
                "sourceSymlinkCount: 0",
                "semanticCheckpointMismatchCount: 0",
                "convexFilesystemEntryMismatchCount: 0",
                "convexRootMetadataDiscoveryMode: snapshot-derived",
                "convexCatalogDriftUnmappedCount: 0",
                "sqliteQuickCheck: ok",
                "localMaterializedMissingProvenanceCount: 0",
                "unclassifiedLocalProvenanceCount: 0",
                "tombstoneDigestSchema: canonical-provenance-record-v1",
                "provenanceAccountingEquationValid: true",
                "sourceSetMissingCount: 0",
                "sourceSetExtraCount: 0",
                "contentDigestMismatchCount: 0",
                "foreignKeyOrphanCount: 0",
                "missingReferencedBlobCount: 0",
                "blobHashMismatchCount: 0",
                "completeBlobInventoryCheckpointMismatchCount: 0",
                "sqliteBlobInvalidAliasCount: 0",
                "sqliteBlobCasCollisionCount: 0",
                "undispositionedUnreferencedBlobFileCount: 0",
                "witnessCount: 2",
                "witnessOrigins: convex,local",
                "honoProcessPreExisting: true",
                "honoPidStable: true",
                "kernelListenerOwnerMismatchCount: 0",
                "observedRuntimeIdentityMismatchCount: 0",
                "databaseTargetFingerprintMismatchCount: 0",
                "deploymentIdentityMismatchCount: 0",
                "releaseLockSource: operator-independent",
                "externalWitnessRoute: GET /api/documents/:id",
                "externalWitnessMappingMismatchCount: 0",
                "externalWitnessOriginMismatchCount: 0",
                "witnessAuthHeaderName: Authorization",
                "witnessAuthScheme: Bearer",
                "snapshotPostgresExternalHashMismatchCount: 0"
              ],
              "must_not_observe": [
                "canonicalSourceCount: 0",
                "sqliteSnapshotMethod: raw-copy",
                "blobVerificationMode: existence-only",
                "blobVerificationMode: referenced-only",
                "inventoryBoundary: loader-known-only",
                "catalogCoverageSource: table_count_expected",
                "localMaterializedMissingProvenanceCount > 0",
                "externalProbeMode: stub",
                "externalWitnessRoute: GET /api/content-probe",
                "honoPidEqualsVerifierPid: true",
                "releaseIdentitySource: health-under-test",
                "runtimeObservationSource: health-under-test",
                "witnessAuthorizationHeaderPrinted: true"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "Count-equal content corruption is rejected as CONTENT_DIGEST_MISMATCH after a healthy baseline",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control count-equal-content-corrupt --json",
      "maps_to_ac": null,
      "scenario": {
        "id": "count-equal-byte-corruption",
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "postgres-reconcile",
        "negative_control": {
          "would_fail_if": [
            "content digest validation is removed, empty target bytes pass, row counts are sufficient, or the baseline is not proven first"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "real_composite_corpus",
            "action": {
              "actor": "cli_user",
              "steps": [
                "pass the baseline, change document bytes in isolated Postgres without changing row count, and rerun reconciliation"
              ]
            },
            "end_state": {
              "must_observe": [
                "baselineStatus: passed",
                "targetFailureClass: CONTENT_DIGEST_MISMATCH",
                "mutantsRejected: 1"
              ],
              "must_not_observe": [
                "empty target digest accepted",
                "mutantsAccepted: 1"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "The verifier rejects incomplete or forged local materialization, provenance, tombstone accounting, local-batch semantics, and canonical provenance-record digests",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control provenance-matrix --json",
      "maps_to_ac": null,
      "scenario": {
        "id": "two-way-provenance-matrix",
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "sqlite-postgres-reconcile",
        "negative_control": {
          "would_fail_if": [
            "an empty local set passes, materialized or provenance-only identities are dropped, a declared origin is trusted, batch semantics are not rederived, or a tombstone claims unavailable deleted-content bytes"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "real_composite_corpus",
            "action": {
              "actor": "cli_user",
              "steps": [
                "pass the baseline and independently omit the local delta, forge provenance, remove materialized-row provenance, drop the provenance-only tombstone, alter local-writes batch fields, forge its canonical provenance-record digest, and make a digest ambiguous"
              ]
            },
            "end_state": {
              "must_observe": [
                "baselineStatus: passed",
                "failureClasses: SOURCE_SET_INCOMPLETE,PROVENANCE_DERIVATION_MISMATCH,LOCAL_PROVENANCE_ACCOUNTING_MISMATCH,PROVENANCE_TOMBSTONE_DROPPED,LOCAL_BATCH_SEMANTICS_MISMATCH,TOMBSTONE_PROVENANCE_DIGEST_MISMATCH,TOMBSTONE_PROVENANCE_DIGEST_AMBIGUOUS",
                "mutantsRejected: 7"
              ],
              "must_not_observe": [
                "empty local provenance accepted",
                "unclassifiedLocalProvenanceCount > 0 with verificationStatus: passed",
                "tombstoneContentSha256: deleted-document-bytes",
                "mutantsAccepted: 1"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "The verifier rejects independent export, SQLite, and complete blob-inventory drift plus missing or replaced referenced and unreferenced snapshot blobs",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control snapshot-blob-matrix --json",
      "maps_to_ac": null,
      "scenario": {
        "id": "symmetric-source-and-blob-mutation-matrix",
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "filesystem-sqlite-semantic-reconcile",
        "negative_control": {
          "would_fail_if": [
            "a post checkpoint is absent, an empty semantic digest passes, raw SQLite bytes replace table/provenance digests, or referenced-only/existence-only blob checks omit unreferenced bytes"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "real_composite_corpus",
            "action": {
              "actor": "cli_user",
              "steps": [
                "pass the baseline, mutate disposable export, SQLite, referenced-blob, and unreferenced-blob source derivatives after snapshot, remove and replace referenced blobs, then omit and undisposition an unreferenced blob file"
              ]
            },
            "end_state": {
              "must_observe": [
                "baselineStatus: passed",
                "failureClasses: EXPORT_SOURCE_CHANGED_AFTER_SNAPSHOT,SQLITE_SOURCE_CHANGED_AFTER_SNAPSHOT,BLOB_SOURCE_CHANGED_AFTER_SNAPSHOT,UNREFERENCED_BLOB_SOURCE_CHANGED_AFTER_SNAPSHOT,BLOB_MISSING,BLOB_HASH_MISMATCH,UNREFERENCED_BLOB_FILE_OMITTED,UNREFERENCED_BLOB_FILE_UNMAPPED",
                "mutantsRejected: 8",
                "retainedSourceMutationCount: 0"
              ],
              "must_not_observe": [
                "empty semantic checkpoint accepted",
                "blobVerificationMode: existence-only",
                "blobVerificationMode: referenced-only",
                "mutantsAccepted: 1"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "description": "The verifier rejects nonexistent witnesses, fixtures, arbitrary clones, and symlink-indirected source roots",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control identity-source-matrix --json",
      "maps_to_ac": null,
      "scenario": {
        "id": "witness-and-canonical-source-matrix",
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "realpath-source-postgres-hono",
        "negative_control": {
          "would_fail_if": [
            "a fixed or empty witness passes, fixture or clone bytes count as real, realpath equality is omitted, or symlink components are followed"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "real_composite_corpus",
            "action": {
              "actor": "cli_user",
              "steps": [
                "pass the baseline, substitute a nonexistent identity, then attempt fixture, arbitrary-clone, and symlink-indirected source admission"
              ]
            },
            "end_state": {
              "must_observe": [
                "baselineStatus: passed",
                "failureClasses: SELECTED_DOCUMENT_NOT_FOUND,FIXTURE_SOURCE_REJECTED,CANONICAL_SOURCE_REQUIRED,SOURCE_SYMLINK_REJECTED",
                "mutantsRejected: 4"
              ],
              "must_not_observe": [
                "empty witness accepted",
                "sourceKind: clone with verificationStatus: passed",
                "sourceSymlinkCount > 0 with verificationStatus: passed"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-6",
      "type": "acceptance_criterion",
      "description": "The external product proof rejects wrong-target, self-minted, wrong-release, and copied-health-identity Hono processes using independent OS/container/artifact observation",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control external-binding-matrix --json",
      "maps_to_ac": null,
      "scenario": {
        "id": "external-server-target-binding-matrix",
        "test_tier": "e2e",
        "tier": "visible",
        "verification_service": "preexisting-hono-health-postgres",
        "negative_control": {
          "would_fail_if": [
            "health database_target or deployment identity is empty, copied health values establish authority, a wrong database or observed runtime passes, PID ownership is not kernel-grounded, or self-minted HTTP replaces a pre-existing server"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "real_composite_corpus",
            "action": {
              "actor": "cli_user",
              "steps": [
                "pass the baseline, probe a pre-existing Hono bound to another database, a verifier-created listener, a pre-started wrong-code process, and a pre-existing correct-database impostor copying all health identity fields while its observed image or compose artifact differs from the lock"
              ]
            },
            "end_state": {
              "must_observe": [
                "baselineStatus: passed",
                "failureClasses: DATABASE_TARGET_MISMATCH,SELF_MINTED_LISTENER_REJECTED,IDENTITY_MISMATCH,OBSERVED_DEPLOYMENT_IDENTITY_MISMATCH",
                "mutantsRejected: 4"
              ],
              "must_not_observe": [
                "empty database_target accepted",
                "empty deployment identity accepted",
                "copied health identity accepted without OS/container observation",
                "honoPidEqualsVerifierPid: true with verificationStatus: passed",
                "mutantsAccepted: 1"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-7",
      "type": "acceptance_criterion",
      "description": "Witness requests require a names-only operator-loaded bearer credential and reject missing credentials plus real HTTP 401 or 403 without disclosure or unauthenticated retry",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control witness-auth-matrix --json",
      "maps_to_ac": null,
      "scenario": {
        "id": "external-witness-auth-matrix",
        "test_tier": "e2e",
        "tier": "visible",
        "verification_service": "authenticated-preexisting-hono",
        "negative_control": {
          "would_fail_if": [
            "an empty token issues a request, Authorization is omitted or logged, HTTP 401 or 403 passes, or an unauthenticated retry follows rejection"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "real_composite_corpus",
            "action": {
              "actor": "cli_user",
              "steps": [
                "pass the authenticated baseline, remove both named credential inputs before request construction, then use a rejected bearer token against the real pre-existing witness endpoint"
              ]
            },
            "end_state": {
              "must_observe": [
                "baselineStatus: passed",
                "failureClasses: WITNESS_AUTH_MISSING,WITNESS_AUTH_REJECTED",
                "missingCredentialWitnessRequestCount: 0",
                "unauthenticatedRetryCount: 0",
                "mutantsRejected: 2"
              ],
              "must_not_observe": [
                "empty bearer token accepted",
                "authorizationHeaderPrinted: true",
                "httpStatus: 401 with verificationStatus: passed",
                "mutantsAccepted: 1"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-8",
      "type": "acceptance_criterion",
      "description": "The verifier dispositions every discovered export entry, catalog drift, storage pair, SQLite class, CAS identity, and referenced or unreferenced blob file and rejects every lossless-accounting violation",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control full-inventory-matrix --json",
      "maps_to_ac": null,
      "scenario": {
        "id": "full-source-inventory-matrix",
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "immutable-snapshot-inventory-reconcile",
        "negative_control": {
          "would_fail_if": [
            "an empty recursive inventory passes, inventory starts from loader-known tables or catalog counts, root metadata or catalog drift is skipped, CAS aliases are forced one-to-one, zero-ref storage is forced into a fake catalog ref, or any source identity lacks lossless disposition"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "real_composite_corpus",
            "action": {
              "actor": "cli_user",
              "steps": [
                "pass the complete snapshot-first baseline, then run table/storage/SQLite/blob omission and mapping mutants plus root-metadata omission/type/bytes, catalog drift, local CAS alias/collision/bytes, zero-ref Convex storage, and unreferenced local blob disposition mutants"
              ]
            },
            "end_state": {
              "must_observe": [
                "baselineStatus: passed",
                "manifestInventorySchema: holocron.mk6.full-source-inventory.v1",
                "manifestInventoryArrayCount: 9",
                "unmappedSourceItemCount: 0",
                "omittedSourceItemCount: 0",
                "duplicateSourceIdentityCount: 0",
                "ambiguousDispositionCount: 0",
                "convexFilesystemEntryUnclassifiedCount: 0",
                "convexCatalogDriftUnmappedCount: 0",
                "sqliteBlobInvalidAliasCount: 0",
                "sqliteBlobCasCollisionCount: 0",
                "failureClasses: CONVEX_TABLE_OMITTED,CONVEX_TABLE_UNMAPPED,CONVEX_STORAGE_OBJECT_OMITTED,CONVEX_STORAGE_OBJECT_UNMAPPED,SQLITE_TABLE_OR_CLASS_OMITTED,SQLITE_TABLE_OR_CLASS_UNMAPPED,REFERENCED_BLOB_OMITTED,REFERENCED_BLOB_UNMAPPED,CONVEX_ROOT_METADATA_OMITTED,CONVEX_ROOT_METADATA_TYPE_MISMATCH,CONVEX_ROOT_METADATA_DIGEST_MISMATCH,CONVEX_CATALOG_DRIFT_OMITTED,CONVEX_CATALOG_DRIFT_UNMAPPED,LOCAL_BLOB_ALIAS_INVALID,LOCAL_BLOB_CAS_COLLISION,LOCAL_BLOB_BYTE_MISMATCH,UNREFERENCED_CONVEX_STORAGE_OMITTED,UNREFERENCED_CONVEX_STORAGE_UNMAPPED,CONVEX_STORAGE_REFERENCE_FORGED,UNREFERENCED_BLOB_FILE_OMITTED,UNREFERENCED_BLOB_FILE_UNMAPPED",
                "mutantsRejected: 21"
              ],
              "must_not_observe": [
                "empty inventory accepted",
                "inventoryBoundary: loader-known-only",
                "inventoryBoundary: catalog-count",
                "rootMetadataAllowlistOnly: true",
                "sqliteBlobIdentityObjectBijectionRequired: true",
                "convexStorageExactlyOneCatalogRefRequired: true",
                "source item omitted with verificationStatus: passed",
                "mutantsAccepted: 1"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-9",
      "type": "acceptance_criterion",
      "description": "Each deterministic origin witness uses the exact authenticated document-read API and a unique source-to-Postgres-to-external identity, origin, and exact UTF-8 content-hash chain",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control external-witness-contract-matrix --json",
      "maps_to_ac": null,
      "scenario": {
        "id": "external-document-read-contract-matrix",
        "test_tier": "e2e",
        "tier": "visible",
        "verification_service": "authenticated-preexisting-hono-document-read",
        "negative_control": {
          "would_fail_if": [
            "an arbitrary probe or alternate route passes, the forward/reverse mapping is absent or ambiguous, response ID/origin/hash drifts, response schema is coerced, or invalid UTF-8 is replacement-decoded"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "real_composite_corpus",
            "action": {
              "actor": "cli_user",
              "steps": [
                "pass both mapped-origin GET /api/documents/:id witnesses, then independently substitute content-probe, wrong route or method, missing mapping, wrong external ID, wrong origin, wrong digest, ambiguous mapping, wrong schema, and invalid UTF-8"
              ]
            },
            "end_state": {
              "must_observe": [
                "baselineStatus: passed",
                "externalWitnessRoute: GET /api/documents/:id",
                "externalWitnessCount: 2",
                "uniqueForwardReverseMappingCount: 2",
                "externalWitnessHashMismatchCount: 0",
                "failureClasses: ARBITRARY_CONTENT_PROBE_REJECTED,WITNESS_ROUTE_MISMATCH,WITNESS_MAPPING_MISMATCH,WITNESS_EXTERNAL_ID_MISMATCH,WITNESS_ORIGIN_MISMATCH,WITNESS_CONTENT_DIGEST_MISMATCH,WITNESS_MAPPING_AMBIGUOUS,WITNESS_RESPONSE_SCHEMA_MISMATCH,WITNESS_UTF8_INVALID",
                "mutantsRejected: 9"
              ],
              "must_not_observe": [
                "empty witness mapping accepted",
                "externalWitnessRoute: GET /api/content-probe",
                "duplicate mapping accepted",
                "utf8DecodeMode: replacement",
                "mutantsAccepted: 1"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "The canonical composite source and exact isolated Postgres plus pre-existing Hono process agree",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --case composite-positive --json",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Count-equal content corruption is rejected",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control count-equal-content-corrupt --json",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Missing local materialized delta rows are rejected",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control missing-local-delta --json",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Forged provenance is rejected",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control forged-provenance --json",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "Export source drift after snapshot is rejected",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control export-mutated-after-snapshot --json",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "A missing referenced snapshot blob is rejected",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control missing-blob --json",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-7",
      "type": "test_criterion",
      "description": "A replaced referenced snapshot blob is rejected by exact bytes",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control replaced-blob --json",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-8",
      "type": "test_criterion",
      "description": "A selected document absent from source bytes is rejected",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control nonexistent-selected-document --json",
      "maps_to_ac": "AC-5"
    },
    {
      "id": "TC-9",
      "type": "test_criterion",
      "description": "Fixture and synthetic source paths are rejected",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control fixture-path --json",
      "maps_to_ac": "AC-5"
    },
    {
      "id": "TC-10",
      "type": "test_criterion",
      "description": "SQLite semantic source drift after snapshot is rejected",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control sqlite-mutated-after-snapshot --json",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-11",
      "type": "test_criterion",
      "description": "Referenced blob source drift after snapshot is rejected",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control blob-source-mutated-after-snapshot --json",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-12",
      "type": "test_criterion",
      "description": "An arbitrary copied source outside the canonical root is rejected",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control arbitrary-source-clone --json",
      "maps_to_ac": "AC-5"
    },
    {
      "id": "TC-13",
      "type": "test_criterion",
      "description": "Symlink source indirection is rejected",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control symlink-source-indirection --json",
      "maps_to_ac": "AC-5"
    },
    {
      "id": "TC-14",
      "type": "test_criterion",
      "description": "A pre-existing Hono process bound to the wrong Postgres target is rejected",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control wrong-postgres-target --json",
      "maps_to_ac": "AC-6"
    },
    {
      "id": "TC-15",
      "type": "test_criterion",
      "description": "A verifier-created self-minted listener is rejected",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control self-minted-listener --json",
      "maps_to_ac": "AC-6"
    },
    {
      "id": "TC-16",
      "type": "test_criterion",
      "description": "A materialized local document missing provenance is rejected",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control missing-materialized-local-provenance --json",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-17",
      "type": "test_criterion",
      "description": "Dropping a provenance-only tombstone identity is rejected",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control dropped-provenance-tombstone --json",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-18",
      "type": "test_criterion",
      "description": "Forged semantic fields in local-writes lineage are rejected",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control forged-local-batch-fields --json",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-19",
      "type": "test_criterion",
      "description": "A pre-started correct-target server with copied bytes but wrong release identity is rejected",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control wrong-code-identity --json",
      "maps_to_ac": "AC-6"
    },
    {
      "id": "TC-20",
      "type": "test_criterion",
      "description": "Missing witness credentials fail before any witness request",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control missing-witness-auth --json",
      "maps_to_ac": "AC-7"
    },
    {
      "id": "TC-21",
      "type": "test_criterion",
      "description": "A real witness HTTP 401 or 403 is rejected without unauthenticated retry",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control witness-auth-rejected --json",
      "maps_to_ac": "AC-7"
    },
    {
      "id": "TC-22",
      "type": "test_criterion",
      "description": "An omitted retained Convex table is rejected",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control omitted-convex-table --json",
      "maps_to_ac": "AC-8"
    },
    {
      "id": "TC-23",
      "type": "test_criterion",
      "description": "An unmapped retained Convex table is rejected",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control unmapped-convex-table --json",
      "maps_to_ac": "AC-8"
    },
    {
      "id": "TC-24",
      "type": "test_criterion",
      "description": "An omitted Convex storage metadata/object identity is rejected",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control omitted-convex-storage-object --json",
      "maps_to_ac": "AC-8"
    },
    {
      "id": "TC-25",
      "type": "test_criterion",
      "description": "An unmapped Convex storage metadata/object identity is rejected",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control unmapped-convex-storage-object --json",
      "maps_to_ac": "AC-8"
    },
    {
      "id": "TC-26",
      "type": "test_criterion",
      "description": "An omitted SQLite physical table, logical etl_misc table, or class is rejected",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control omitted-sqlite-table-or-class --json",
      "maps_to_ac": "AC-8"
    },
    {
      "id": "TC-27",
      "type": "test_criterion",
      "description": "An unmapped SQLite physical/logical table or class is rejected",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control unmapped-sqlite-table-or-class --json",
      "maps_to_ac": "AC-8"
    },
    {
      "id": "TC-28",
      "type": "test_criterion",
      "description": "An omitted referenced SQLite blob identity/file is rejected",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control omitted-referenced-blob --json",
      "maps_to_ac": "AC-8"
    },
    {
      "id": "TC-29",
      "type": "test_criterion",
      "description": "An unmapped referenced SQLite blob is rejected",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control unmapped-referenced-blob --json",
      "maps_to_ac": "AC-8"
    },
    {
      "id": "TC-30",
      "type": "test_criterion",
      "description": "Using /api/content-probe as a witness surface is rejected",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control arbitrary-content-probe --json",
      "maps_to_ac": "AC-9"
    },
    {
      "id": "TC-31",
      "type": "test_criterion",
      "description": "Using the wrong document-read route or HTTP method is rejected",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control wrong-document-route --json",
      "maps_to_ac": "AC-9"
    },
    {
      "id": "TC-32",
      "type": "test_criterion",
      "description": "A selected source document without exactly one mapping row is rejected",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control missing-document-mapping --json",
      "maps_to_ac": "AC-9"
    },
    {
      "id": "TC-33",
      "type": "test_criterion",
      "description": "A response document ID different from its unique mapped Postgres ID is rejected",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control wrong-witness-external-id --json",
      "maps_to_ac": "AC-9"
    },
    {
      "id": "TC-34",
      "type": "test_criterion",
      "description": "A witness chain with the wrong source origin is rejected",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control wrong-witness-origin --json",
      "maps_to_ac": "AC-9"
    },
    {
      "id": "TC-35",
      "type": "test_criterion",
      "description": "A witness response with the wrong exact UTF-8 content digest is rejected",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control wrong-witness-content-digest --json",
      "maps_to_ac": "AC-9"
    },
    {
      "id": "TC-36",
      "type": "test_criterion",
      "description": "Duplicate or conflicting forward/reverse document mappings are rejected",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control ambiguous-document-mapping --json",
      "maps_to_ac": "AC-9"
    },
    {
      "id": "TC-37",
      "type": "test_criterion",
      "description": "A document-read success body outside the pinned response schema is rejected",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control invalid-witness-response-schema --json",
      "maps_to_ac": "AC-9"
    },
    {
      "id": "TC-38",
      "type": "test_criterion",
      "description": "Invalid or replacement-decoded UTF-8 witness bytes are rejected",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control invalid-witness-utf8 --json",
      "maps_to_ac": "AC-9"
    },
    {
      "id": "TC-39",
      "type": "test_criterion",
      "description": "Omitting the deterministic discovered root-metadata entry from a disposable export snapshot is rejected",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control omitted-convex-root-metadata --json",
      "maps_to_ac": "AC-8"
    },
    {
      "id": "TC-40",
      "type": "test_criterion",
      "description": "Retyping the deterministic discovered root-metadata entry in its manifest is rejected",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control retyped-convex-root-metadata --json",
      "maps_to_ac": "AC-8"
    },
    {
      "id": "TC-41",
      "type": "test_criterion",
      "description": "Same-size replacement bytes for the deterministic discovered root-metadata file are rejected",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control replaced-convex-root-metadata --json",
      "maps_to_ac": "AC-8"
    },
    {
      "id": "TC-42",
      "type": "test_criterion",
      "description": "Omitting a snapshot-discovered catalog-drift table from lossless accounting is rejected",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control omitted-convex-catalog-drift-entry --json",
      "maps_to_ac": "AC-8"
    },
    {
      "id": "TC-43",
      "type": "test_criterion",
      "description": "Leaving a snapshot-discovered catalog-drift table without its proven source-backed disposition is rejected",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control unmapped-convex-catalog-drift-entry --json",
      "maps_to_ac": "AC-8"
    },
    {
      "id": "TC-44",
      "type": "test_criterion",
      "description": "A local blob alias without identical declared and recomputed CAS evidence is rejected",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control invalid-local-blob-alias --json",
      "maps_to_ac": "AC-8"
    },
    {
      "id": "TC-45",
      "type": "test_criterion",
      "description": "One local storage identity mapping to multiple CAS objects or conflicting bytes sharing a CAS key is rejected",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control local-blob-cas-collision --json",
      "maps_to_ac": "AC-8"
    },
    {
      "id": "TC-46",
      "type": "test_criterion",
      "description": "A declared local CAS alias whose exact bytes disagree with its group is rejected",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control local-blob-byte-mismatch --json",
      "maps_to_ac": "AC-8"
    },
    {
      "id": "TC-47",
      "type": "test_criterion",
      "description": "Omitting a zero-reference Convex storage metadata/object pair is rejected",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control omitted-unreferenced-convex-storage-object --json",
      "maps_to_ac": "AC-8"
    },
    {
      "id": "TC-48",
      "type": "test_criterion",
      "description": "Leaving a zero-reference Convex storage pair without its source-derived disposition is rejected",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control unmapped-unreferenced-convex-storage-object --json",
      "maps_to_ac": "AC-8"
    },
    {
      "id": "TC-49",
      "type": "test_criterion",
      "description": "Inventing a source-row or catalog reference for an unreferenced Convex storage pair is rejected",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control forged-convex-storage-reference --json",
      "maps_to_ac": "AC-8"
    },
    {
      "id": "TC-50",
      "type": "test_criterion",
      "description": "Post-snapshot drift in a discovered unreferenced local blob file is rejected",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control unreferenced-blob-source-mutated-after-snapshot --json",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-51",
      "type": "test_criterion",
      "description": "Omitting a discovered unreferenced local blob file is rejected",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control omitted-unreferenced-blob-file --json",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-52",
      "type": "test_criterion",
      "description": "Leaving a discovered unreferenced local blob file without a lossless disposition is rejected",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control unmapped-unreferenced-blob-file --json",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-53",
      "type": "test_criterion",
      "description": "A correct-database impostor copying all health identity fields fails independent OS/container/artifact observation",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control copied-health-identity-impostor --json",
      "maps_to_ac": "AC-6"
    },
    {
      "id": "TC-54",
      "type": "test_criterion",
      "description": "A hand-authored or stale provenance-record digest for a tombstone is rejected",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control forged-tombstone-provenance-digest --json",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-55",
      "type": "test_criterion",
      "description": "A tombstone digest omitting fields or ambiguously identifying multiple provenance records is rejected",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control ambiguous-tombstone-provenance-digest --json",
      "maps_to_ac": "AC-3"
    }
  ]
}
-->
