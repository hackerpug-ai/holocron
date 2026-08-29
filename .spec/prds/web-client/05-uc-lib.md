---
stability: FEATURE_SPEC
last_validated: 2026-08-28
prd_version: 1.0.0
functional_group: LIB
---

# Use Cases: Archive Library (LIB)

Retrieval and reading over the whole documents table: hybrid search from a remembered fragment, filter chips, the calm reading column with working figures, citations and heading anchors, and the single 'Ask about this' bridge from a selected passage into Chats.

| ID | Title | UI-facing |
|---|---|---|
| `UC-LIB-01` | Find a document from a remembered fragment | yes |
| `UC-LIB-02` | Narrow the archive with filters | yes |
| `UC-LIB-03` | Read a document in a calm reading column | yes |
| `UC-LIB-04` | Ask about the passage in front of him | yes |

---

## UC-LIB-01: Find a document from a remembered fragment

Hybrid search over the whole archive answers a half-remembered phrase with ranked results carrying recognisable snippets and document kind, so 'do I already have this?' is answerable before spending twenty minutes and real money.

**Personas:** `operator`

### Acceptance criteria

- ☐ **AC-1** — Operator can type a partial remembered phrase into Library search and see results ranked by both wording and meaning.
- ☐ **AC-2** — Operator can type an exact phrase verbatim and find the matching document on the first screen of results.
- ☐ **AC-3** — Operator can read a matching snippet on each result row, so a document whose title he has forgotten is still recognisable.
- ☐ **AC-4** — Operator can tell from a result row whether it is a research output, a transcript, or a digest.

---

## UC-LIB-02: Narrow the archive with filters

Filter chips over category, research type, status and share state cut a large result set down to the row the operator is looking for, and combine with a search query.

**Personas:** `operator`

### Acceptance criteria

- ☐ **AC-1** — Operator can narrow results with chips for category, research type, and status.
- ☐ **AC-2** — Operator can apply a shared or unshared chip and see only documents in that share state.
- ☐ **AC-3** — Operator can combine chips with a search query and see the result count update.
- ☐ **AC-4** — Operator can clear all filters in one action and return to the unfiltered archive.

---

## UC-LIB-03: Read a document in a calm reading column

The operator's document view is a high-contrast reading column at the same measure, type scale and figure treatment as the public page, with working images, preserved citations, and heading anchors - the desktop reading surface that does not exist today.

**Personas:** `operator`

### Acceptance criteria

- ☐ **AC-1** — Operator can read a four-thousand-word document in a high-contrast column with no chrome inside the measure.
- ☐ **AC-2** — Operator can see every image the document contains rendered as a figure at the same measure the public page uses.
- ☐ **AC-3** — Operator can follow a citation from a claim to its source from inside the document view.
- ☐ **AC-4** — Operator can jump to a section using a heading anchor and copy that anchor as a link.

---

## UC-LIB-04: Ask about the passage in front of him

Selecting a passage offers exactly one control, which carries the passage and its source document into Chats and returns the operator to his reading position. This is the Library's only AI affordance.

**Personas:** `operator`

### Acceptance criteria

- ☐ **AC-1** — Operator can select a passage in the reading column and see exactly one control offered on the selection.
- ☐ **AC-2** — Operator can choose 'Ask about this' and land in Chats with the passage quoted and its source document identified.
- ☐ **AC-3** — Operator can send a follow-up and read an answer that refers to the quoted passage and names the document it came from.
- ☐ **AC-4** — Operator can return to the document and land at the scroll position he left.
- ☐ **AC-5** — Operator can read an entire document without any AI control appearing until he selects text.

---

_Templated from `product-manager.architecture.json` (`use_cases`). Acceptance criteria are reproduced verbatim._
