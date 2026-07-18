---
status: Completed
sprint: 16
agent: red-test-generator
---

# article-3 — RED public article byte-compare and security tests

## Acceptance Criteria

- AC-1: Against real `holocron_nonprod`, a public document returns the archived Convex-era HTML byte-for-byte and `Content-Type: text/html`.
- AC-2: private, unknown, and unshared tokens return 404 without an auth key.
- AC-3: a linked file object is readable only through the article-scoped route; private/revoked token reads return 404.
- AC-4: test data uses real Postgres, real BlobStore filesystem bytes, and a real Hono subprocess; no mocks or wholesale-suite substitution.

## Test Criteria

`tests/integration/service/sprint16-public-article.test.ts` passes 3/3 with `PLATFORM_IT=1`.
