---
stability: FEATURE_SPEC
last_validated: 2026-08-28
prd_version: 1.0.0
---

# Functional Groups

| Group | Prefix | Description |
|---|---|---|
| Agent Conversation | `CHAT` | The agent surface: ceremony-free execution with inline collapsed tool lines, carried-over slash commands in a globally reachable palette, record-keyed cards that cannot duplicate, dispatched long research runs with honest progress and always-available cancel, and legible handling of an interrupted turn. |
| Archive Library | `LIB` | Retrieval and reading over the whole documents table: hybrid search from a remembered fragment, filter chips, the calm reading column with working figures, citations and heading anchors, and the single 'Ask about this' bridge from a selected passage into Chats. |
| Public Reader | `READ` | The unauthenticated /d/<token> surface: complete document rendering with figures, document-local asset delivery, provenance header, colour-scheme-respecting and phone-legible typography, link unfurl metadata, heading anchors, the withdrawn-document page, and byte-for-byte URL compatibility with every link already in circulation. |
| Share Lifecycle | `SHARE` | Publishing one document as one link, self-checking the recipient's actual page before sending, scanning share state across the Library, and revoking with a stated and observable time bound. |
| Operator Shell | `SHELL` | Authenticated access to the two operator destinations, persistent navigation between Chats and Library, and honest system-state surfaces when the device backing the archive is unreachable. |

## Use case summary

| Group | Prefix | Use cases | Acceptance criteria |
|---|---|---|---|
| Agent Conversation | `CHAT` | 5 | 22 |
| Archive Library | `LIB` | 4 | 17 |
| Public Reader | `READ` | 6 | 26 |
| Share Lifecycle | `SHARE` | 3 | 14 |
| Operator Shell | `SHELL` | 2 | 9 |
| **Total** | | **20** | **88** |

## Why this grouping

### Agent Conversation (`CHAT`)

Everything here is governed by one product rule - the agent answers and executes, and its transcript is a trustworthy record - and by one architectural rule, that the stream carries invalidations while the query carries truth.

### Archive Library (`LIB`)

These use cases serve one decision loop - find it, judge it, read it, pull on it - and they share one design constraint, that the reading column stays calm and carries exactly one AI affordance.

### Public Reader (`READ`)

This is the only surface the product shows to anyone other than its owner, it carries the two verified defects that make every shared document silently text-only, and it is the one group with no dependency on auth, tRPC, or the agent loop - so it is both the highest-severity work and the most independently shippable.

### Share Lifecycle (`SHARE`)

Sharing is a lifecycle with its own trust contract - publish, verify, audit, revoke - that spans the Library rows and the public reader without belonging to either, and it is the operator-side half of the defect that the READ group fixes on the reader side.

### Operator Shell (`SHELL`)

Auth and the destination frame are shared prerequisites of both operator surfaces and belong to neither; device-unreachability is a cross-destination state that must be designed once rather than invented twice.

---

_Templated from `product-manager.architecture.json` (`functional_groups`)._
