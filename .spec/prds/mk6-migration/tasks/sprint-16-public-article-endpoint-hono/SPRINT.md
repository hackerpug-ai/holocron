---
status: Completed
sprint: 16
slug: public-article-endpoint-hono
---

# Sprint 16: Public `/article/` Endpoint on Hono

**Status:** Completed  
**Human gate:** real Hono + Postgres + filesystem asset capability; byte-comparable HTML and 404 revocation proof.

## Ordering

`article-3` RED coverage → `article-1` converter/public route → `article-2` capability assets → `article-4` independent review/gate.

## Scope

Port the Convex public article renderer verbatim into the Hono composition root. Public article lookup requires `share_token` and `is_public = true`; private, missing, and revoked documents return 404. Asset reads require an explicit `document_assets` relation, a public share token, the requested file-object ID, and a retained content-addressed blob. The legacy URL shape is reported by `holo article:compat`.

No authenticated key is accepted as a substitute for publication, no arbitrary file path is exposed, and no runtime DDL or markdown package behavior is introduced. The public routes remain the only unauthenticated application egress.

## Dependencies

Sprint 04 Postgres schema, Sprint 14 content-addressed `file_objects`/BlobStore. Blocks Sprint 24.

## Gate

1. Direct `curl /article/<realToken>` returns exact golden HTML and no Authorization header.
2. `holo article:compat <token> --json` returns `/article/<token>`.
3. Direct asset route returns the linked retained blob only for the public article relation.
4. Unshare makes both article and asset routes return 404.
5. Private and unknown tokens return 404.
