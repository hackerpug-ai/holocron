# etl-4 — Authoritative Hono upload lifecycle: init/PUT/finalize, hash verification, idempotent attach, no orphan

> Status: Completed · Sprint: 14 · Agent: mastra-implementer · Proposed By: mastra-planner

## Outcome

Add the backend prerequisite for the authoritative Hono upload-init/PUT/finalize behavior for image and voice artifacts. Sprint 14 proves the real Hono API and storage transaction; Sprint 26 owns the full RN end-to-end T-DATA-021 flow. Init creates an idempotent upload intent, PUT streams bytes into a staged area, and finalize verifies SHA-256/length/MIME before one transaction promotes and attaches the content-addressed object.

## Acceptance Criteria

### AC-1 — validated init
`POST /api/uploads` requires declared metadata, owner/attachment target, idempotency key, and a valid digest/length contract; replay returns the same intent without duplicate rows.
**VERIFY:** real Hono/Postgres calls with same and conflicting idempotency keys.

### AC-2 — streamed PUT
`PUT /api/uploads/:id` streams bounded bytes to staging, rejects oversize/unknown upload IDs, and does not create an attachment before finalize.
**VERIFY:** real HTTP upload and interrupted/oversize controls.

### AC-3 — atomic finalize/no orphan
Finalize verifies bytes against declared hash/length/MIME, atomically promotes the digest object and attaches it exactly once; mismatch leaves no attached row or orphan object and replay returns stored result.
**VERIFY:** image and voice fixtures, mismatch, retry, and DB/object orphan audit.

## Test Criteria

- **TC-1 e2e:** image lifecycle succeeds and repeated finalize is idempotent.
- **TC-2 e2e:** voice lifecycle succeeds with correct MIME/length/hash.
- **TC-3 negative:** mismatch, expired intent, conflicting idempotency, and orphan failure paths fail closed.

## Guardrails

Do not trust client MIME/hash, expose staged paths, attach before verification, or return success before DB/object durability. Cleanup of rejected staging is bounded and observable.

<!-- REQUIREMENT-CONTRACT v1
{"requirements":[{"id":"AC-1","kind":"acceptance","tier":"e2e","description":"validated idempotent upload init","verification":"real Hono/Postgres calls"},{"id":"AC-2","kind":"acceptance","tier":"e2e","description":"bounded staged streaming PUT","verification":"real HTTP + negative controls"},{"id":"AC-3","kind":"acceptance","tier":"e2e","description":"atomic verified finalize/no orphan","verification":"image/voice retry and orphan audit"},{"id":"TC-1","kind":"test","tier":"e2e","description":"image lifecycle/idempotent finalize"},{"id":"TC-2","kind":"test","tier":"e2e","description":"voice lifecycle"},{"id":"TC-3","kind":"test","tier":"e2e","description":"mismatch/expiry/conflict failures"}]}
-->
