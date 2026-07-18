# etl-3 — Content-addressed BlobStore, retained objects, and Range reads

> Status: Planned · Sprint: 14 · Agent: mastra-implementer · Proposed By: mastra-planner

## Outcome

Implement the filesystem-backed `BlobStore` contract (`put/get/stream/url/delete`) and retained-object migration. Objects are addressed by SHA-256, atomically promoted, metadata is persisted, and Hono tailnet reads support byte-correct HTTP Range behavior.

## Acceptance Criteria

### AC-1 — content-addressed atomic storage
Putting bytes stores once at `<sha256>`, verifies byte length and digest, uses temp-file-plus-rename, and repeated puts are idempotent. Partial files never become visible.
**VERIFY:** real filesystem store, crash/partial negative control, duplicate put leaves one object.

### AC-2 — exhaustive retained asset parity
Every catalog-retained MP3/image/voice/file object, or explicitly approved exception, is represented in the manifest with source ID, SHA-256, length, MIME, disposition, and approval; `holo blob:verify` exits nonzero on any mismatch or missing object.
**VERIFY:** real fixture and one-byte/hash/MIME tamper controls.

### AC-3 — Range read correctness
Tailnet blob route returns 200 full bytes or 206 with correct `Content-Range`, `Accept-Ranges`, length, and exact slice; invalid ranges fail safely.
**VERIFY:** real HTTP requests against stored bytes and byte comparison.

## Test Criteria

- **TC-1 integration:** put/get/stream and repeated put have identical bytes and one physical object.
- **TC-2 integration:** the complete retained-object manifest hash/length/MIME is byte-comparable; a representative Range read is additionally checked.
- **TC-3 integration:** full and partial HTTP reads match expected bytes.

## Guardrails

No path derived directly from a user/storage ID, path traversal, overwrite of an existing digest, unverified copy, or public route without article/attachment authorization. MinIO remains an adapter seam, not a second storage truth.

<!-- REQUIREMENT-CONTRACT v1
{"requirements":[{"id":"AC-1","kind":"acceptance","tier":"integration","description":"atomic content-addressed store","verification":"real fs + duplicate/partial negative"},{"id":"AC-2","kind":"acceptance","tier":"integration","description":"retained asset parity","verification":"blob verify + tamper"},{"id":"AC-3","kind":"acceptance","tier":"integration","description":"byte-correct Range reads","verification":"real HTTP byte comparison"},{"id":"TC-1","kind":"test","tier":"integration","description":"put/get/idempotent physical object"},{"id":"TC-2","kind":"test","tier":"integration","description":"manifest parity"},{"id":"TC-3","kind":"test","tier":"integration","description":"full/range HTTP reads"}]}
-->
