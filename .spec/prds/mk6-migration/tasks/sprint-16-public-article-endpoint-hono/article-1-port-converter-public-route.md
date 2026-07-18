---
status: In Progress
sprint: 16
agent: mastra-implementer
---

# article-1 — Port converter and public Hono route

Implement `services/platform/src/http/article.ts` by preserving the Convex `markdownToHtml`, escaping, metadata, title-deduplication, and CSS output. Add `GET /article/:shareToken` to Hono with a real Postgres `share_token AND is_public` query and exact 404 HTML for misses. Keep middleware exemption limited to `/article/*`.

## Acceptance Criteria

- AC-1: renderer output matches the archived `convex-era.html` fixture.
- AC-2: public lookup is a parameterized Postgres query and never returns a non-public row.
- AC-3: missing/private/revoked rows return 404 and no key is required.
- AC-4: `holo article:compat` reports the legacy route shape.
