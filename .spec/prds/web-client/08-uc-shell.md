---
stability: FEATURE_SPEC
last_validated: 2026-08-28
prd_version: 1.0.0
functional_group: SHELL
---

# Use Cases: Operator Shell (SHELL)

Authenticated access to the two operator destinations, persistent navigation between Chats and Library, and honest system-state surfaces when the device backing the archive is unreachable.

| ID | Title | UI-facing |
|---|---|---|
| `UC-SHELL-01` | Sign in once and reach both destinations | yes |
| `UC-SHELL-02` | Show an honest state when the device is unreachable | yes |

---

## UC-SHELL-01: Sign in once and reach both destinations

The operator authenticates once and moves freely between Chats and Library, while the public reader stays entirely outside the session boundary.

**Personas:** `operator`, `stranger`

### Acceptance criteria

- ☐ **AC-1** — Operator can sign in and land in Chats without re-authenticating on subsequent navigation.
- ☐ **AC-2** — Operator can move between Chats and Library from persistent navigation without losing the state of the destination he left.
- ☐ **AC-3** — Operator can reload any authenticated page and remain signed in.
- ☐ **AC-4** — System sends an unauthenticated request for Chats or Library to sign-in, and never applies that redirect to a public document URL.
- ☐ **AC-5** — Stranger can open a shared document while no operator session exists, because the public reader carries no session requirement.

---

## UC-SHELL-02: Show an honest state when the device is unreachable

When the machine holding the archive is asleep or unreachable, both operator destinations name that condition explicitly instead of presenting an empty list or a generic error, and offer a retry.

**Personas:** `operator`

### Acceptance criteria

- ☐ **AC-1** — Operator can tell from the Library that the device is not answering, because the surface names that condition rather than showing an empty archive.
- ☐ **AC-2** — Operator can tell from Chats that a turn failed because the device is unreachable, rather than reading an undifferentiated error.
- ☐ **AC-3** — Operator can retry the failed request from the same screen once the device is awake, without navigating away.
- ☐ **AC-4** — System distinguishes a device-unreachable failure from a genuinely empty result set in what it renders.

---

_Templated from `product-manager.architecture.json` (`use_cases`). Acceptance criteria are reproduced verbatim._
