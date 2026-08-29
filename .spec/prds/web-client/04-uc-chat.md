---
stability: FEATURE_SPEC
last_validated: 2026-08-28
prd_version: 1.0.0
functional_group: CHAT
---

# Use Cases: Agent Conversation (CHAT)

The agent surface: ceremony-free execution with inline collapsed tool lines, carried-over slash commands in a globally reachable palette, record-keyed cards that cannot duplicate, dispatched long research runs with honest progress and always-available cancel, and legible handling of an interrupted turn.

| ID | Title | UI-facing |
|---|---|---|
| `UC-CHAT-01` | Ask the agent and watch it execute without ceremony | yes |
| `UC-CHAT-02` | Issue slash commands from anywhere in the app | yes |
| `UC-CHAT-03` | Read a transcript that is a trustworthy record | yes |
| `UC-CHAT-04` | Dispatch a long research run and come back to it | yes |
| `UC-CHAT-05` | Lose a connection mid-answer without losing the record of it | yes |

---

## UC-CHAT-01: Ask the agent and watch it execute without ceremony

A question is sent and executed immediately against the archive and the web, with no plan, confirmation, or per-tool approval. Tool calls appear inline as single terse lines, expandable on demand, and the run is cancellable throughout.

**Personas:** `operator`

### Acceptance criteria

- ☐ **AC-1** — Operator can send a question and see the answer begin streaming without being asked to approve a plan, a tool, or a step.
- ☐ **AC-2** — Operator can see each tool call as exactly one collapsed line naming the tool and its result.
- ☐ **AC-3** — Operator can expand a tool line to inspect its input and output, and collapse it again.
- ☐ **AC-4** — Operator can see that a tool call failed from its collapsed line, without expanding it.
- ☐ **AC-5** — Operator can cancel an in-flight turn at any point and see the run stop.

---

## UC-CHAT-02: Issue slash commands from anywhere in the app

The carried-over command surface is one keystroke away from any screen, self-describing in a palette, and submits with its argument in a single pass - which is what keeps two destinations from being a loss of capability.

**Personas:** `operator`

### Acceptance criteria

- ☐ **AC-1** — Operator can press one keystroke from any screen and put the cursor in the prompt input.
- ☐ **AC-2** — Operator can type a slash and see /research, /deep-research, /search, /browse, /stats and /help listed with a description of each.
- ☐ **AC-3** — Operator can complete a command from the palette and submit it with its argument without leaving the keyboard.
- ☐ **AC-4** — Operator can run /help and read the full list of commands this client supports.

---

## UC-CHAT-03: Read a transcript that is a trustworthy record

Every record produced in a conversation has exactly one card, rendered from the record and keyed by its id, showing current state - so the transcript can be read back as memory instead of verified against the database.

**Personas:** `operator`

### Acceptance criteria

- ☐ **AC-1** — Operator can scroll a twenty-turn transcript and find exactly one card per record.
- ☐ **AC-2** — Operator can see a card reflect the record's current state after that record changes, without reloading the page.
- ☐ **AC-3** — Operator can reopen a past conversation and find the same cards in the same states he left.
- ☐ **AC-4** — System renders each card from the record it represents, keyed by record id, so one record cannot produce two cards.

---

## UC-CHAT-04: Dispatch a long research run and come back to it

A deep-research run is acknowledged immediately as a device job, survives navigation and tab close, reports progress from real run state so 'working' is distinguishable from 'wedged', stays cancellable, and hands off its finished document to the Library.

**Personas:** `operator`

### Acceptance criteria

- ☐ **AC-1** — Operator can start a deep-research run and get immediate acknowledgement that it was dispatched to the device.
- ☐ **AC-2** — Operator can navigate away, close the tab, or let the machine sleep, and find the run still progressing on return.
- ☐ **AC-3** — Operator can distinguish a running job from a stalled one, because the card's progress reflects reported run state rather than elapsed time.
- ☐ **AC-4** — Operator can cancel a running job from its card at any time and see it reach a cancelled state.
- ☐ **AC-5** — Operator can open the finished document from the card in one action and find that same document in the Library.

---

## UC-CHAT-05: Lose a connection mid-answer without losing the record of it

Because a turn cannot be resumed after a reload or a dropped connection, the interruption is stated rather than hidden: the transcript marks the turn as interrupted, shows what survived, and offers a one-action re-ask.

**Personas:** `operator`

### Acceptance criteria

- ☐ **AC-1** — Operator can reload during a streaming answer and find the interrupted turn explicitly marked as interrupted in the transcript.
- ☐ **AC-2** — Operator can tell that an interrupted turn did not complete, rather than reading a truncated answer as a finished one.
- ☐ **AC-3** — Operator can re-ask an interrupted turn from the transcript without retyping the question.
- ☐ **AC-4** — Operator can see from the transcript whether any record produced before the interruption survived.

---

_Templated from `product-manager.architecture.json` (`use_cases`). Acceptance criteria are reproduced verbatim._
