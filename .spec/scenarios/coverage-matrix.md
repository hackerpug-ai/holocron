# Coverage Matrix — UC × Journey × Tier

**Holocron Web Client** · PRD v1.0.0 · 2026-08-28

20 use cases · 5 cross-UC journeys ·
41 visible + 92 holdout scenarios ·
**0 silent gaps**

Every use case is covered by at least one journey AND carries its own per-UC scenarios in both
tiers. No use case is journey-free.

| Use case | Title | Visible | Holdout | Journeys |
|---|---|---|---|---|
| `UC-READ-01` | Render a shared document completely, figures included | 3 | 4 | `J-MVP-FULL-ARC` · `J-COLD-FORWARD` |
| `UC-READ-02` | Orient a cold reader within the first screen | 2 | 4 | `J-COLD-FORWARD` |
| `UC-READ-03` | Preview a shared link before it is opened | 2 | 4 | `J-COLD-FORWARD` |
| `UC-READ-04` | Navigate and cite a long document by section | 2 | 5 | `J-COLD-FORWARD` |
| `UC-READ-05` | Explain a withdrawn document calmly | 2 | 4 | `J-MVP-FULL-ARC` · `J-COLD-FORWARD` · `J-AUDIT-AND-REVOKE` |
| `UC-READ-06` | Preserve every share link already in circulation | 2 | 4 | `J-COLD-FORWARD` |
| `UC-SHELL-01` | Sign in once and reach both destinations | 2 | 5 | `J-MVP-FULL-ARC` · `J-DISPATCH-AND-LAND` |
| `UC-SHELL-02` | Show an honest state when the device is unreachable | 2 | 4 | `J-DEVICE-ASLEEP` |
| `UC-CHAT-01` | Ask the agent and watch it execute without ceremony | 2 | 5 | `J-MVP-FULL-ARC` · `J-DEVICE-ASLEEP` |
| `UC-CHAT-02` | Issue slash commands from anywhere in the app | 2 | 5 | `J-DISPATCH-AND-LAND` |
| `UC-CHAT-03` | Read a transcript that is a trustworthy record | 2 | 5 | `J-DISPATCH-AND-LAND` · `J-DEVICE-ASLEEP` |
| `UC-CHAT-04` | Dispatch a long research run and come back to it | 2 | 5 | `J-DISPATCH-AND-LAND` |
| `UC-CHAT-05` | Lose a connection mid-answer without losing the record o | 2 | 5 | `J-DEVICE-ASLEEP` |
| `UC-LIB-01` | Find a document from a remembered fragment | 2 | 4 | `J-MVP-FULL-ARC` · `J-DISPATCH-AND-LAND` |
| `UC-LIB-02` | Narrow the archive with filters | 2 | 5 | `J-AUDIT-AND-REVOKE` |
| `UC-LIB-03` | Read a document in a calm reading column | 2 | 5 | `J-MVP-FULL-ARC` · `J-DISPATCH-AND-LAND` |
| `UC-LIB-04` | Ask about the passage in front of him | 2 | 5 | `J-MVP-FULL-ARC` |
| `UC-SHARE-01` | Publish one document and hand over one link | 2 | 5 | `J-MVP-FULL-ARC` |
| `UC-SHARE-02` | See what is public at a glance | 2 | 4 | `J-AUDIT-AND-REVOKE` |
| `UC-SHARE-03` | Take a share back and know it is dead | 2 | 5 | `J-MVP-FULL-ARC` · `J-AUDIT-AND-REVOKE` |
| **Total** | | **41** | **92** | |

## Journeys

| ID | Title | Priority | UCs crossed | Turns green when |
|---|---|---|---|---|
| `J-MVP-FULL-ARC` | Sign in, find it, read it, ask about it, hand it over, see what they s | P0 | 9 | UC-LIB-04 and UC-CHAT-01 land together - the 'Ask about this' bridge is the last hinge, because it needs the reading col |
| `J-COLD-FORWARD` | A forwarded link meets the reader before the document does, and dies c | P0 | 6 | UC-READ-03 and UC-READ-04 land - unfurl metadata and heading anchors are the last two pieces; UC-READ-01/02/05/06 land e |
| `J-DISPATCH-AND-LAND` | A command becomes a device job, survives the tab, and lands in the arc | P1 | 6 | UC-CHAT-04 lands. It needs UC-CHAT-02 (palette) and UC-CHAT-03 (record-keyed cards) in place, and is the last of the thr |
| `J-DEVICE-ASLEEP` | The machine sleeps and the connection drops, and the product says so i | P1 | 4 | UC-CHAT-05 lands. UC-SHELL-02 lands earlier with the shell, so this journey is half-green from the SHELL sprint onward a |
| `J-AUDIT-AND-REVOKE` | Enumerate everything public under my name, pull one back, and put it b | P0 | 4 | UC-SHARE-03 lands. It needs UC-SHARE-02 (row state + shared filter) and UC-LIB-02 (chips) first; those are earlier legs  |

## Gap report

No *silent* uncovered use cases. The gaps below are named, and three are blocking.

1. BLOCKING, inherited from the constitution's landmine ledger: seed:e2e mints ZERO document_assets, ZERO file_objects, ZERO blobs and no image markdown. Until that lands, J-MVP-FULL-ARC steps 4/10 and J-COLD-FORWARD step 6 cannot assert naturalWidth > 0 on a document-local figure at all - the two journeys that exist to prove the headline defect are UNWRITABLE, not merely red.

2. J-DEVICE-ASLEEP needs a runner affordance to really stop and restart the origin Hono process mid-spec. Route interception would fake the device-unreachable condition at the wrong layer and prove nothing; if the affordance is not built, the journey must stay explicitly blocked rather than be written against a mocked network.

3. J-DISPATCH-AND-LAND cannot fit a genuine twenty-minute deep-research run inside the 5-minute blocking budget. It requires a real device job that terminates in seconds against the fixtured model - a short-run path, NOT a stubbed job. If no such path exists, this journey moves to a non-blocking lane and the blocking lane loses its only proof that a run survives with no browser attached.

4. The copy assertion compares clipboard text to https://{canonical_share_host}/d/<token> while the local lane serves from localhost. The canonical share host must be a configuration value the test can read, otherwise the assertion either hardcodes production or degrades to 'a URL was copied'.

5. Clipboard read is Chromium-only in practice; the heading-anchor copy step in J-COLD-FORWARD runs in Chromium while the rest runs in WebKit at iPhone viewport. The journey spans two contexts and the anchor URL must be handed between them explicitly.

6. The 60-second revocation SLA is asserted by NO journey. Per the landmine ledger it lives in the nightly tunnel lane; the journeys assert only that the bound is STATED to the operator and that revocation is immediate with no CDN in front. If nobody staffs the tunnel lane, the product's central trust promise has no executable proof anywhere.

7. UC-READ-06's fourth criterion - retiring the previous standalone reader with no circulating link changing address - is a deploy-time cutover check, not a browser assertion. J-COLD-FORWARD proves the URL contract against the new reader only; the cutover needs an ops gate outside this suite.

8. Cancel is asserted as a record-state transition. No journey proves the device actually stopped spending API money, which is the operator's real concern. Recorded honestly rather than papered over with a state-only assertion presented as proof of stopped spend.

9. No journey asserts answer quality anywhere, by design. Prose is banned from this lane; if nobody owns the eval lane, the product ships with zero measurement of whether the agent's answers are any good.

## Open questions

- Which of the 17 seeded documents carries the image assets, and does the same commit add a document_assets count assertion to seed-e2e.test.ts? Every figure-parity assertion in J-MVP-FULL-ARC and J-COLD-FORWARD names that document.
- Does re-sharing a previously withdrawn document PRESERVE the original share_token, or mint a new one? J-AUDIT-AND-REVOKE asserts byte-identical preservation because a new token silently kills every circulating link - but this is a product decision that has not been made, and the assertion is only correct if the answer is 'preserve'.
- Is the interrupted-turn state persisted server-side as a message-row status, or marked only in the client? J-DEVICE-ASLEEP asserts a Postgres row; if the marking is client-only, that assertion must be rewritten and the transcript stops being a trustworthy record across devices.
- Does /research (the fast path) belong to UC-CHAT-01 or UC-CHAT-04? J-DISPATCH-AND-LAND only exercises /deep-research; if /research is also a device job, a fast-run leg belongs in this journey and currently is in none.
- What exact string does the provenance header use as publisher? J-COLD-FORWARD asserts the date against a seeded timestamp but cannot assert publisher identity until that open question is settled.
- Can the model fixture's request-matching handle the ask-about-passage payload (quoted passage plus source document id)? J-MVP-FULL-ARC asserts on the outgoing request body rather than the reply, which is safe - but the fixture still has to MATCH that request to return anything.
- Should J-COLD-FORWARD's unfurl leg live here or move into the reference flow? Putting it here keeps the reference flow lean and keeps the first render of every shared document covered, but unfurl coverage then arrives with this journey rather than with the reference gate.

---

_From `product-manager.journeys.json` and `product-manager.test-suite.json`._
