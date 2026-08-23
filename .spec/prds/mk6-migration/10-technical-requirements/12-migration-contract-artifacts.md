---
stability: CONSTITUTION
last_validated: 2026-07-13
prd_version: 2.0.0
---

# Migration Contract Artifacts

These artifacts are Sprint-0 deliverables, not optional implementation notes. They must be complete and machine-readable before deep DATA, SVC, or SYNC migration work begins. An empty template is not completion.

## Convex source catalog

`12-convex-source-catalog.yaml` contains one approved entry for every legacy table, field, and storage reference. Each entry records source table/field, disposition (`preserve`, `merge`, `drop`, `regenerate`, or `archive`), target relation/fields, transform, FK rewrites, expected-count formula, exclusions, checksum or sample, owner, approval, and frozen fixture. It covers all 60 tables and every storage reference, including temporary/deleted-object disposition.

The catalog is the ETL authority: no source field, relation, or object may be silently dropped, and every intentional loss requires a versioned approval.

## Client data contract

`13-client-data-contract.yaml` maps every legacy Convex hook/action call site to its consuming route and one target: a published Zero query, a Zero mutator, or an authoritative Hono command. It records the published projection, response/error shape, ordering/cursor behavior, optimistic behavior, conflict/rejection behavior, offline policy, identifier compatibility, and linked E2E criterion.

CI compares the legacy import/call-site inventory with this artifact and rejects an unmapped surface. A legacy ID remains accepted at an exposed boundary only when the catalog explicitly declares its alias and expiry lifecycle.

## MCP compatibility manifest

`14-mcp-compatibility-manifest.yaml` pins MCP protocol **2025-11-25** and declares support for both existing stdio and Streamable HTTP entries. It records the stateless/no-server-sampling capability policy, authentication/cancellation policy, and all 49 tools. Per tool it records input/output JSON Schemas, defaults, error code/data, ordering/pagination, side effects, idempotency/replay, supported transports, and frozen success/error fixtures.

Generated contract tests compare registered tool IDs and behavior to the manifest on both transports. The Streamable HTTP implementation follows the pinned protocol, including origin validation and the documented API-key policy; stdio receives credentials from its environment.

## Asset inventory and reconciliation report

The source catalog emits a reconciliation report containing source count, expected target formula, approved merge/drop/regenerate exceptions, FK audit, checksums/samples, and unexplained variance. The report is green only with zero unexplained variance across every source table and retained object. The asset portion records legacy storage ID, owner/link, SHA-256, byte length, MIME type, content-addressed target, retention/disposition, and approved exception.
