# MK6-DATA-001: Restore Postgres data-plane truth

> Status: 🟡 In Progress
> Cycle: 3
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

An isolated real Postgres target contains the complete union of the retained real Convex cutover export and every post-cutover local SQLite write. Canonically admitted sources, symmetric semantic snapshots, two-way provenance accounting, loaded rows, referenced blobs, and document bytes served by a pre-existing Hono process all agree through independently recomputed identities and hashes.

## Use-case classification

Workflow-only. Source admission, snapshotting, provenance derivation, loading, reconciliation, witness selection, server/target binding, and mutation controls are deterministic data operations. This task adds no Mastra Agent, model call, memory, scorer, or processor; agent tripwire requirements do not apply.

## Canonical source admission

The verifier admits one composite corpus rooted at a single canonical directory. Its default is the recovered `$HOME/.holocron`; an operator may instead set `MK6_DATA_CANONICAL_ROOT` to an explicitly equivalent durable root. The three source locations are derived from that root and cannot be independently redirected:

| Source | Required relative path | Admission requirement |
|---|---|---|
| Convex cutover export | `exports/convex-dev-cutover-2026-08-09` | Full real table/storage tree; derive every table count and digest from the admitted snapshot. |
| Local SQLite database | `holocron.db` | Real SQLite backup with `PRAGMA quick_check=ok`; derive every materialized/provenance count from the same snapshot. |
| Local blob store | `blobs` | Real `file_objects`-derived referenced-byte inventory; derive inventory and missing/hash results from the snapshot. |

Admission resolves the root and each path with `realpath`, requires the supplied spelling to equal its absolute canonical path, and rejects a symlink in any path component. The admitted root must be a durable operator-selected corpus root, not the repository, a worktree, the run root, project `.tmp`, system temporary storage, `fixtures`, `testdata`, or a generated/copy directory. While the recovered default exists, an alternate root is equivalent only when all three preflight semantic identities equal those independently derived from the default; a byte-identical explicitly admitted alternate is equivalent, while an unproven or modified clone is arbitrary and rejected. The verifier records hashes of the canonical root and paths, but no secret-bearing path value. Arbitrary per-source overrides and symlink indirection fail before snapshotting.

The unmounted `/Volumes/Archives/...` location is not an input. A fixture, generated seed archive, empty corpus, or byte-identical clone outside the admitted root is not an acceptable substitute.

## Symmetric immutable snapshot recipe

The operator admits the canonical root and deliberately invokes the verifier. Every source must satisfy semantic equality at `source-pre`, `snapshot-copy`, and `source-post`; a one-sided copy hash is insufficient.

1. Create a cryptographically unique `RUN_ID` and a new `.tmp/MK6-DATA-001/${RUN_ID}/` with exclusive-create semantics. Reject an existing or symlinked run root.
2. **Export:** compute a canonical digest over sorted relative path, byte length, and SHA-256 for every export file; copy the complete tree; recompute the snapshot digest; after all Postgres and Hono probes recompute the canonical source digest. Require `export-source-pre == export-snapshot-copy == export-source-post`. Never add a sidecar to the retained export.
3. **SQLite:** use SQLite backup semantics for the initial immutable snapshot; raw database/WAL/SHM copying is forbidden. Run `PRAGMA quick_check=ok`. Derive a canonical semantic digest over schema/version plus ordered mapped-table rows, `import_batches`, `import_row_provenance`, and `file_objects`. After all probes, take a second SQLite backup from the live source and derive the same digest. Require `sqlite-source-backup-pre == sqlite-snapshot-copy == sqlite-source-backup-post`; SQLite file-layout equality is not a substitute for table/provenance semantic equality.
4. **Blobs:** derive the referenced set only from snapshot `file_objects`; reject traversal and symlinks; compute a sorted relative-path/byte-length/SHA-256 digest from source bytes; copy the complete blob inventory; recompute the referenced-byte digest from the snapshot and again from the original source after all probes. Require `blob-source-pre == blob-snapshot-copy == blob-source-post`. Preserve every snapshot-derived unreferenced file as explicit inventory, never as an invented materialized row.
5. Write `manifest.json` last with schema `holocron.mk6.composite-corpus.v2`, code SHA, canonical source-path hashes, all three semantic checkpoints per source, SQLite backup methods and quick checks, derived provenance/accounting digests, per-table identities/counts/content digests, blob inventory/reference digests, external process/target identity, and witness identities. It contains identifiers, counts, and hashes only—never document bodies, connection URLs, credentials, or secret values.
6. Independently rederive every manifest fact from the immutable snapshots before success. The verifier accepts no free-form real-source claim, success value, expected count, expected hash, local-origin claim, or witness ID.

Per-source mutation controls operate only on disposable derivatives after a healthy canonical-source baseline; they never mutate the admitted export, SQLite database/WAL/SHM, or blob root.

## Two-way local provenance accounting

The verifier first full-outer-joins materialized identities and provenance identities for every mapped table, classifies every identity exactly once as materialized-only, both, or provenance-only, and rejects any unclassified identity or unexplained materialized-only imported row. The local-document policy refines the full-outer join on `(table_name='documents', row_id)`:

- `materialized-local`: a local document and its local provenance row both exist.
- `provenance-only-tombstone`: the local provenance identity exists but the materialized document does not. Preserve its identifiers, batch identity, timestamps, import count, and row digest in the manifest; do not invent a document row.
- `materialized-local-missing-provenance`: a local document exists without its required provenance. This is an error, never an inferred success.

Require both equations:

```text
N = materializedLocalWithProvenance + materializedLocalMissingProvenance
P = materializedLocalWithProvenance + M
N > 0
P >= N
```

Here `N` is the snapshot-derived materialized local-document count, `M` is the snapshot-derived classified provenance-only tombstone count, and `P` is the snapshot-derived local-document provenance count. `materializedLocalMissingProvenance` and `unclassifiedLocalProvenance` must be zero. No prior observed cardinality can authorize success or be compared as an expected count.

The `local-writes` batch is valid only when the snapshot row itself has `id='local-writes'`, `source='local'`, `deployment IS NULL`, `cutover_date='ongoing'`, positive `started_at`, `finished_at IS NULL`, `export_path IS NULL`, `stats_json IS NULL`, and `note='Post-cutover local writes'`. Each materialized local document must carry `source_origin='local'` and `import_batch_id='local-writes'`; its provenance row must have the same origin/batch, positive timestamps with `first_imported_at <= last_imported_at`, and `import_count >= 1`. A manifest declaration cannot replace these semantic source facts.

For every mapped table, expected identities are the lossless union of export materialized identities, SQLite-only materialized identities, and classified provenance-only identities. Common materialized identities must agree on canonical content bytes. The loader imports materialized rows only, uses production transforms and `convex_id_map` lineage, and reconciles missing and extra target identities while retaining tombstone accounting in the manifest.

## Witness, release identity, authentication, and exact Postgres/Hono binding

Select one real, non-empty document witness per source origin (`convex`, `local`). For each candidate:

```text
contentSha256 = sha256(exact UTF-8 source content bytes)
identityKey = sha256(sourceOrigin + NUL + "documents" + NUL + sourceId + NUL + contentSha256)
```

Choose the lexicographically smallest `identityKey` per origin. Evidence may contain source ID, mapped Postgres ID, origin, content length, `contentSha256`, and `identityKey`, but no content bytes. No fixed ID, title, body fragment, fixture record, or hand-authored expected hash may influence selection.

The product-surface proof must use an operator-provided Hono base URL that was already listening before the verifier started. The verifier must not launch its positive-path Hono server. The operator independently provides `MK6_DATA_RELEASE_LOCK_PATH`, an immutable release lock containing the exact expected `sourceRevision`, `imageDigest`, `composeGeneration`, `composeSha256`, host, and runtime tuple. The lock cannot be derived from `/health`, the server under test, or the verifier's current checkout. Existing `verifyExternalDeploymentIdentity` from `services/platform/src/http/deployment-identity.ts` must validate this tuple without expanding implementation scope.

Before loading and again after external witness reads, the verifier fetches real `/health` and requires:

- HTTP readiness plus a positive PID unequal to the verifier PID; the reported PID equals the operating-system owner of the listening socket, the PID and deployment identity remain stable, uptime advances, and the OS process start precedes verifier start.
- `database_target.fingerprint` equals the credential-free `database-target-v1` fingerprint independently derived from the direct isolated Postgres connection before loading and after probes.
- Direct pre/post fingerprints agree, health pre/post fingerprints agree, and all four identify the same host/effective-port/database tuple without printing the connection URL.
- `/health.deployment.identity` matches every field in the independently supplied release lock before and after; the release-lock SHA-256, not its path or secret-adjacent content, is captured in evidence.
- Both external witness reads use that same pre-existing process and equal the source snapshot and direct Postgres byte hashes.

A wrong-target Hono process, a verifier-created listener returning self-minted health/content JSON, and a pre-started correct-target impostor serving copied witness bytes under the wrong code identity must fail even when their response shapes and content hashes appear valid.

External witness requests require one operator-loaded bearer token under the names-only inputs `HOLO_KEY_RN` (preferred) or `MK6_DATA_EXTERNAL_BEARER_TOKEN`. The operator loads it from the local `.env`, `services/platform/config/secrets.yaml`, or an explicitly selected `HOLOCRON_SECRETS_PATH`/`HOLO_SECRETS_PATH`; the verifier does not read or copy secret stores into evidence. It sends exactly `Authorization: Bearer <token>` on each witness request. It must fail as `WITNESS_AUTH_MISSING` before issuing a witness request when no token is available, reject HTTP 401 or 403 as `WITNESS_AUTH_REJECTED` without an unauthenticated retry, and never print the token, header, or credential-bearing source value.

## Acceptance Criteria

- [ ] AC-1: `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --case composite-positive --json` admits only the canonical composite source, proves symmetric semantic pre/copy/post equality for export/SQLite/blobs, derives lossless two-way provenance, loads the materialized union into isolated real Postgres, and proves non-empty source/content/FK/blob parity plus two selected witnesses through the exact pre-existing Hono process bound to that Postgres target.
- [ ] AC-2: `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control count-equal-content-corrupt --json` succeeds only when a byte mutation in isolated Postgres preserves row counts but is rejected as `CONTENT_DIGEST_MISMATCH`.
- [ ] AC-3: `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control provenance-matrix --json` succeeds only when missing local delta, forged general provenance, missing materialized-local provenance, dropped provenance-only tombstone, and forged local-batch semantics are rejected with their specified failure classes.
- [ ] AC-4: `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control snapshot-blob-matrix --json` succeeds only when independent export, SQLite, and blob-source post-snapshot drift plus missing and replaced snapshot blobs are rejected with their specified failure classes.
- [ ] AC-5: `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control identity-source-matrix --json` succeeds only when nonexistent selected document, fixture path, arbitrary source clone, and symlink source indirection are rejected with their specified failure classes.
- [ ] AC-6: `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control external-binding-matrix --json` succeeds only when a pre-existing Hono bound to the wrong Postgres target, a verifier-created/self-minted listener, and a pre-started correct-target impostor with the wrong release identity are rejected as `DATABASE_TARGET_MISMATCH`, `SELF_MINTED_LISTENER_REJECTED`, and `IDENTITY_MISMATCH`.
- [ ] AC-7: `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control witness-auth-matrix --json` succeeds only when absent witness credentials fail before any witness request as `WITNESS_AUTH_MISSING` and real HTTP 401/403 responses fail as `WITNESS_AUTH_REJECTED` without credential/header disclosure or unauthenticated retry.

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

Static seed corpora, fixture archives, arbitrary clones, symlinked sources, authorizing historical counts, row-count-only checks, one-sided source hashes, raw live-SQLite copies, existence-only blob checks, successful empty reads, health-derived expected release identity, unauthenticated witness requests, self-started positive-path Hono, and tests that pass with Postgres or Hono stopped are non-oracles.

## Implementation boundary and MCP branch decision

MK6-DATA-001 does **not** require the local-only MCP branch to land first. The platform task consumes the already-materialized SQLite format through new `services/platform/src/etl/composite-corpus.ts` code and does not import source from the MCP worktree. The read-only schema reference is branch `mcp-sqlite-local` at `85c49b0abc8bf103c20c82e980eb55154ea2311c`. Existing `services/platform/src/db/connection.ts` and `services/platform/src/http/health.ts` already expose the credential-free database-target fingerprint and serving PID needed here and remain read-only dependencies.

Implementation may modify only the eight listed source/test/script paths. Generated writes are limited to a newly created `.tmp/MK6-DATA-001/${RUN_ID}/**`, the operator-authorized isolated Postgres target, and loopback impostor listeners used only as rejection mutants. The retained export, live SQLite database/WAL/SHM, local blob store, release lock, operator secret stores, operator non-target databases, pre-existing Hono process, MCP worktree, and repository fixtures are read-only. No package or schema migration is implied; discovery of a required additional path or dependency triggers another spec repair before implementation.

## Human verification

The operator must accept the recovered `$HOME/.holocron` default or explicitly name one equivalent canonical root, provide the already-listening Hono base URL, isolated direct Postgres connection, independent release-lock path, and one named bearer-token environment variable, and authorize only run-scoped snapshots plus writes to that isolated target. The operator reviews snapshot-derived equations, identifiers/counts/hashes, server PID/uptime class, database-target and release-lock fingerprints, and manifest hash. No historical count authorizes success; no research body, connection URL, token, or authorization header may be printed.

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
        "semantic_digest": "sorted-relative-path+byte-length+sha256",
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
        "verification": "referenced-byte-sha256-never-existence-only",
        "semantic_digest": "sorted-referenced-relative-path+byte-length+sha256",
        "required_equal_checkpoints": [
          "blob-source-pre",
          "blob-snapshot-copy",
          "blob-source-post"
        ],
        "unreferenced_files": "lossless-inventory-not-materialized-row"
      }
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
      "provenance_only_policy": "preserve-identity-batch-timestamps-import-count-and-row-digest-never-materialize",
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
      "boundaries": [
        "source-snapshot",
        "direct-postgres",
        "external-product-surface"
      ]
    },
    "postgres_external_binding": {
      "direct_target": "operator-authorized-isolated-real-postgres",
      "external_base_url_env": "MK6_DATA_EXTERNAL_BASE_URL",
      "health_path": "/health",
      "server_requirement": "pre-existing-before-verifier-start-never-positive-path-self-start",
      "pid_checks": [
        "positive-integer",
        "not-verifier-pid",
        "matches-os-listener-owner-pid",
        "stable-pre-post",
        "os-process-start-before-verifier-start",
        "uptime-advances"
      ],
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
      "deployment_identity_verifier": "verifyExternalDeploymentIdentity from services/platform/src/http/deployment-identity.ts",
      "deployment_identity_checkpoints": [
        "release-lock-expected",
        "health-deployment-identity-pre",
        "health-deployment-identity-post"
      ],
      "content_probe": "selected-document-bytes-through-same-pre-existing-hono",
      "forbidden": [
        "wrong-postgres-target",
        "verifier-started-positive-hono",
        "self-minted-health-or-content-json",
        "correct-target-wrong-code-identity"
      ]
    },
    "witness_auth": {
      "accepted_environment_names": [
        "HOLO_KEY_RN",
        "MK6_DATA_EXTERNAL_BEARER_TOKEN"
      ],
      "selection": "prefer-HOLO_KEY_RN-else-explicit-verifier-token",
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
        "credential-free-target-fingerprint",
        "release-lock-sha256",
        "pid-and-uptime-class"
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
      "missing-witness-auth",
      "witness-auth-rejected"
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
      "description": "canonically admitted retained Convex export, SQLite backup, and SQLite-derived blob inventory; real identifiers, counts, and hashes only",
      "records": [
        "canonicalRootDefault: $HOME/.holocron",
        "corpusCardinalities: snapshot-derived-never-authorizing",
        "localAccounting: N-plus-M-equals-P-with-N-positive-and-P-at-least-N",
        "releaseLockInputName: MK6_DATA_RELEASE_LOCK_PATH",
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
            "a source is omitted or cloned, a symlink is accepted, any semantic checkpoint is empty, provenance is one-way, Postgres is disconnected, or Hono is stubbed or self-started"
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
                "admit the canonical root, capture all symmetric semantic checkpoints, classify local provenance, load isolated Postgres, bind pre-existing Hono health to that target, and fetch both source-derived witnesses"
              ]
            },
            "end_state": {
              "must_observe": [
                "manifestSchema: holocron.mk6.composite-corpus.v2",
                "canonicalSourceCount: 3",
                "sourceSymlinkCount: 0",
                "semanticCheckpointMismatchCount: 0",
                "sqliteQuickCheck: ok",
                "localMaterializedMissingProvenanceCount: 0",
                "unclassifiedLocalProvenanceCount: 0",
                "provenanceAccountingEquationValid: true",
                "sourceSetMissingCount: 0",
                "sourceSetExtraCount: 0",
                "contentDigestMismatchCount: 0",
                "foreignKeyOrphanCount: 0",
                "missingReferencedBlobCount: 0",
                "blobHashMismatchCount: 0",
                "witnessCount: 2",
                "witnessOrigins: convex,local",
                "honoProcessPreExisting: true",
                "honoPidStable: true",
                "databaseTargetFingerprintMismatchCount: 0",
                "deploymentIdentityMismatchCount: 0",
                "releaseLockSource: operator-independent",
                "witnessAuthHeaderName: Authorization",
                "witnessAuthScheme: Bearer",
                "snapshotPostgresExternalHashMismatchCount: 0"
              ],
              "must_not_observe": [
                "canonicalSourceCount: 0",
                "sqliteSnapshotMethod: raw-copy",
                "blobVerificationMode: existence-only",
                "localMaterializedMissingProvenanceCount > 0",
                "externalProbeMode: stub",
                "honoPidEqualsVerifierPid: true",
                "releaseIdentitySource: health-under-test",
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
      "description": "The verifier rejects incomplete or forged local materialization, provenance, tombstone accounting, and local-batch semantics",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control provenance-matrix --json",
      "maps_to_ac": null,
      "scenario": {
        "id": "two-way-provenance-matrix",
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "sqlite-postgres-reconcile",
        "negative_control": {
          "would_fail_if": [
            "an empty local set passes, materialized or provenance-only identities are dropped, a declared origin is trusted, or batch semantics are not rederived"
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
                "pass the baseline and independently omit the local delta, forge provenance, remove materialized-row provenance, drop the provenance-only tombstone, and alter local-writes batch fields"
              ]
            },
            "end_state": {
              "must_observe": [
                "baselineStatus: passed",
                "failureClasses: SOURCE_SET_INCOMPLETE,PROVENANCE_DERIVATION_MISMATCH,LOCAL_PROVENANCE_ACCOUNTING_MISMATCH,PROVENANCE_TOMBSTONE_DROPPED,LOCAL_BATCH_SEMANTICS_MISMATCH",
                "mutantsRejected: 5"
              ],
              "must_not_observe": [
                "empty local provenance accepted",
                "unclassifiedLocalProvenanceCount > 0 with verificationStatus: passed",
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
      "description": "The verifier rejects independent export, SQLite, and blob source drift plus missing and replaced referenced snapshot blobs",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control snapshot-blob-matrix --json",
      "maps_to_ac": null,
      "scenario": {
        "id": "symmetric-source-and-blob-mutation-matrix",
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "filesystem-sqlite-semantic-reconcile",
        "negative_control": {
          "would_fail_if": [
            "a post checkpoint is absent, an empty semantic digest passes, raw SQLite bytes replace table/provenance digests, or blob existence replaces byte hashing"
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
                "pass the baseline, mutate disposable export, SQLite, and blob-source derivatives after snapshot, then remove and replace referenced snapshot blobs"
              ]
            },
            "end_state": {
              "must_observe": [
                "baselineStatus: passed",
                "failureClasses: EXPORT_SOURCE_CHANGED_AFTER_SNAPSHOT,SQLITE_SOURCE_CHANGED_AFTER_SNAPSHOT,BLOB_SOURCE_CHANGED_AFTER_SNAPSHOT,BLOB_MISSING,BLOB_HASH_MISMATCH",
                "mutantsRejected: 5",
                "retainedSourceMutationCount: 0"
              ],
              "must_not_observe": [
                "empty semantic checkpoint accepted",
                "blobVerificationMode: existence-only",
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
      "description": "The external product proof rejects Hono bound to the wrong Postgres target, a verifier-created listener, and a pre-started correct-target server with the wrong release identity",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --negative-control external-binding-matrix --json",
      "maps_to_ac": null,
      "scenario": {
        "id": "external-server-target-binding-matrix",
        "test_tier": "e2e",
        "tier": "visible",
        "verification_service": "preexisting-hono-health-postgres",
        "negative_control": {
          "would_fail_if": [
            "health database_target or deployment identity is empty, a wrong database or release fingerprint passes, PID identity is ignored, or self-minted HTTP replaces a pre-existing server"
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
                "pass the baseline, probe a pre-existing Hono bound to another isolated database, probe a verifier-created listener serving copied JSON, then probe a pre-started correct-target impostor whose release identity differs from the operator lock"
              ]
            },
            "end_state": {
              "must_observe": [
                "baselineStatus: passed",
                "failureClasses: DATABASE_TARGET_MISMATCH,SELF_MINTED_LISTENER_REJECTED,IDENTITY_MISMATCH",
                "mutantsRejected: 3"
              ],
              "must_not_observe": [
                "empty database_target accepted",
                "empty deployment identity accepted",
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
    }
  ]
}
-->
