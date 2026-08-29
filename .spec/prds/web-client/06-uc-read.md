---
stability: FEATURE_SPEC
last_validated: 2026-08-28
prd_version: 1.0.0
functional_group: READ
---

# Use Cases: Public Reader (READ)

The unauthenticated /d/<token> surface: complete document rendering with figures, document-local asset delivery, provenance header, colour-scheme-respecting and phone-legible typography, link unfurl metadata, heading anchors, the withdrawn-document page, and byte-for-byte URL compatibility with every link already in circulation.

| ID | Title | UI-facing |
|---|---|---|
| `UC-READ-01` | Render a shared document completely, figures included | yes |
| `UC-READ-02` | Orient a cold reader within the first screen | yes |
| `UC-READ-03` | Preview a shared link before it is opened | yes |
| `UC-READ-04` | Navigate and cite a long document by section | yes |
| `UC-READ-05` | Explain a withdrawn document calmly | yes |
| `UC-READ-06` | Preserve every share link already in circulation | no |

---

## UC-READ-01: Render a shared document completely, figures included

A shared document renders on the public page with every figure the author embedded - remote images and document-local assets alike - served through the public domain and constrained to the reading measure, with dense charts enlargeable. This closes the two verified defects that made every shared document silently text-only.

**Personas:** `recipient`, `stranger`, `operator`

### Acceptance criteria

- ☐ **AC-1** — Recipient can see every remote image the author embedded rendered as a figure in place on the shared document page.
- ☐ **AC-2** — Recipient can see every document-local image rendered as a figure, with no literal '!' character and no dead link anywhere in the body.
- ☐ **AC-3** — Stranger can tap or click a dense chart on a phone to enlarge it beyond the reading measure and dismiss it again.
- ☐ **AC-4** — System serves document-local image requests at /d/<token>/assets/<id> only while that document is currently shared, and refuses them once it is not.
- ☐ **AC-5** — Operator can open the public URL for a document he authored with images and count the same figures there that he sees in his own reading column.

---

## UC-READ-02: Orient a cold reader within the first screen

A stranger arriving with no context gets provenance and legibility before anything else: a slim header stating what the document is, who published it and when, body text as the first paint, the reader's own colour scheme, and a comfortable measure on a phone.

**Personas:** `stranger`, `recipient`

### Acceptance criteria

- ☐ **AC-1** — Stranger can read the document title, the publisher identity, and the publication date without scrolling the page.
- ☐ **AC-2** — Stranger can open the link on a phone set to light mode and get a light page, because the page follows the operating system colour scheme instead of forcing dark.
- ☐ **AC-3** — Stranger can read the body at phone width without pinch-zooming or scrolling horizontally.
- ☐ **AC-4** — Stranger can reach the document without encountering a sign-in prompt, cookie banner, install interstitial, or any modal.
- ☐ **AC-5** — System paints document text as the first content on the public page, with no spinner or skeleton state.

---

## UC-READ-03: Preview a shared link before it is opened

Pasting a share link into a chat client or mail client produces a rich unfurl card carrying title, an opening-line description, and a hero image drawn from the document - the first render of every shared document and, for forwarded readers, often the only one.

**Personas:** `stranger`, `recipient`, `operator`

### Acceptance criteria

- ☐ **AC-1** — Recipient can see the document title, a description drawn from its opening, and a hero image on the unfurl card when the link is pasted into Slack, iMessage, or email.
- ☐ **AC-2** — Stranger can tell a research write-up apart from an arbitrary URL paste by reading the unfurl card alone.
- ☐ **AC-3** — System emits OpenGraph and Twitter card metadata on every response for a currently shared document.
- ☐ **AC-4** — Operator can paste a link into a chat client and see the same unfurl card the recipient will see, without hand-authoring any metadata.

---

## UC-READ-04: Navigate and cite a long document by section

A four-thousand-word document is skimmable and addressable: headings carry copyable anchors, structure and length are visible before committing to read, reading progress is signalled on mobile, and the sources behind a claim are reachable.

**Personas:** `recipient`, `stranger`

### Acceptance criteria

- ☐ **AC-1** — Recipient can copy a link to a specific heading and paste it so that a third person lands on that section.
- ☐ **AC-2** — Recipient can skim the heading structure and judge the document's length before starting to read.
- ☐ **AC-3** — Stranger can see how far through the document they are while scrolling on a phone.
- ☐ **AC-4** — Recipient can follow a citation from a claim to its source from within the shared document.

---

## UC-READ-05: Explain a withdrawn document calmly

A link whose document has been unshared resolves to a designed state in the same visual language, stating that the document is no longer shared, offering no sign-in, and cacheable so a widely forwarded dead link never reaches the device.

**Personas:** `recipient`, `stranger`

### Acceptance criteria

- ☐ **AC-1** — Recipient can open an unshared link and read a calm page stating the document is no longer shared, instead of a raw error, a stack trace, or a blank page.
- ☐ **AC-2** — Recipient can tell from that page that the author withdrew the document deliberately, rather than that the link is broken.
- ☐ **AC-3** — Stranger can read the withdrawn page without being offered a sign-in as a route to the content.
- ☐ **AC-4** — System serves the withdrawn response with the same edge-cache behaviour as a live document, so repeated visits to a dead link do not reach the device.

---

## UC-READ-06: Preserve every share link already in circulation

The rewritten reader takes over the existing public hostname without changing the URL contract: links already sent keep resolving, and newly minted links keep the shape the MCP share tool promises to every agent session.

**Personas:** `recipient`, `operator`, `stranger`

### Acceptance criteria

- ☐ **AC-1** — Recipient can open a /d/<token> link received before the rewrite and get the same document at the same address.
- ☐ **AC-2** — Operator can mint a new share link and receive a URL of the documented https://docs.holocrnlib.com/d/<token> shape.
- ☐ **AC-3** — System returns the shared document for a valid token and the withdrawn page for a revoked one, with no other outcome on that path.
- ☐ **AC-4** — Operator can retire the previous standalone reader and confirm no circulating link changed address as a result.

---

_Templated from `product-manager.architecture.json` (`use_cases`). Acceptance criteria are reproduced verbatim._
