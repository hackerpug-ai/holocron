---
status: Completed
sprint: 16
agent: mastra-implementer
---

# article-2 — Article-scoped asset capability route

Add the explicit `document_assets` relation migration and `GET /article/:shareToken/assets/:fileObjectId`. Join the relation to a public document and `file_objects`, resolve only the content-addressed BlobStore key, and return 404 for missing relation, private token, revoked publication, invalid hash, or missing blob. Never concatenate a request path into a filesystem path.

## Acceptance Criteria

- AC-1: linked retained blob returns bytes and persisted MIME.
- AC-2: unrelated file object, private document, and revoked public document return 404.
- AC-3: migration is idempotent and introduces no runtime DDL.
