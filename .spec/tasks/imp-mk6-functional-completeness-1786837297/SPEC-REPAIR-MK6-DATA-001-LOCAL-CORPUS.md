# SPEC-REPAIR-MK6-DATA-001-LOCAL-CORPUS: Bind the retained composite corpus

> Status: 🔵 In Review
> Cycle: 6
> Updated: 2026-08-18T00:00:00Z
> Assignee: mastra-planner
> Reviewer: mastra-reviewer
> Priority: P0
> Type: docs
> Proposed by: operator
> Files: .spec/tasks/imp-mk6-functional-completeness-1786837297/MK6-DATA-001-data-plane-truth.md, .spec/tasks/imp-mk6-functional-completeness-1786837297/SPEC-REPAIR-MK6-DATA-001-LOCAL-CORPUS.md
> Blocks: MK6-DATA-001

## Outcome

MK6-DATA-001 is executable only against the canonically admitted retained Convex/SQLite/blob corpus and an exact operator-authorized pre-existing Hono/Postgres/release pair. Its contract pins snapshot-first recursive export/blob inventories, source-backed catalog drift and unreferenced-object dispositions, CAS-aware aliases, provenance-record tombstone digests, symmetric source semantics, the exact authenticated witness chain, independently observed process/database/release identity, all required mutations, and the exact implementation scope.

## Contradictions and loopholes repaired

Cycle 1 removed the nonexistent sidecar and synthetic witness assumptions. Cycle 2 closed source, drift, target, and provenance gaps. Cycle 3 closed cardinality, release-identity, and witness-auth gaps. Cycle 4 added full source-class accounting and the exact document-read witness. Cycle 5 made both contracts generically extractable. Cycle 6 closes the final retained-corpus blockers:

| Finding | Repaired contract |
|---|---|
| Snapshot/catalog drift | Discover all export domain entries before catalog reconciliation; source-backed catalog-drift archive disposition covers fully proven rows such as `migrationFenceAudit`; scalar catalog counts never authorize. |
| Root export metadata | `convex.filesystemEntries` inventories every root entry/descendant with path/type/size/SHA/disposition; root metadata comes from discovery, never a `README.md` allowlist. |
| Local CAS aliases | Every `storage_id` maps totally to one CAS key; many-to-one aliases require exact declared/recomputed byte evidence and complete references. |
| Unreferenced Convex storage | Zero-reference metadata/object pairs retain a source-derived immutable evidence disposition without invented catalog references. |
| Complete local blob surface | Pre/copy/post digests and dispositions cover every discovered blob file, including unreferenced files. |
| Runtime/release authority | Kernel listener ownership plus PID-owned image/executable and deployed compose artifact must match the independent lock; copied `/health` values are corroboration only. |
| Tombstone digest truth | A tombstone preserves a canonical digest of the seven available provenance fields, never nonexistent deleted-document bytes. |

All earlier criteria remain conjunctive. AC-8, AC-9, and TC-22 through TC-55 extend the contract without renumbering earlier IDs. No implementation, import, migration, data mutation, service start, deployment, merge, push, or worktree lifecycle action is part of this repair.

## WRITE-ALLOWED for this repair

Only these planning artifacts may change:

1. `.spec/tasks/imp-mk6-functional-completeness-1786837297/MK6-DATA-001-data-plane-truth.md`
2. `.spec/tasks/imp-mk6-functional-completeness-1786837297/SPEC-REPAIR-MK6-DATA-001-LOCAL-CORPUS.md`

Everything else, including source, tests, scripts, `.tmp`, databases, exports, blobs, primary checkout, services, network state, and runtime state, is read-only.

## Static oracle

The extractable shell block validates the unique target contract and the extractability of both planning contracts. Each file must contain exactly two literal HTML-comment terminators: the requirement marker terminator and its enclosing JSON comment terminator. The canonical generic non-greedy extractor is constructed from string pieces so its own source never adds an inner terminator, and its captured bytes must pass `JSON.parse`/`json.loads`. The SHA-256 values are over canonical JSON (`sort_keys=True`, separators `,` and `:`) for the entire `data_plane_contract` and `real_composite_corpus` fixture objects, so any execution-critical field drift fails. Specific in-memory mutants prove the oracle rejects the reviewed loopholes; one additional mutant removes each required negative control.

STATIC-ORACLE-BEGIN
```bash
set -euo pipefail
python3 - "$1" "$2" <<'PY'
import copy
import hashlib
import json
import re
import sys
from pathlib import Path

target = Path(sys.argv[1])
repair = Path(sys.argv[2])

def extract_generic_contract(path):
    text = path.read_text(encoding="utf-8")
    comment_end = "--" + ">"
    if text.count(comment_end) != 2:
        raise SystemExit(
            f"{path}: expected exactly two literal comment terminators, found {text.count(comment_end)}"
        )
    # Exact canonical generic extractor, split only so this source does not contain its terminator.
    pattern = r"<!-- REQUIREMENT-CONTRACT v1 --" + r">\s*<!--\s*([\s\S]*?)\s*--" + r">"
    matches = re.findall(pattern, text)
    if len(matches) != 1:
        raise SystemExit(f"{path}: expected one generic REQUIREMENT-CONTRACT capture, found {len(matches)}")
    try:
        parsed = json.loads(matches[0])
    except json.JSONDecodeError as error:
        raise SystemExit(f"{path}: generic REQUIREMENT-CONTRACT JSON parse failed: {error}") from error
    return parsed

contract = extract_generic_contract(target)
repair_contract = extract_generic_contract(repair)
if repair_contract.get("task_id") != "SPEC-REPAIR-MK6-DATA-001-LOCAL-CORPUS":
    raise SystemExit("repair contract task_id mismatch")

expected_contract_sha256 = "0c62a37e0a14f9e7818605224b07b42935fb56203313f62d886c6b9789371a88"
expected_fixture_sha256 = "77216d61b940fd04cc30519665475903c5b02ac51810110a3223623d5a9f6e2f"
expected_requirement_ids = [
    "AC-1", "AC-2", "AC-3", "AC-4", "AC-5", "AC-6", "AC-7", "AC-8", "AC-9",
    "TC-1", "TC-2", "TC-3", "TC-4", "TC-5", "TC-6", "TC-7", "TC-8", "TC-9",
    "TC-10", "TC-11", "TC-12", "TC-13", "TC-14", "TC-15", "TC-16", "TC-17", "TC-18",
    "TC-19", "TC-20", "TC-21", "TC-22", "TC-23", "TC-24", "TC-25", "TC-26",
    "TC-27", "TC-28", "TC-29", "TC-30", "TC-31", "TC-32", "TC-33", "TC-34",
    "TC-35", "TC-36", "TC-37", "TC-38",
    "TC-39", "TC-40", "TC-41", "TC-42", "TC-43", "TC-44", "TC-45", "TC-46",
    "TC-47", "TC-48", "TC-49", "TC-50", "TC-51", "TC-52", "TC-53", "TC-54",
    "TC-55",
]
expected_controls = [
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
    "invalid-witness-utf8",
]
expected_writes = [
    "services/platform/src/etl/composite-corpus.ts",
    "services/platform/src/etl/archive.ts",
    "services/platform/src/etl/run.ts",
    "services/platform/src/etl/reconcile.ts",
    "services/platform/src/etl/latest-run.ts",
    "services/platform/src/cutover/data-plane-content.ts",
    "services/platform/tests/integration/mk6-data-plane-truth-live.test.ts",
    "scripts/verify-mk6-data-plane-truth.sh",
    ".tmp/MK6-DATA-001/${RUN_ID}/**",
]

def canonical_sha256(value):
    payload = json.dumps(value, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()

def errors(candidate):
    found = []
    extension = candidate.get("data_plane_contract", {})
    fixture = candidate.get("fixtures", {}).get("real_composite_corpus", {})
    if canonical_sha256(extension) != expected_contract_sha256:
        found.append("execution-contract-drift")
    if canonical_sha256(fixture) != expected_fixture_sha256:
        found.append("real-fixture-descriptor-drift")
    if [item.get("id") for item in candidate.get("requirements", [])] != expected_requirement_ids:
        found.append("requirement-id-drift")
    if extension.get("negative_controls") != expected_controls:
        found.append("negative-control-drift")
    if extension.get("write_allowed") != expected_writes:
        found.append("write-scope-drift")
    positive_surface = json.dumps({
        "fixture": fixture,
        "primary": candidate.get("requirements", [])[:1],
    }).lower()
    if "mk6-data-sentinel-1" in positive_surface:
        found.append("fixed-sentinel")
    if "_export_provenance.json" in positive_surface:
        found.append("mandatory-legacy-sidecar")
    if "synthetic" in fixture.get("description", "").lower():
        found.append("synthetic-fixture")
    count_surface = json.dumps({
        "records": fixture.get("records", []),
        "authorizing": extension.get("authorizing_corpus_counts"),
    }).lower()
    if extension.get("authorizing_corpus_counts") is not None:
        found.append("authorizing-corpus-counts")
    if re.search(r"(document|corpus|row|session|iteration|blob).*expectedcount\s*[:=]\s*\d+", count_surface):
        found.append("hardcoded-fixture-count")
    inventory = extension.get("full_inventory", {})
    required_arrays = [
        "convex.filesystemEntries", "convex.tables", "convex.systemEntries",
        "convex.storageMetadata", "convex.storageObjects", "sqlite.physicalTables",
        "sqlite.logicalRows", "sqlite.referencedBlobs", "sqlite.blobFiles",
    ]
    if inventory.get("schema") != "holocron.mk6.full-source-inventory.v1":
        found.append("full-inventory-schema")
    if inventory.get("boundary") != "derive-complete-snapshot-surface-never-loader-known-set-or-catalog-count":
        found.append("full-inventory-boundary")
    if inventory.get("manifest_arrays") != required_arrays:
        found.append("full-inventory-arrays")
    required_zeros = {
        "unmappedSourceItemCount", "omittedSourceItemCount", "duplicateSourceIdentityCount",
        "ambiguousDispositionCount", "convexFilesystemEntryOmittedCount",
        "convexFilesystemEntryUnclassifiedCount", "convexFilesystemEntryDuplicateCount",
        "convexFilesystemEntryAmbiguousDispositionCount", "convexFilesystemEntryTypeMismatchCount",
        "convexFilesystemEntrySizeMismatchCount", "convexFilesystemEntryDigestMismatchCount",
        "convexRootEntryClassMismatchCount", "convexRootMetadataOmittedCount",
        "convexCatalogDriftOmittedCount", "convexCatalogDriftUnmappedCount",
        "convexTableSetMismatchCount", "convexStorageBijectionMismatchCount",
        "convexStorageUnreferencedUndispositionedCount", "convexStorageForgedReferenceCount",
        "sqliteUnclassifiedPhysicalTableCount", "sqliteUnclassifiedLogicalTableCount",
        "sqliteBlobIdentityUnmappedCount", "sqliteBlobInvalidAliasCount",
        "sqliteBlobCasCollisionCount", "sqliteBlobByteMismatchCount",
        "sqliteBlobFileOmittedCount", "sqliteBlobFileUndispositionedCount",
    }
    if set(inventory.get("required_zero_counts", [])) != required_zeros:
        found.append("full-inventory-zero-gates")
    filesystem = inventory.get("convex_filesystem_entries", {})
    if filesystem.get("discovery") != "recursive-lstat-every-direct-root-entry-and-descendant-without-following-links-or-skipping-dotfiles":
        found.append("convex-filesystem-recursive-discovery")
    if filesystem.get("root_metadata_discovery") != "every-discovered-direct-root-regular-file-not-owned-by-table-or-underscore-system-class-never-filename-allowlist":
        found.append("convex-root-metadata-discovery")
    if filesystem.get("required_bijection") != "source-lstat-entry-identities=manifest-filesystem-entry-identities=snapshot-lstat-entry-identities-one-to-one":
        found.append("convex-filesystem-bijection")
    if filesystem.get("required_partition") != "every-filesystem-entry-owned-by-exactly-one-root-owner-class":
        found.append("convex-filesystem-partition")
    convex_tables = inventory.get("convex_tables", {})
    if convex_tables.get("catalog_reconciliation") != "discovered-set-first-then-catalog-tables-plus-nonunderscore-exclusions-never-catalog-count-first":
        found.append("convex-catalog-discovery-order")
    if convex_tables.get("catalog_drift_disposition") != "source-backed-catalog-drift-archive-only-if-every-export-identity-and-content-digest-is-losslessly-accounted-in-sqlite-logical-rows-and-provenance":
        found.append("convex-catalog-drift-disposition")
    if convex_tables.get("catalog_scalar_expected_counts_authorize_success") is not False:
        found.append("convex-catalog-count-authority")
    convex_storage = inventory.get("convex_storage", {})
    if convex_storage.get("reference_discovery") != "zero-or-more-source-row-field-references-per-storage-identity-derived-before-catalog-reconcile":
        found.append("convex-storage-reference-cardinality")
    if convex_storage.get("unreferenced_policy") != "zero-ref-metadata-object-pair-gets-versioned-source-derived-unreferenced-storage-evidence-disposition-without-invented-ref-or-product-row":
        found.append("convex-storage-unreferenced-disposition")
    if convex_storage.get("exactly_one_catalog_ref_required") is not False:
        found.append("convex-storage-forced-catalog-ref")
    sqlite_blobs = inventory.get("sqlite_blobs", {})
    if not sqlite_blobs.get("identity_to_cas_mapping", "").startswith("total-function-every-unique-storage_id"):
        found.append("sqlite-blob-total-cas-mapping")
    if not sqlite_blobs.get("many_to_one_cas_allowed", "").startswith("only-explicit-dedup-groups"):
        found.append("sqlite-blob-dedup-proof")
    if not sqlite_blobs.get("collision_policy", "").startswith("reject-one-storage-id-to-multiple-CAS-keys"):
        found.append("sqlite-blob-collision-policy")
    blob_snapshot = extension.get("snapshot_semantics", {}).get("sqlite-blob-store", {})
    if blob_snapshot.get("verification") != "complete-discovered-inventory-byte-sha256-never-referenced-only-or-existence-only":
        found.append("complete-blob-snapshot-verification")
    if blob_snapshot.get("unreferenced_files") != "explicit-immutable-nonmaterialized-disposition-and-included-in-pre-copy-post-digest":
        found.append("unreferenced-blob-snapshot-disposition")
    tombstone = extension.get("local_provenance_accounting", {}).get("tombstone_digest", {})
    if tombstone.get("schema") != "canonical-provenance-record-v1":
        found.append("tombstone-provenance-digest-schema")
    if tombstone.get("exact_fields") != [
        "table_name", "row_id", "import_batch_id", "source_origin",
        "first_imported_at", "last_imported_at", "import_count",
    ]:
        found.append("tombstone-provenance-digest-fields")
    if tombstone.get("semantic_scope") != "available-normalized-import_row_provenance-fields-only-never-deleted-source-row-or-document-content-bytes":
        found.append("tombstone-provenance-digest-scope")
    if tombstone.get("forbid_hand_authored_or_ambiguous_digest") is not True:
        found.append("tombstone-provenance-digest-authority")
    binding = extension.get("postgres_external_binding", {})
    if binding.get("health_identity_role") != "corroboration-only-never-ownership-or-release-authority":
        found.append("health-identity-authority")
    if not binding.get("independent_listener_observation", "").startswith("kernel-socket-table"):
        found.append("independent-listener-observation")
    if not binding.get("independent_runtime_observation", "").startswith("read-only-host-container-inspect"):
        found.append("independent-runtime-observation")
    if not binding.get("independent_compose_observation", "").startswith("realpath-no-symlink-sha256"):
        found.append("independent-compose-observation")
    if len(binding.get("required_observed_equalities", [])) != 5:
        found.append("observed-release-equalities")
    witness_api = extension.get("external_witness_api", {})
    if witness_api.get("method") != "GET" or witness_api.get("route_template") != "/api/documents/:id":
        found.append("external-witness-route")
    if witness_api.get("path_parameter") != "id=encodeURIComponent(mappedPostgresId)":
        found.append("external-witness-path-identity")
    if witness_api.get("decode") != "fatal-utf8-no-bom-replacement-trim-normalize-or-reserialize":
        found.append("external-witness-utf8")
    mapping = extension.get("witness_selection", {}).get("mapping", {})
    if not mapping.get("forward", "").startswith("exactly-one-row"):
        found.append("external-witness-forward-mapping")
    if not mapping.get("reverse", "").startswith("exactly-one-row"):
        found.append("external-witness-reverse-mapping")
    return found

base_errors = errors(contract)
if base_errors:
    raise SystemExit("target rejected: " + ",".join(base_errors))

mutants = []

fixed_witness = copy.deepcopy(contract)
fixed_witness["data_plane_contract"]["witness_selection"]["formula"] = "mk6-data-sentinel-1"
mutants.append(("fixed-witness", fixed_witness))

asserted_provenance = copy.deepcopy(contract)
asserted_provenance["data_plane_contract"]["provenance"]["mode"] = "declared-real"
asserted_provenance["data_plane_contract"]["provenance"]["facts_from"] = ["source=real"]
mutants.append(("asserted-provenance", asserted_provenance))

missing_local_source = copy.deepcopy(contract)
missing_local_source["data_plane_contract"]["sources"] = ["convex-export"]
mutants.append(("missing-local-source", missing_local_source))

widened_scope = copy.deepcopy(contract)
widened_scope["data_plane_contract"]["write_allowed"] = ["services/**"]
mutants.append(("widened-scope", widened_scope))

downgraded_blob = copy.deepcopy(contract)
downgraded_blob["data_plane_contract"]["snapshot_semantics"]["sqlite-blob-store"]["verification"] = "existence-only"
mutants.append(("downgraded-blob-semantics", downgraded_blob))

removed_postgres_boundary = copy.deepcopy(contract)
removed_postgres_boundary["data_plane_contract"]["witness_selection"]["boundaries"].remove("direct-postgres")
mutants.append(("removed-postgres-boundary", removed_postgres_boundary))

removed_external_boundary = copy.deepcopy(contract)
removed_external_boundary["data_plane_contract"]["witness_selection"]["boundaries"].remove("external-product-surface")
mutants.append(("removed-external-boundary", removed_external_boundary))

handwritten_hash = copy.deepcopy(contract)
handwritten_hash["data_plane_contract"]["provenance"]["allow_handwritten_expected_hash"] = True
mutants.append(("handwritten-hash-permission", handwritten_hash))

synthetic_fixture = copy.deepcopy(contract)
synthetic_fixture["fixtures"]["real_composite_corpus"]["description"] = "synthetic generated fixture"
mutants.append(("synthetic-fixture-description", synthetic_fixture))

arbitrary_clone = copy.deepcopy(contract)
arbitrary_clone["data_plane_contract"]["source_admission"]["arbitrary_per_source_override_allowed"] = True
mutants.append(("arbitrary-clone-admission", arbitrary_clone))

symlink_allowed = copy.deepcopy(contract)
symlink_allowed["data_plane_contract"]["source_admission"]["reject_symlink_in_any_component"] = False
mutants.append(("symlink-admission", symlink_allowed))

sqlite_raw_copy = copy.deepcopy(contract)
sqlite_raw_copy["data_plane_contract"]["snapshot_semantics"]["sqlite-database"]["copy"] = "raw-copy"
sqlite_raw_copy["data_plane_contract"]["snapshot_semantics"]["sqlite-database"]["required_equal_checkpoints"].pop()
mutants.append(("sqlite-one-sided-raw-copy", sqlite_raw_copy))

fixture_authorizing_count = copy.deepcopy(contract)
fixture_authorizing_count["fixtures"]["real_composite_corpus"]["records"].append(
    "documentExpectedCount: 18"
)
mutants.append(("fixture-authorizing-corpus-count", fixture_authorizing_count))

contract_authorizing_count = copy.deepcopy(contract)
contract_authorizing_count["data_plane_contract"]["authorizing_corpus_counts"] = {
    "documents": 1641
}
mutants.append(("contract-authorizing-corpus-count", contract_authorizing_count))

health_derived_release = copy.deepcopy(contract)
health_derived_release["data_plane_contract"]["postgres_external_binding"]["release_lock_independence"] = (
    "derive-expected-from-health-under-test"
)
mutants.append(("health-derived-release-identity", health_derived_release))

removed_release_identity = copy.deepcopy(contract)
removed_release_identity["data_plane_contract"]["postgres_external_binding"]["expected_deployment_identity_fields"] = []
mutants.append(("removed-release-identity-fields", removed_release_identity))

optional_witness_auth = copy.deepcopy(contract)
optional_witness_auth["data_plane_contract"]["witness_auth"]["required_before_witness_request"] = False
mutants.append(("optional-witness-auth", optional_witness_auth))

wrong_auth_header = copy.deepcopy(contract)
wrong_auth_header["data_plane_contract"]["witness_auth"]["request_header"] = "X-Api-Key: <token>"
mutants.append(("wrong-witness-auth-header", wrong_auth_header))

credential_logging = copy.deepcopy(contract)
credential_logging["data_plane_contract"]["witness_auth"]["evidence_policy"] = "print-token-and-header"
mutants.append(("credential-logging-allowed", credential_logging))

loader_known_inventory = copy.deepcopy(contract)
loader_known_inventory["data_plane_contract"]["full_inventory"]["boundary"] = "loader-known-only"
mutants.append(("loader-known-inventory-boundary", loader_known_inventory))

missing_inventory_array = copy.deepcopy(contract)
missing_inventory_array["data_plane_contract"]["full_inventory"]["manifest_arrays"].remove("sqlite.logicalRows")
mutants.append(("missing-inventory-array", missing_inventory_array))

permit_unmapped_inventory = copy.deepcopy(contract)
permit_unmapped_inventory["data_plane_contract"]["full_inventory"]["required_zero_counts"].remove("unmappedSourceItemCount")
mutants.append(("permit-unmapped-source-item", permit_unmapped_inventory))

nonbijective_convex_storage = copy.deepcopy(contract)
nonbijective_convex_storage["data_plane_contract"]["full_inventory"]["convex_storage"]["bijection"] = "optional"
mutants.append(("nonbijective-convex-storage", nonbijective_convex_storage))

unclassified_sqlite = copy.deepcopy(contract)
unclassified_sqlite["data_plane_contract"]["full_inventory"]["sqlite_tables"]["one_class_per_physical_table"] = False
mutants.append(("unclassified-sqlite-table", unclassified_sqlite))

nonbijective_sqlite_blob = copy.deepcopy(contract)
nonbijective_sqlite_blob["data_plane_contract"]["full_inventory"]["sqlite_blobs"]["bijection"] = "optional"
mutants.append(("nonbijective-sqlite-blob", nonbijective_sqlite_blob))

arbitrary_witness_route = copy.deepcopy(contract)
arbitrary_witness_route["data_plane_contract"]["external_witness_api"]["route_template"] = "/api/content-probe"
mutants.append(("arbitrary-witness-route", arbitrary_witness_route))

wrong_witness_method = copy.deepcopy(contract)
wrong_witness_method["data_plane_contract"]["external_witness_api"]["method"] = "POST"
mutants.append(("wrong-witness-method", wrong_witness_method))

source_id_path = copy.deepcopy(contract)
source_id_path["data_plane_contract"]["external_witness_api"]["path_parameter"] = "id=sourceId"
mutants.append(("source-id-instead-of-mapped-id", source_id_path))

nullable_witness_content = copy.deepcopy(contract)
nullable_witness_content["data_plane_contract"]["external_witness_api"]["response_schema"]["document"]["content"] = "string-or-null"
mutants.append(("nullable-witness-content", nullable_witness_content))

replacement_utf8 = copy.deepcopy(contract)
replacement_utf8["data_plane_contract"]["external_witness_api"]["decode"] = "replacement-utf8"
mutants.append(("replacement-witness-utf8", replacement_utf8))

weak_forward_mapping = copy.deepcopy(contract)
weak_forward_mapping["data_plane_contract"]["witness_selection"]["mapping"]["forward"] = "zero-or-more-rows"
mutants.append(("weak-forward-witness-mapping", weak_forward_mapping))

missing_reverse_mapping = copy.deepcopy(contract)
missing_reverse_mapping["data_plane_contract"]["witness_selection"]["mapping"]["reverse"] = "not-checked"
mutants.append(("missing-reverse-witness-mapping", missing_reverse_mapping))

originless_chain = copy.deepcopy(contract)
originless_chain["data_plane_contract"]["external_witness_api"]["chain"] = "sourceId->response.document.id+contentSha256"
mutants.append(("originless-witness-chain", originless_chain))

missing_export_filesystem_array = copy.deepcopy(contract)
missing_export_filesystem_array["data_plane_contract"]["full_inventory"]["manifest_arrays"].remove("convex.filesystemEntries")
mutants.append(("missing-export-filesystem-array", missing_export_filesystem_array))

root_only_export_discovery = copy.deepcopy(contract)
root_only_export_discovery["data_plane_contract"]["full_inventory"]["convex_filesystem_entries"]["discovery"] = "direct-root-only"
mutants.append(("nonrecursive-export-filesystem-discovery", root_only_export_discovery))

readme_allowlist = copy.deepcopy(contract)
readme_allowlist["data_plane_contract"]["full_inventory"]["convex_filesystem_entries"]["root_metadata_discovery"] = "README.md-only"
mutants.append(("root-metadata-filename-allowlist", readme_allowlist))

optional_export_bijection = copy.deepcopy(contract)
optional_export_bijection["data_plane_contract"]["full_inventory"]["convex_filesystem_entries"]["required_bijection"] = "optional"
mutants.append(("optional-export-filesystem-bijection", optional_export_bijection))

missing_export_zero_gate = copy.deepcopy(contract)
missing_export_zero_gate["data_plane_contract"]["full_inventory"]["required_zero_counts"].remove("convexFilesystemEntryUnclassifiedCount")
mutants.append(("missing-export-unclassified-zero-gate", missing_export_zero_gate))

catalog_first_discovery = copy.deepcopy(contract)
catalog_first_discovery["data_plane_contract"]["full_inventory"]["convex_tables"]["catalog_reconciliation"] = "catalog-first"
mutants.append(("catalog-first-table-discovery", catalog_first_discovery))

optional_catalog_drift = copy.deepcopy(contract)
optional_catalog_drift["data_plane_contract"]["full_inventory"]["convex_tables"]["catalog_drift_disposition"] = "optional-or-drop"
mutants.append(("optional-catalog-drift-disposition", optional_catalog_drift))

catalog_count_authority = copy.deepcopy(contract)
catalog_count_authority["data_plane_contract"]["full_inventory"]["convex_tables"]["catalog_scalar_expected_counts_authorize_success"] = True
mutants.append(("catalog-scalar-count-authority", catalog_count_authority))

forced_local_blob_bijection = copy.deepcopy(contract)
forced_local_blob_bijection["data_plane_contract"]["full_inventory"]["sqlite_blobs"]["identity_to_cas_mapping"] = "one-storage-identity-to-one-distinct-byte-object"
mutants.append(("forced-local-blob-bijection", forced_local_blob_bijection))

unproven_local_blob_alias = copy.deepcopy(contract)
unproven_local_blob_alias["data_plane_contract"]["full_inventory"]["sqlite_blobs"]["many_to_one_cas_allowed"] = "any-shared-path"
mutants.append(("unproven-local-blob-alias", unproven_local_blob_alias))

ignored_local_blob_collision = copy.deepcopy(contract)
ignored_local_blob_collision["data_plane_contract"]["full_inventory"]["sqlite_blobs"]["collision_policy"] = "ignore"
mutants.append(("ignored-local-blob-collision", ignored_local_blob_collision))

forced_convex_catalog_ref = copy.deepcopy(contract)
forced_convex_catalog_ref["data_plane_contract"]["full_inventory"]["convex_storage"]["exactly_one_catalog_ref_required"] = True
mutants.append(("forced-convex-storage-catalog-ref", forced_convex_catalog_ref))

dropped_unreferenced_convex_storage = copy.deepcopy(contract)
dropped_unreferenced_convex_storage["data_plane_contract"]["full_inventory"]["convex_storage"]["unreferenced_policy"] = "drop"
mutants.append(("dropped-unreferenced-convex-storage", dropped_unreferenced_convex_storage))

catalog_only_storage_refs = copy.deepcopy(contract)
catalog_only_storage_refs["data_plane_contract"]["full_inventory"]["convex_storage"]["reference_discovery"] = "catalog-fields-only"
mutants.append(("catalog-only-convex-storage-refs", catalog_only_storage_refs))

referenced_only_blob_snapshot = copy.deepcopy(contract)
referenced_only_blob_snapshot["data_plane_contract"]["snapshot_semantics"]["sqlite-blob-store"]["verification"] = "referenced-only-byte-sha256"
mutants.append(("referenced-only-blob-snapshot", referenced_only_blob_snapshot))

ignored_unreferenced_blob_files = copy.deepcopy(contract)
ignored_unreferenced_blob_files["data_plane_contract"]["snapshot_semantics"]["sqlite-blob-store"]["unreferenced_files"] = "ignored"
mutants.append(("ignored-unreferenced-blob-files", ignored_unreferenced_blob_files))

health_authoritative = copy.deepcopy(contract)
health_authoritative["data_plane_contract"]["postgres_external_binding"]["health_identity_role"] = "authoritative"
mutants.append(("health-authoritative-deployment-identity", health_authoritative))

health_runtime_observation = copy.deepcopy(contract)
health_runtime_observation["data_plane_contract"]["postgres_external_binding"]["independent_runtime_observation"] = "copy-from-health"
mutants.append(("health-derived-runtime-observation", health_runtime_observation))

missing_observed_release_equality = copy.deepcopy(contract)
missing_observed_release_equality["data_plane_contract"]["postgres_external_binding"]["required_observed_equalities"].pop()
mutants.append(("missing-observed-release-equality", missing_observed_release_equality))

deleted_content_tombstone_digest = copy.deepcopy(contract)
deleted_content_tombstone_digest["data_plane_contract"]["local_provenance_accounting"]["tombstone_digest"]["semantic_scope"] = "deleted-document-content-bytes"
mutants.append(("deleted-content-tombstone-digest", deleted_content_tombstone_digest))

incomplete_tombstone_digest = copy.deepcopy(contract)
incomplete_tombstone_digest["data_plane_contract"]["local_provenance_accounting"]["tombstone_digest"]["exact_fields"].remove("row_id")
mutants.append(("incomplete-tombstone-provenance-digest", incomplete_tombstone_digest))

ambiguous_tombstone_digest = copy.deepcopy(contract)
ambiguous_tombstone_digest["data_plane_contract"]["local_provenance_accounting"]["tombstone_digest"]["forbid_hand_authored_or_ambiguous_digest"] = False
mutants.append(("ambiguous-tombstone-provenance-digest", ambiguous_tombstone_digest))

for control in expected_controls:
    removed_control = copy.deepcopy(contract)
    removed_control["data_plane_contract"]["negative_controls"].remove(control)
    mutants.append((f"removed-negative:{control}", removed_control))

for label, mutant in mutants:
    if not errors(mutant):
        raise SystemExit(f"oracle accepted mutant: {label}")

print(json.dumps({
    "contractValid": True,
    "contractSha256": expected_contract_sha256,
    "fixtureSha256": expected_fixture_sha256,
    "sourceCount": len(contract["data_plane_contract"]["sources"]),
    "negativeControlCount": len(expected_controls),
    "writeAllowedCount": len(expected_writes),
    "requirementCount": len(expected_requirement_ids),
    "mutantsRejected": len(mutants),
    "literalTerminatorCountPerFile": 2,
    "canonicalGenericJsonParseCount": 2,
}, sort_keys=True))
PY
```
STATIC-ORACLE-END

Run it from the worktree with:

```bash
TARGET=.spec/tasks/imp-mk6-functional-completeness-1786837297/MK6-DATA-001-data-plane-truth.md
REPAIR=.spec/tasks/imp-mk6-functional-completeness-1786837297/SPEC-REPAIR-MK6-DATA-001-LOCAL-CORPUS.md
awk '/^STATIC-ORACLE-BEGIN$/{on=1;next}/^STATIC-ORACLE-END$/{on=0}on && !/^```/{print}' "$REPAIR" | bash -s -- "$TARGET" "$REPAIR"
```

## Acceptance Criteria

- [ ] AC-1: The extractable oracle exits zero and reports three sources, 54 negative controls, nine future write paths, 64 stable requirements, 109 rejected in-memory mutants, exactly two literal terminators per planning file, and two canonical generic JSON parses.
- [ ] AC-2: Both files contain exactly two literal comment terminators and exactly one contract captured and parsed by the canonical generic non-greedy extractor; the scenario validator reports zero critical issues for both.
- [ ] AC-3: `git diff --name-only ca853e8cc8071a9ff505c5d9549bb9f23295413d...HEAD` after the repair commit contains exactly the two planning files listed under WRITE-ALLOWED.
- [ ] AC-4: The target preserves every prior ID, adds AC-8, AC-9, and TC-22 through TC-55, and explicitly does not require the MCP branch to land.

## Test Criteria

| ID | Binary statement | Maps | Verify |
|---|---|---|---|
| TC-1 | The oracle pins the full execution contract and fixture hashes and rejects all 109 specific/control-removal mutants. | AC-1 | `TARGET=.spec/tasks/imp-mk6-functional-completeness-1786837297/MK6-DATA-001-data-plane-truth.md REPAIR=.spec/tasks/imp-mk6-functional-completeness-1786837297/SPEC-REPAIR-MK6-DATA-001-LOCAL-CORPUS.md; awk '/^STATIC-ORACLE-BEGIN$/{on=1;next}/^STATIC-ORACLE-END$/{on=0}on && !/^```/{print}' "$REPAIR" \| bash -s -- "$TARGET" "$REPAIR"` |
| TC-2 | The target requirement contract has exactly two terminators, parses through the canonical generic extractor, and is scenario-valid. | AC-2 | `python3 -c 'import json,re,sys; s=open(sys.argv[1]).read(); e="--"+">"; p=r"<!-- REQUIREMENT-CONTRACT v1 --"+r">\\s*<!--\\s*([\\s\\S]*?)\\s*--"+r">"; m=re.findall(p,s); assert s.count(e)==2; assert len(m)==1; json.loads(m[0]); print(m[0])' .spec/tasks/imp-mk6-functional-completeness-1786837297/MK6-DATA-001-data-plane-truth.md \| python3 "$HOME/Projects/brain/tools/validate-scenario/validate_scenario.py"` |
| TC-3 | The repair requirement contract has exactly two terminators, parses through the canonical generic extractor, and is scenario-valid. | AC-2 | `python3 -c 'import json,re,sys; s=open(sys.argv[1]).read(); e="--"+">"; p=r"<!-- REQUIREMENT-CONTRACT v1 --"+r">\\s*<!--\\s*([\\s\\S]*?)\\s*--"+r">"; m=re.findall(p,s); assert s.count(e)==2; assert len(m)==1; json.loads(m[0]); print(m[0])' .spec/tasks/imp-mk6-functional-completeness-1786837297/SPEC-REPAIR-MK6-DATA-001-LOCAL-CORPUS.md \| python3 "$HOME/Projects/brain/tools/validate-scenario/validate_scenario.py"` |
| TC-4 | The committed diff is limited to the two authorized planning files. | AC-3 | `test "$(git diff --name-only ca853e8cc8071a9ff505c5d9549bb9f23295413d...HEAD \| sort)" = "$(printf '%s\n' .spec/tasks/imp-mk6-functional-completeness-1786837297/MK6-DATA-001-data-plane-truth.md .spec/tasks/imp-mk6-functional-completeness-1786837297/SPEC-REPAIR-MK6-DATA-001-LOCAL-CORPUS.md \| sort)"` |
| TC-5 | All stable target IDs and the no-MCP-landing decision remain explicit. | AC-4 | `TARGET=.spec/tasks/imp-mk6-functional-completeness-1786837297/MK6-DATA-001-data-plane-truth.md; for id in AC-1 AC-2 AC-3 AC-4 AC-5 AC-6 AC-7 AC-8 AC-9 $(printf 'TC-%s ' {1..55}); do rg -q "\"id\": \"$id\"" "$TARGET"; done && rg -q 'does \*\*not\*\* require the local-only MCP branch to land first' "$TARGET"` |

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "SPEC-REPAIR-MK6-DATA-001-LOCAL-CORPUS",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "target_task_contract": {
      "seed_method": "migration_fixture",
      "description": "repository MK6-DATA-001 contract at the dispatch base; evaluated without opening or mutating source corpora or runtime",
      "records": [
        "targetTaskId: MK6-DATA-001",
        "dispatchBase: ca853e8cc8071a9ff505c5d9549bb9f23295413d",
        "authorizedPlanningFileCount: 2",
        "expectedTargetRequirementCount: 64",
        "expectedNegativeControlCount: 54",
        "expectedOracleMutantCount: 109"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "The static oracle pins the complete target extension and real fixture descriptor, rejects 109 explicit or per-control mutants, and fail-closes on non-generic contract extraction",
      "verify": "TARGET=.spec/tasks/imp-mk6-functional-completeness-1786837297/MK6-DATA-001-data-plane-truth.md REPAIR=.spec/tasks/imp-mk6-functional-completeness-1786837297/SPEC-REPAIR-MK6-DATA-001-LOCAL-CORPUS.md; awk '/^STATIC-ORACLE-BEGIN$/{on=1;next}/^STATIC-ORACLE-END$/{on=0}on && !/^```/{print}' \"$REPAIR\" | bash -s -- \"$TARGET\" \"$REPAIR\"",
      "maps_to_ac": null,
      "scenario": {
        "id": "static-contract-oracle-v2",
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "requirement-contract-parser",
        "negative_control": {
          "would_fail_if": [
            "an empty extension, source admission downgrade, nonrecursive export inventory, root-metadata allowlist, catalog-first omission, forced one-to-one CAS, undispositioned storage/blob evidence, health-authoritative release identity, deleted-content tombstone claim, one-sided snapshot, arbitrary witness route, handwritten hash, synthetic fixture, or missing required negative is accepted"
          ]
        },
        "evidence": {
          "artifact_type": "cli_output",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "target_task_contract",
            "action": {
              "actor": "cli_user",
              "steps": [
                "extract and run the static oracle against the repaired target, including 55 explicit downgrades and one removal mutant for each of 54 controls"
              ]
            },
            "end_state": {
              "must_observe": [
                "sourceCount: 3",
                "negativeControlCount: 54",
                "writeAllowedCount: 9",
                "requirementCount: 64",
                "mutantsRejected: 109",
                "literalTerminatorCountPerFile: 2",
                "canonicalGenericJsonParseCount: 2"
              ],
              "must_not_observe": [
                "empty extension accepted",
                "oracle accepted mutant",
                "negativeControlCount: 8",
                "mutantsRejected: 4"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "Both planning files contain exactly two literal comment terminators and one scenario-valid JSON contract parsed by the canonical generic non-greedy extractor",
      "verify": "for f in .spec/tasks/imp-mk6-functional-completeness-1786837297/MK6-DATA-001-data-plane-truth.md .spec/tasks/imp-mk6-functional-completeness-1786837297/SPEC-REPAIR-MK6-DATA-001-LOCAL-CORPUS.md; do python3 -c 'import json,re,sys; s=open(sys.argv[1]).read(); e=\"--\"+\">\"; p=r\"<!-- REQUIREMENT-CONTRACT v1 --\"+r\">\\s*<!--\\s*([\\s\\S]*?)\\s*--\"+r\">\"; m=re.findall(p,s); assert s.count(e)==2; assert len(m)==1; json.loads(m[0]); print(m[0])' \"$f\" | python3 \"$HOME/Projects/brain/tools/validate-scenario/validate_scenario.py\"; done",
      "maps_to_ac": null,
      "scenario": {
        "id": "unique-scenario-contract-validation",
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "scenario-validator",
        "negative_control": {
          "would_fail_if": [
            "a file has other than two literal terminators, the generic extractor truncates at an inner terminator, JSON parsing fails, a block is absent/duplicated/empty, a behavioral criterion lacks a scenario, or any scenario oracle is weak"
          ]
        },
        "evidence": {
          "artifact_type": "cli_output",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "target_task_contract",
            "action": {
              "actor": "cli_user",
              "steps": [
                "require exactly two literal terminators per file, run the canonical generic non-greedy extractor, parse the captured JSON, and run the shared scenario validator"
              ]
            },
            "end_state": {
              "must_observe": [
                "validatedContractCount: 2",
                "literalTerminatorCountPerFile: 2",
                "canonicalGenericJsonParseCount: 2",
                "duplicateContractCount: 0",
                "criticalIssueCount: 0"
              ],
              "must_not_observe": [
                "empty contract accepted",
                "JSONDecodeError",
                "CRITICAL"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "The repair commit changes exactly the two authorized planning files",
      "verify": "test \"$(git diff --name-only ca853e8cc8071a9ff505c5d9549bb9f23295413d...HEAD | sort)\" = \"$(printf '%s\\n' .spec/tasks/imp-mk6-functional-completeness-1786837297/MK6-DATA-001-data-plane-truth.md .spec/tasks/imp-mk6-functional-completeness-1786837297/SPEC-REPAIR-MK6-DATA-001-LOCAL-CORPUS.md | sort)\"",
      "maps_to_ac": null,
      "scenario": {
        "id": "cycle-six-repair-write-scope",
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "git",
        "negative_control": {
          "would_fail_if": [
            "a source, test, script, database, export, blob, runtime, state, network setting, or third planning file is changed, or an empty diff is accepted"
          ]
        },
        "evidence": {
          "artifact_type": "cli_output",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "target_task_contract",
            "action": {
              "actor": "cli_user",
              "steps": [
                "compare the committed branch diff to dispatch base and require the exact sorted two-path set"
              ]
            },
            "end_state": {
              "must_observe": [
                "changedPlanningFileCount: 2",
                "unauthorizedChangedPathCount: 0"
              ],
              "must_not_observe": [
                "empty diff accepted",
                "changedDatabaseCount: 1",
                "changedRuntimeFileCount: 1"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "The target preserves stable criteria, adds the reviewed Cycle-6 IDs, and does not require MCP branch landing",
      "verify": "TARGET=.spec/tasks/imp-mk6-functional-completeness-1786837297/MK6-DATA-001-data-plane-truth.md; for id in AC-1 AC-2 AC-3 AC-4 AC-5 AC-6 AC-7 AC-8 AC-9 $(printf 'TC-%s ' {1..55}); do rg -q '\"id\": \"'$id'\"' \"$TARGET\"; done && rg -q 'does \\*\\*not\\*\\* require the local-only MCP branch to land first' \"$TARGET\"",
      "maps_to_ac": null,
      "scenario": {
        "id": "stable-ids-and-mcp-dependency-v2",
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "task-contract-parser",
        "negative_control": {
          "would_fail_if": [
            "the count-equal criterion disappears, an empty ID set passes, stable IDs are renumbered, Cycle-6 controls lack IDs, or the MCP branch becomes an undeclared dependency"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "target_task_contract",
            "action": {
              "actor": "cli_user",
              "steps": [
                "inspect exact target AC/TC IDs and the explicit MCP branch decision"
              ]
            },
            "end_state": {
              "must_observe": [
                "acceptanceCriterionIds: AC-1,AC-2,AC-3,AC-4,AC-5,AC-6,AC-7,AC-8,AC-9",
                "testCriterionRange: TC-1..TC-55",
                "mcpBranchLandingRequired: false"
              ],
              "must_not_observe": [
                "empty acceptance-criterion set",
                "acceptanceCriterionIds: AC-1,AC-3",
                "mcpBranchLandingRequired: true"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "The static oracle accepts both generic contract captures and the exact target while rejecting all 109 mutants",
      "verify": "TARGET=.spec/tasks/imp-mk6-functional-completeness-1786837297/MK6-DATA-001-data-plane-truth.md REPAIR=.spec/tasks/imp-mk6-functional-completeness-1786837297/SPEC-REPAIR-MK6-DATA-001-LOCAL-CORPUS.md; awk '/^STATIC-ORACLE-BEGIN$/{on=1;next}/^STATIC-ORACLE-END$/{on=0}on && !/^```/{print}' \"$REPAIR\" | bash -s -- \"$TARGET\" \"$REPAIR\"",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Both exactly bounded requirement contracts parse with the canonical generic extractor and are scenario-valid",
      "verify": "for f in .spec/tasks/imp-mk6-functional-completeness-1786837297/MK6-DATA-001-data-plane-truth.md .spec/tasks/imp-mk6-functional-completeness-1786837297/SPEC-REPAIR-MK6-DATA-001-LOCAL-CORPUS.md; do python3 -c 'import json,re,sys; s=open(sys.argv[1]).read(); e=\"--\"+\">\"; p=r\"<!-- REQUIREMENT-CONTRACT v1 --\"+r\">\\s*<!--\\s*([\\s\\S]*?)\\s*--\"+r\">\"; m=re.findall(p,s); assert s.count(e)==2; assert len(m)==1; json.loads(m[0]); print(m[0])' \"$f\" | python3 \"$HOME/Projects/brain/tools/validate-scenario/validate_scenario.py\"; done",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "The committed branch diff contains only the authorized files",
      "verify": "test \"$(git diff --name-only ca853e8cc8071a9ff505c5d9549bb9f23295413d...HEAD | sort)\" = \"$(printf '%s\\n' .spec/tasks/imp-mk6-functional-completeness-1786837297/MK6-DATA-001-data-plane-truth.md .spec/tasks/imp-mk6-functional-completeness-1786837297/SPEC-REPAIR-MK6-DATA-001-LOCAL-CORPUS.md | sort)\"",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Stable and Cycle-6 IDs plus the no-MCP-landing decision are explicit",
      "verify": "TARGET=.spec/tasks/imp-mk6-functional-completeness-1786837297/MK6-DATA-001-data-plane-truth.md; for id in AC-1 AC-2 AC-3 AC-4 AC-5 AC-6 AC-7 AC-8 AC-9 $(printf 'TC-%s ' {1..55}); do rg -q '\"id\": \"'$id'\"' \"$TARGET\"; done && rg -q 'does \\*\\*not\\*\\* require the local-only MCP branch to land first' \"$TARGET\"",
      "maps_to_ac": "AC-4"
    }
  ]
}
-->
