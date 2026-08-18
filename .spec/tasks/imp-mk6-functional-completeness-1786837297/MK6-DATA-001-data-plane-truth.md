# MK6-DATA-001: Restore Postgres data-plane truth

> Status: 🟡 In Progress
> Cycle: 1
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

An isolated Postgres target contains the complete union of the retained real Convex cutover export and every post-cutover local SQLite write. Source snapshots, loaded rows, referenced blobs, and externally served document bytes agree by independently recomputed identities and hashes, establishing the data foundation consumed by final cross-surface attestation.

## Use-case classification

Workflow-only. Snapshotting, provenance derivation, loading, reconciliation, witness selection, and mutation controls are deterministic data operations. This task adds no Mastra Agent, model call, memory, scorer, or processor; agent tripwire requirements therefore do not apply.

## Recovered source contract

The authoritative input is a composite corpus, not either source alone:

| Input | Operator variable | Observed retained evidence (2026-08-18) |
|---|---|---|
| Convex cutover export | `MK6_DATA_CONVEX_EXPORT_DIR` | Full table/storage export; `documents/documents.jsonl` is 39,433,251 bytes. The export has no separately generated provenance sidecar. |
| Local SQLite database | `MK6_DATA_SQLITE_PATH` | 1,641 documents: 1,623 imported from Convex and 18 local; 127 deep-research sessions; 259 iterations; `PRAGMA quick_check=ok`. |
| Local blob store | `MK6_DATA_SQLITE_BLOBS_DIR` | 1,191 `file_objects` rows, 1,155 distinct referenced paths, zero missing referenced paths, and 1,161 files observed (six unreferenced files remain inventory, not silently imported rows). |

The SQLite source also records import batches `convex-cutover-2026-08-09` and `local-writes`, 15,857 Convex provenance rows, and 19 local provenance rows. These are observed facts to re-derive at execution time, not constants that may be substituted for live queries.

The unmounted `/Volumes/Archives/...` location is not an input and must not block this task. A fixture, generated seed archive, empty corpus, or source path under the repository test-fixture trees is not an acceptable replacement.

## Immutable snapshot and operator-attested provenance recipe

The operator chooses the three source paths and deliberately invokes the verifier. The verifier derives all remaining facts; it accepts no free-form `source is real`, `success`, expected count, expected hash, or witness-ID assertion.

1. Create a unique `RUN_ID` and a new `.tmp/MK6-DATA-001/${RUN_ID}/` with exclusive-create semantics. Refuse an existing or symlinked run root.
2. Hash the source export tree before copying, copy every retained export file into the run root without changing the source, hash the snapshot, then hash the source again. Require the two source hashes and the snapshot hash to agree. Never add a sidecar to the retained export.
3. Snapshot the live SQLite database using SQLite backup semantics (`sqlite3 SOURCE ".backup SNAPSHOT"` or an equivalent backup API). A raw copy of the database, WAL, or SHM files is forbidden. Run `PRAGMA quick_check` on the snapshot and hash the resulting database bytes.
4. Read `import_batches`, `import_row_provenance`, source tables, and `file_objects` only from the SQLite snapshot. Derive local delta rows by source identity against the export and require every delta row to be supported by the local import batch/provenance records. A declared origin without matching records fails closed.
5. Resolve each referenced blob below the operator-selected blob root, reject traversal and symlinks, copy the complete blob inventory into the run root, and record per-file SHA-256. Missing referenced blobs fail; unreferenced files remain explicit inventory entries.
6. Write `manifest.json` last, with schema `holocron.mk6.composite-corpus.v1`, source pre/post hashes, snapshot hashes, code SHA, resolved source-path hashes, SQLite backup method and quick-check result, derived batch/provenance digests, per-table counts/content digests, source-set identities, blob inventory/reference digests, and witness identities. The manifest contains identifiers, counts, and hashes only—never document bodies or secret values.
7. Before any success result and again after the external probe, independently recompute every manifest-derived digest from the immutable snapshots and re-hash the original source locations. Source drift after snapshot is a failure, even if the snapshot still loads.

## Source-set and witness identity

For every mapped table, the expected set is the deduplicated union of export identities and SQLite-only identities. Common identities must agree on canonical content bytes; SQLite identities absent from the export are the local delta. The loader must use the existing production transforms and `convex_id_map` lineage, import all supported local delta tables, and reconcile both missing and extra target identities.

Select one real, non-empty document witness per source origin (`convex`, `local`). For each candidate, calculate:

```text
contentSha256 = sha256(exact UTF-8 source content bytes)
identityKey = sha256(sourceOrigin + NUL + "documents" + NUL + sourceId + NUL + contentSha256)
```

Choose the lexicographically smallest `identityKey` in each origin. The source ID, mapped Postgres ID, origin, content length, `contentSha256`, and `identityKey` may appear in evidence; content bytes may not. The verifier independently reads the source snapshot, direct Postgres, and the externally served product surface and requires exact byte hashes at all three boundaries. No fixed ID, title, body fragment, fixture record, or hand-authored expected hash may influence selection.

## Acceptance Criteria

- [ ] AC-1: `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --case composite-positive --json` creates only run-scoped immutable snapshots, derives provenance, loads the full composite corpus into isolated real Postgres, and proves non-empty counts, exact source-set/content digests, zero FK orphans, zero missing/hash-invalid referenced blobs, and two source-derived witnesses across snapshot, Postgres, and the external Hono surface.
- [ ] AC-2: `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control count-equal-content-corrupt --json` succeeds only when a byte mutation in isolated Postgres preserves row counts but is rejected as `CONTENT_DIGEST_MISMATCH`.
- [ ] AC-3: `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control provenance-matrix --json` succeeds only when omission of the local delta is rejected as `SOURCE_SET_INCOMPLETE` and a forged manifest/batch assertion is rejected as `PROVENANCE_DERIVATION_MISMATCH`.
- [ ] AC-4: `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control snapshot-blob-matrix --json` succeeds only when mutation of a disposable source clone after snapshot, deletion of a referenced snapshot blob, and replacement of referenced blob bytes are rejected as `SOURCE_CHANGED_AFTER_SNAPSHOT`, `BLOB_MISSING`, and `BLOB_HASH_MISMATCH` respectively.
- [ ] AC-5: `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control identity-source-matrix --json` succeeds only when a nonexistent selected document is rejected as `SELECTED_DOCUMENT_NOT_FOUND` and a fixture source path is rejected as `FIXTURE_SOURCE_REJECTED`.

Each negative-control invocation must first pass the unmodified baseline, mutate only its disposable run-scoped copies or isolated Postgres target, observe the named rejection, and then exit zero. It must exit non-zero if the mutant is accepted, the baseline is unhealthy, or the expected failure class is missing.

## Test Criteria

| ID | Binary statement | Maps | Verify |
|---|---|---|---|
| TC-1 | The real composite source loads with non-empty exact source-set/content parity, sound FKs/blobs, and two independently matching external witnesses. | AC-1 | `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --case composite-positive --json` |
| TC-2 | Count-equal byte corruption is rejected. | AC-2 | `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control count-equal-content-corrupt --json` |
| TC-3 | Omitting all local delta rows is rejected. | AC-3 | `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control missing-local-delta --json` |
| TC-4 | Forging provenance without matching export and SQLite records is rejected. | AC-3 | `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control forged-provenance --json` |
| TC-5 | Changing a disposable source clone after its snapshot is rejected. | AC-4 | `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control source-mutated-after-snapshot --json` |
| TC-6 | Removing one referenced blob from a disposable snapshot is rejected. | AC-4 | `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control missing-blob --json` |
| TC-7 | Replacing referenced snapshot blob bytes is rejected. | AC-4 | `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control replaced-blob --json` |
| TC-8 | Substituting a selected document identity that does not exist in the source is rejected. | AC-5 | `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control nonexistent-selected-document --json` |
| TC-9 | A repository fixture or synthetic source path is rejected before loading. | AC-5 | `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control fixture-path --json` |

Static seed corpora, fixture archives, row-count-only checks, direct imports into the operator database, raw copies of a live SQLite database, successful empty reads, and tests that pass with Postgres or Hono stopped are non-oracles.

## Implementation boundary and MCP branch decision

MK6-DATA-001 does **not** require the local-only MCP branch to land first. The platform task consumes the already-materialized SQLite format through a new, narrow `services/platform/src/etl/composite-corpus.ts` adapter and does not import source from the MCP worktree. The read-only reference is branch `mcp-sqlite-local` at `85c49b0abc8bf103c20c82e980eb55154ea2311c`; its `MIGRATION-NOTES.md`, provenance migration, and ETL code document the on-disk schema. Landing that branch remains a separate MCP product decision.

Implementation may modify only the eight listed source/test/script paths. Runtime writes are limited to a newly created `.tmp/MK6-DATA-001/${RUN_ID}/**` and the verifier-created isolated Postgres instance. The retained export, live SQLite database/WAL/SHM, local blob store, operator databases, MCP worktree, and any repository fixture are read-only. No package or schema migration is implied; if implementation discovers one is actually required, it must stop and return a spec-repair request naming the exact additional path and dependency.

## Human verification

The operator must provide readable real-source paths through the three named variables (or explicitly accept verifier defaults that resolve to those same locations), authorize creation of run-scoped snapshots, and provide an isolated real Postgres/Hono environment. The operator reviews the resulting identifiers/counts/hashes and manifest hash; no research body or secret value may be printed. The absent archive volume and the unlanded MCP branch are not required inputs.

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
    "schema": "holocron.mk6.composite-corpus.v1",
    "sources": [
      "MK6_DATA_CONVEX_EXPORT_DIR",
      "MK6_DATA_SQLITE_PATH",
      "MK6_DATA_SQLITE_BLOBS_DIR"
    ],
    "snapshot_semantics": {
      "convex": "run-scoped-copy-with-pre-post-source-sha256",
      "sqlite": "sqlite-backup-api-never-raw-copy",
      "blobs": "run-scoped-complete-inventory-copy-with-reference-sha256"
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
      "forbidden_assertions": [
        "source=real",
        "hand-authored-success",
        "hand-authored-expected-count",
        "hand-authored-expected-hash"
      ]
    },
    "witness_selection": {
      "origins": [
        "convex",
        "local"
      ],
      "requires_nonempty_source_bytes": true,
      "formula": "sha256(sourceOrigin+NUL+documents+NUL+sourceId+NUL+sha256(exactUtf8ContentBytes))",
      "selection": "lexicographically-smallest-identityKey-per-origin",
      "boundaries": [
        "source-snapshot",
        "direct-postgres",
        "external-product-surface"
      ]
    },
    "negative_controls": [
      "count-equal-content-corrupt",
      "missing-local-delta",
      "forged-provenance",
      "source-mutated-after-snapshot",
      "missing-blob",
      "replaced-blob",
      "nonexistent-selected-document",
      "fixture-path"
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
    ]
  },
  "fixtures": {
    "real_composite_corpus": {
      "seed_method": "recorded_external",
      "description": "operator-selected retained Convex export plus SQLite backup and referenced local blobs; identifiers, counts, and hashes only",
      "records": [
        "convexExportDocumentsBytesObserved: 39433251",
        "sqliteDocumentCountObserved: 1641",
        "sqliteConvexDocumentCountObserved: 1623",
        "sqliteLocalDocumentCountObserved: 18",
        "deepResearchSessionCountObserved: 127",
        "deepResearchIterationCountObserved: 259",
        "fileObjectRowCountObserved: 1191",
        "distinctReferencedBlobPathCountObserved: 1155",
        "missingReferencedBlobPathCountObserved: 0"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN the retained Convex export, SQLite database, and blob store WHEN collision-free immutable snapshots are derived and loaded THEN source-set identities, non-empty bytes, provenance, FKs, blobs, Postgres, and both per-origin external witnesses agree exactly",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --case composite-positive --json",
      "maps_to_ac": null,
      "scenario": {
        "id": "composite-data-foundation",
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "sqlite-backup-postgres-hono",
        "negative_control": {
          "would_fail_if": [
            "either source is omitted, the SQLite snapshot is a raw live-file copy, any count or digest is empty, a witness is hardcoded, Postgres is disconnected, or the external surface is stubbed"
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
                "create run-scoped export, SQLite-backup, and blob snapshots; derive the manifest; load isolated Postgres; reconcile; and fetch the selected convex and local documents through the external Hono surface"
              ]
            },
            "end_state": {
              "must_observe": [
                "manifestSchema: holocron.mk6.composite-corpus.v1",
                "sourceCount: 3",
                "sqliteQuickCheck: ok",
                "convexDocumentCount > 0",
                "localDocumentCount > 0",
                "sourceSetMissingCount: 0",
                "sourceSetExtraCount: 0",
                "contentDigestMismatchCount: 0",
                "foreignKeyOrphanCount: 0",
                "missingReferencedBlobCount: 0",
                "blobHashMismatchCount: 0",
                "witnessCount: 2",
                "witnessOrigins: convex,local",
                "snapshotPostgresExternalHashMismatchCount: 0"
              ],
              "must_not_observe": [
                "sourceCount: 1",
                "localDocumentCount: 0",
                "sqliteSnapshotMethod: raw-copy",
                "witnessCount: 0",
                "externalProbeMode: stub"
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
            "content digest validation is removed, row counts are treated as sufficient, or the baseline is not proven first"
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
                "pass the baseline, change document bytes in isolated Postgres without changing any row count, and rerun reconciliation"
              ]
            },
            "end_state": {
              "must_observe": [
                "negativeControl: count-equal-content-corrupt",
                "baselineStatus: passed",
                "targetFailureClass: CONTENT_DIGEST_MISMATCH",
                "mutantsRejected: 1"
              ],
              "must_not_observe": [
                "mutantsAccepted: 1",
                "targetFailureClass: none"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "The verifier rejects both a missing local delta and provenance claims not derivable from source bytes plus SQLite batch/provenance rows",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control provenance-matrix --json",
      "maps_to_ac": null,
      "scenario": {
        "id": "source-set-provenance-matrix",
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "sqlite-postgres-reconcile",
        "negative_control": {
          "would_fail_if": [
            "post-cutover local rows are discarded, an empty local source is accepted, a declared origin is trusted, or a generated success field bypasses recomputation"
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
                "pass the baseline, omit the local delta in an isolated target, then forge provenance in a disposable manifest without matching source records"
              ]
            },
            "end_state": {
              "must_observe": [
                "baselineStatus: passed",
                "failureClasses: SOURCE_SET_INCOMPLETE,PROVENANCE_DERIVATION_MISMATCH",
                "mutantsRejected: 2"
              ],
              "must_not_observe": [
                "localDeltaLoaded: false with verificationStatus: passed",
                "empty local delta accepted",
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
      "description": "The verifier rejects source mutation after snapshot and missing or replaced referenced blobs without modifying retained sources",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control snapshot-blob-matrix --json",
      "maps_to_ac": null,
      "scenario": {
        "id": "snapshot-and-blob-mutation-matrix",
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "filesystem-sqlite-reconcile",
        "negative_control": {
          "would_fail_if": [
            "source pre/post hashes are not compared, an empty blob inventory is accepted, blob existence replaces byte hashing, or mutations touch retained sources instead of disposable copies"
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
                "pass the baseline, mutate a disposable source clone after snapshot, delete one referenced snapshot blob, and replace a second referenced blob with different bytes"
              ]
            },
            "end_state": {
              "must_observe": [
                "baselineStatus: passed",
                "failureClasses: SOURCE_CHANGED_AFTER_SNAPSHOT,BLOB_MISSING,BLOB_HASH_MISMATCH",
                "mutantsRejected: 3",
                "retainedSourceMutationCount: 0"
              ],
              "must_not_observe": [
                "blobVerificationMode: existence-only",
                "empty blob inventory accepted",
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
      "description": "The verifier rejects a selected-document identity absent from real non-empty source bytes and rejects fixture or synthetic source paths",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control identity-source-matrix --json",
      "maps_to_ac": null,
      "scenario": {
        "id": "witness-and-source-authenticity-matrix",
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "source-postgres-hono",
        "negative_control": {
          "would_fail_if": [
            "a fixed or empty witness ID or hand-authored expected hash is accepted, fixture records can satisfy selection, or external content is not fetched"
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
                "pass the baseline, substitute an identity absent from the source snapshot, then attempt the same run from a repository fixture path"
              ]
            },
            "end_state": {
              "must_observe": [
                "baselineStatus: passed",
                "failureClasses: SELECTED_DOCUMENT_NOT_FOUND,FIXTURE_SOURCE_REJECTED",
                "mutantsRejected: 2"
              ],
              "must_not_observe": [
                "witnessSelectionMode: fixed-id",
                "empty witness accepted",
                "sourceKind: fixture with verificationStatus: passed"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "The real composite source and isolated Postgres plus Hono surface agree exactly",
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
      "description": "Missing local delta rows are rejected",
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
      "description": "Mutation of a disposable source after snapshot is rejected",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control source-mutated-after-snapshot --json",
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
      "description": "A replaced referenced snapshot blob is rejected by exact hash",
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
    }
  ]
}
-->
