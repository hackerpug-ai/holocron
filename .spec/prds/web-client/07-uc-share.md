---
stability: FEATURE_SPEC
last_validated: 2026-08-28
prd_version: 1.0.0
functional_group: SHARE
---

# Use Cases: Share Lifecycle (SHARE)

Publishing one document as one link, self-checking the recipient's actual page before sending, scanning share state across the Library, and revoking with a stated and observable time bound.

| ID | Title | UI-facing |
|---|---|---|
| `UC-SHARE-01` | Publish one document and hand over one link | yes |
| `UC-SHARE-02` | See what is public at a glance | yes |
| `UC-SHARE-03` | Take a share back and know it is dead | yes |

---

## UC-SHARE-01: Publish one document and hand over one link

A document is toggled public, its canonical link is copied in one action, and the same control opens the real public URL so the operator sees the recipient's exact page - figures included - before sending it. One document, one link.

**Personas:** `operator`, `recipient`

### Acceptance criteria

- ☐ **AC-1** — Operator can toggle a document public from the Library and receive its docs.holocrnlib.com/d/<token> URL in the same view.
- ☐ **AC-2** — Operator can copy the link in one action and see confirmation that the copy succeeded.
- ☐ **AC-3** — Operator can open the real public URL from that same control in a new tab and see exactly the page a stranger gets.
- ☐ **AC-4** — Operator can confirm from that opened page that every figure in the document renders before he sends the link.
- ☐ **AC-5** — System issues one link per document and offers no way to share a collection or a conversation.

---

## UC-SHARE-02: See what is public at a glance

Share state is a persistent visual state on every Library row and a filter of its own, so 'what is currently public under my name' is answerable by scanning rather than by querying the database.

**Personas:** `operator`

### Acceptance criteria

- ☐ **AC-1** — Operator can see the share state of every document on its Library row without opening it.
- ☐ **AC-2** — Operator can filter the Library to everything currently public and read the complete list in one view.
- ☐ **AC-3** — Operator can see a row's share state change immediately after toggling it, without reloading.
- ☐ **AC-4** — Operator can tell from a row that a document is already public before sharing it again.

---

## UC-SHARE-03: Take a share back and know it is dead

Unsharing is one action, states its propagation bound at the moment it happens, and is verifiable by opening the public URL - because a revocation with an unknown time bound is not a revocation.

**Personas:** `operator`, `recipient`

### Acceptance criteria

- ☐ **AC-1** — Operator can unshare a document in one action from its Library row.
- ☐ **AC-2** — Operator can read the stated time bound within which the public link stops resolving, at the moment he unshares.
- ☐ **AC-3** — Operator can open the public URL after unsharing and see the withdrawn page within the stated sixty-second bound.
- ☐ **AC-4** — Recipient can open a previously working link after revocation and get the withdrawn page rather than the document.
- ☐ **AC-5** — Operator can re-share a previously withdrawn document and see it resolve again from the Library row.

---

_Templated from `product-manager.architecture.json` (`use_cases`). Acceptance criteria are reproduced verbatim._
