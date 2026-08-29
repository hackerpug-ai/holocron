---
stability: PRODUCT_CONTEXT
last_validated: 2026-08-28
prd_version: 1.0.0
---

# Holocron Web Client

## Product description

A web client for **holocron**, a personal research knowledge system whose archive, agent and
tooling run on a single device on the owner's tailnet. The web client is served from
`docs.holocrnlib.com` and presents two faces from one codebase:

- an **operator cockpit** behind authentication with exactly two destinations — **Chats**, a
  ceremony-free conversation with an agent that executes tools from the device's MCP gateway, and
  **Library**, a searchable surface over every research document; and
- **public read-only pages** at `/d/<token>`, opened with no login and cached at the edge, which
  are the only way this system's work reaches anyone other than its owner.

## Problem statement

Three problems, in descending order of damage.

**1. Every shared document is silently text-only.** Verified by executing the current code: the
public renderer has no image rule, so `![Chart](url)` renders as a literal `!` followed by a link,
and document-relative asset paths collapse to `href="#"`. Separately, the public Worker routes only
`^/d/<token>$`, so the origin's working asset endpoint is unreachable from the public domain.
Together, charts, screenshots and diagrams are dropped from every shared document with no error
anywhere — and because the operator never sees the recipient's view, the failure has persisted
unnoticed. In research writing the figure is frequently the finding, so a document that drops its
charts keeps its claims and loses its evidence.

**2. The archive has no desktop surface.** The only graphical client is a phone-shaped React Native
app. Hybrid FTS + vector search exists on the device with nothing driving it from a browser, so the
question the operator asks dozens of times — *do I already have this, or do I spend twenty minutes
and real API money generating it?* — is more expensive to answer than to ignore.

**3. The agent surface is an approval ladder.** The current pipeline carries plan and per-tool
approval message types, so work the operator already requested is interrupted for permission. He
routes around it to a terminal coding agent talking to the same MCP surface. A related defect makes
the transcript untrustworthy as a record: a card is simultaneously a stored message row and a live
view of a record, and both render, so the same research result appears twice.

## Solution summary

One Next.js application on Cloudflare Workers, with a tRPC backend-for-frontend reaching the device
over the existing tunnel, an AI SDK agent loop that attaches to the device's MCP gateway as a
client, and BetterAuth guarding the operator surface.

The public reader is rebuilt as a Server Component with a real markdown pipeline, an asset route,
provenance and unfurl metadata — closing both verified defects and taking over the existing
`docs.holocrnlib.com` hostname without changing a single share URL already in circulation.

The agent answers and executes with no ceremony, rendering each tool call as one collapsed line.
One architectural rule makes the duplicate-card defect structurally impossible rather than patched:
**the stream carries invalidations, the query carries truth** — a card renders from its record,
keyed by id, and no stream frame may carry a record's contents.

One design rule keeps a crystalline visual identity from fighting a 4,000-word research document:
**identity lives in the chrome, calm lives in the column.**

## Highest-severity pain, as staged by both persona lenses

- **operator** — Everything he shares arrives silently text-only - figures are replaced by a stray '!' and a dead link, and nothing in his own interface reveals it
- **operator** — The chat transcript renders the same research card twice, so it cannot be trusted as a record of what ran
- **operator** — Hybrid search over the entire archive exists on the server with nothing driving it from a browser
- **operator** — No desktop surface for reading or browsing his own library
- **recipient** — Charts, screenshots and diagrams the argument depends on are absent from every shared document
- **recipient** — A visible '!' and a link that goes nowhere in mid-paragraph reads as a broken or unfinished document
- **stranger** — Landing with no title, date, or source and no way to judge whether the document is considered work or an unattributed dump
- **stranger** — Missing figures in a text-only research document read as machine-generated filler

---

_Templated from `product-manager.personas.json`, `frontend-designer.personas.json` and
`product-manager.architecture.json`. Defect claims were verified by executing the current code; see
`../../../docs/plans/webclient-design-brief.md` §4._
