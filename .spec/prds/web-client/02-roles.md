---
stability: PRODUCT_CONTEXT
last_validated: 2026-08-28
prd_version: 1.0.0
---

# Roles

Three roles, and the asymmetry between them is the central design constraint: exactly one person
ever authenticates, while the readers of the outward-facing surface have no relationship with the
product at all and never see the cockpit.

| Role | Persona ids | Authenticates | Description |
|---|---|---|---|
| **Operator** | `operator` · `p-operator` | Yes — the only identity that ever will | Owner and sole authenticated user. Builds and operates the system; reads code and logs. Keyboard-first, expects ⌘K, slash commands and terse factual tool output. Will not tolerate ceremony framed as safety. |
| **Recipient** | `recipient` · `p-recipient` | Never | A specific person the operator deliberately sent one document to, usually with a line of framing in Slack or mail. Competent professional reader, not necessarily technical, definitely busy, judging credibility as fast as content. |
| **Stranger** | `stranger` · `p-cold-reader` | Never | Second- or third-hop reader who received the link onward with no framing. Arrives on a phone, in daylight, with zero context and mild suspicion. **The highest-volume reader of any page in the product**, and the only organic distribution path it has. |
| **System** | — | n/a | The device platform, the edge, and the agent loop, where an acceptance criterion describes behaviour no human performs. |

## Why these three

### The Operator (`operator`)

**Role.** Owner and sole authenticated user of the holocron device and archive

**Context.** Runs a personal research system on a Mac on his own tailnet. Every document in the archive - research outputs, transcripts, digests - exists because he asked for it. He already talks to this system all day through Claude Code over the MCP gateway, so his reference for 'talking to an agent' is a terse local coding agent, not a consumer chatbot. Today his only graphical face on the archive is a React Native phone app; on a laptop he has no reading or browsing surface at all. Research runs are asynchronous device jobs that can take twenty minutes and spend real API money. He is the only person who will ever log in.

**Technical level.** expert - builds and operates the system; reads code and logs; will notice and resent any ceremony that slows him down

### The Named Recipient (`recipient`)

**Role.** A specific person the operator deliberately sent one research document to

**Context.** Receives a docs.holocrnlib.com/d/<token> URL in Slack, iMessage or email, usually with one sentence of framing like 'this is the part about pricing'. Never logs in and will never have an account. Opens it on whatever device is in hand - often a laptop in daylight, sometimes a phone on a train. Gives the page roughly thirty seconds to justify a ten-minute read. May come back to the same link a week later, after the operator has already unshared it. Has no idea what 'holocron' is and does not need to.

**Technical level.** moderate - a competent professional reader, not necessarily technical, and definitely not invested in the tool

### The Cold Stranger (`stranger`)

**Role.** Someone who received the link second-hand, or saw it posted, with no relationship to the operator

**Context.** Encounters the link preview before the page - an unfurl card in a chat app or timeline. Has no context for why the document exists, who wrote it, or whether it was written by a person or generated. Default posture is mild suspicion. Arrives frequently on a phone and sometimes on a poor connection. Will leave in under ten seconds if the page does not orient them. Represents the only channel by which the operator's work reaches anyone outside his direct contacts.

**Technical level.** unknown - assume low; assume mobile; assume zero prior context and zero patience

### The Operator (`p-operator`)

**Role.** Owner and sole authenticated user of holocron

**Context.** Senior engineer at a desk, 27"+ display, dark room, browser open all day beside an editor and a terminal. Runs holocron as a personal research organ: fires investigations at an AI agent, accumulates a private archive of long research documents, and pulls from it during real work. Today this is only reachable through a phone-shaped React Native app, so the archive is effectively unavailable at the moment it is needed. Lives in Claude Code and expects the same register from an agent: it answers and it executes.

**Technical level.** Expert. Wrote the backend. Keyboard-first, expects Cmd-K, slash commands, and terse factual tool output; reads raw JSON tool results without flinching; will not tolerate ceremony framed as safety.

### The Sent-To Peer (`p-recipient`)

**Role.** Colleague or collaborator who receives a share link directly from the operator, in context

**Context.** Gets `https://docs.holocrnlib.com/d/share-...` pasted into Slack or a DM, usually with one sentence of framing ('this is the write-up on X'). Opens it on a work laptop, mid-conversation, in a browser window that already has 30 tabs. Has roughly 30 seconds of attention to decide whether this is worth 10 minutes. Is probably technical, is definitely busy, and is judging the document's credibility as fast as its content.

**Technical level.** High. Comfortable in a browser, reads technical prose, will notice a missing image and will notice a slow page. Will not create an account for a single document.

### The Forwarded Stranger (`p-cold-reader`)

**Role.** Second- or third-hop reader with no relationship to the operator and no idea what holocron is

**Context.** The link was forwarded onward - pasted into a group chat, a newsletter, a reply. Opens it on a phone, outdoors or on a couch, in daylight, one-handed, with the OS in light mode. Arrives with zero context: does not know the author, does not know the site, does not know whether this is a personal note, a company report, or raw AI output. Is one confusing screen away from closing the tab forever. Some fraction of them arrive after the operator has already revoked the link.

**Technical level.** Mixed to low. May be non-technical. Judges credibility by presentation, not by architecture. Will never see the cockpit and must never be shown a sign-in prompt.

---

_Templated from the `user_personas` blocks of both staged persona proposals._
