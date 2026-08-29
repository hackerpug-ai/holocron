---
stability: FEATURE_SPEC
last_validated: 2026-08-28
prd_version: 1.0.0
scope_posture: full
---

# Scope

**Scope posture:** Full feature — a complete, polished initiative.

## In scope

- Public /d/<token> reader as a server-rendered, unauthenticated, edge-cached page with complete markdown rendering including remote and document-local figures
- Document-local asset delivery on the public domain at /d/<token>/assets/<id>, honouring the document's current public state
- Byte-for-byte compatibility with existing /d/<token> URLs and with the URL shape the MCP share tool promises
- Provenance header (what / who / when), OS colour-scheme respect with first-class light mode, and phone-legible measure on the public page
- OpenGraph and Twitter unfurl metadata with title, description and hero image
- Heading anchors and section deep-links on both the public page and the operator reading column
- Designed, cacheable withdrawn-document page for revoked links
- BetterAuth-gated operator shell with exactly two destinations, Chats and Library
- Explicit device-unreachable state on both operator destinations, with retry
- Agent conversation with zero approval ceremony, inline collapsed tool lines expandable to input and output, and always-available cancel
- Carried-over slash commands (/research, /deep-research, /search, /browse, /stats, /help) in a globally reachable command palette
- Record-keyed cards with exactly one visual instance per record
- Long research runs dispatched as device jobs with run-state-driven progress and cancel, surviving navigation and tab close
- Explicit interrupted-turn state with one-action re-ask
- Hybrid search over the documents table with category, research type, status and share-state filter chips
- Operator reading column matching the public page's measure, type scale and figure treatment, with citations preserved
- Single 'Ask about this' selection bridge from Library into Chats, with return to reading position
- Share lifecycle: publish, copy, self-check via the real public URL, row-level share state, shared filter, revoke with a stated bound
- Browser end-to-end test infrastructure provisioned for the web surface from scratch, as a prerequisite of every feature sprint (reality gate: web e2e is MISSING)

## Out of scope

- Feed and triage surfaces
- Collections or any multi-document share unit
- Shared chat threads or any shared surface other than one document behind one link
- Narration, text-to-speech, and the per-paragraph playback rig from the mobile reader
- Subscriptions management UI
- Toolbelt, improvements tracker, shop, assimilation UI
- Voice input and podcast transcription UI
- Multi-user accounts, invitations, roles, or any second authenticated identity
- Mid-turn resume or replay of an interrupted answer (the interruption is named, not recovered)
- Offline or locally cached Library while the device is asleep
- Comments, reactions, or any reader-side interaction on the public page
- Changes to the React Native app, its Zero sync schema, or the platform's mobile chat-run pipeline
- A separate operator-side preview mode distinct from opening the real public URL
- Plan, confirmation, or per-tool approval affordances of any kind in the agent surface

## Scope analysis

**One shippable PRD:** yes.

Five groups and twenty use cases sit inside PRD bounds, and they serve one coherent job: the archive gets a desktop face and its outward-facing surface stops silently lying about what it contains. Every group shares one codebase, one domain, one auth boundary and one design rule, so splitting them into separate PRDs would duplicate the shell, the design system and the share contract across documents. That said, this is a large PRD at the top of the range, and its size is real: it rewrites two operator surfaces, replaces the public reader, introduces auth and a BFF agent loop, and must provision browser e2e infrastructure that does not exist at all (reality gate: web surface MISSING). It is one PRD only if it is planned as ordered sprints with independent value at each gate, not as one delivery. The natural first gate is the Public Reader group on its own - it fixes both verified defects, is independently shippable, depends on no auth and no agent, and is the only work whose absence is actively damaging the operator's reputation today.

### Split candidates, if this proves too large

- READ (Public Reader, 6 UCs) as a standalone phase-one PRD or leading sprint - no dependency on auth, tRPC, or the agent loop, and it alone closes the highest-severity pain in both staged persona files
- Browser e2e provisioning as a leading INFRA sprint that every feature sprint depends on, per the reality gate (fail-closed) - it is a prerequisite, not a feature, and should not be scored against product acceptance criteria
- CHAT (Agent Conversation, 5 UCs) as a second PRD if the AI SDK loop, MCP attach, or Workers plan verification turns out to be slower than the Library work - SHELL, LIB and SHARE together already constitute a usable desktop archive without it
- SHELL + LIB + SHARE (9 UCs) as a single 'desktop archive' PRD if CHAT is deferred, since share lifecycle depends on Library rows and on the reader, but on nothing in the agent surface

---

_Templated from `product-manager.architecture.json` (`in_scope`, `out_of_scope`, `scope_analysis`)._
