---
service: holocron-web
feature: J-MVP-FULL-ARC
covers_ucs: ["UC-SHELL-01", "UC-LIB-01", "UC-LIB-03", "UC-LIB-04", "UC-CHAT-01", "UC-SHARE-01", "UC-READ-01", "UC-SHARE-03", "UC-READ-05"]
priority: P0
type: happy_path
tier: visible
test_tier: e2e
persona: operator
---

# Sign in, find it, read it, ask about it, hand it over, see what they see, take it back

The whole product in one pass, driven entirely from the operator's chair. He signs in once against real BetterAuth and lands in Chats. He goes to the Library and types a fragment of a sentence he half-remembers from the seeded document that carries images - not its title - and the right row comes back. He opens it into the reading column and every figure renders. He selects a known passage, takes the single 'Ask about this' control into Chats, sends a follow-up with no approval step, and the agent executes real tools against real Postgres; he then returns to the document and lands where he left. He flips the document public, copies the canonical /d/<token> link, and opens the REAL public URL - and the count of rendered figures on the stranger's page equals the count in his own reading column, every one of them decoded. Then he unshares, reads the stated propagation bound, and the same URL is dead. This arc is the standing guard against the defect that shipped silently for a year: it is the only test in the suite where the operator's view and the recipient's view are compared to each other rather than each to itself. It deliberately does NOT re-prove the reference flow's byte-identical-body, Vary: Cookie or unknown-token assertions; it extends that flow by driving publish and revoke through the real operator UI instead of the publish endpoint.

## Steps and assertions

1. **Sign in through the real BetterAuth form (does NOT reuse the global-setup storageState; starts from an empty context)**
   - asserts: Sign-in response status 200; a row exists in the session table for the operator user id; page.url() ends /chats

2. **Reload the page, then navigate Chats -> Library -> Chats via persistent nav**
   - asserts: No redirect to sign-in on reload (page.url() unchanged, status 200); after the round trip the Chats composer's value is byte-identical to the string typed before leaving

3. **In Library search, type an exact multi-word fragment from the BODY (not the title) of the seeded image-bearing document**
   - asserts: A row with data-doc-id equal to the seeded document id is present within the first 5 rendered rows; that row's snippet contains the typed fragment as a substring; the row's data-doc-kind equals the documents.kind value in Postgres

4. **Open the document into the operator reading column**
   - asserts: Every img inside [data-testid=reading-column] reports naturalWidth > 0; figure count equals (document_assets rows for this doc) + (remote image count in the seeded markdown); count of elements carrying data-chrome inside the reading measure is 0

5. **Select a known seeded sentence in the reading column**
   - asserts: toHaveCount(1) on [data-testid=selection-action] - exactly one control, and zero AI controls existed on the page before the selection (count was 0 on load)

6. **Activate 'Ask about this', then send a follow-up with no approval interaction**
   - asserts: page.url() is the Chats route; the composer quote block's text equals the selected substring byte-for-byte and carries data-source-doc-id equal to the seeded document id; the request body sent to the model fixture contains both that substring and that document id; zero [data-testid=approval-prompt] or [data-testid=plan-message] ever mounted (MutationObserver counter, not a final snapshot)

7. **Let the turn run its fixtured tool call to completion**
   - asserts: A [data-testid=tool-row] with data-tool-state=output-available is rendered; the tool's real side effect is present (queried rows exist in Postgres and data-result-count equals the count from the same query run directly); no assertion on any sentence the model produced

8. **Navigate back to the document**
   - asserts: window.scrollY within 2px of the value recorded before leaving

9. **Toggle the document public from the Library row and copy the link**
   - asserts: documents.is_public true in Postgres; clipboard text equals https://{canonical_share_host}/d/{documents.share_token} exactly; that token is byte-identical to the token minted by seed:e2e

10. **Use the same control to open the REAL public URL in a new tab**
   - asserts: Public page status 200; every img naturalWidth > 0; the public figure count EQUALS the operator reading-column figure count from step 4 (equality between the two views is the assertion, not a hardcoded number)

11. **Unshare the document in one action from the Library row**
   - asserts: documents.is_public false in Postgres; [data-testid=revocation-bound] visible in the same interaction, text contains '60'; the row's data-share-state flips to unshared with no navigation (a window sentinel set before the toggle still exists)

12. **Re-request the same /d/<token> URL from a fresh empty-storageState context**
   - asserts: status === 404 (not 200-with-404-content); [data-testid=withdrawn] present; zero links or buttons matching /sign ?in/i; both cache headers present with exact expected strings

## Lifecycle

**Turns green when.** UC-LIB-04 and UC-CHAT-01 land together - the 'Ask about this' bridge is the last hinge, because it needs the reading column, the Library and a working agent turn simultaneously.

**Expected red until.** The final feature sprint. RED across every sprint before it: after READ it fails at sign-in, after SHELL+LIB at the passage bridge, after SHARE at the agent turn. A red J-MVP-FULL-ARC is the normal state of the suite until the last UC lands and is NOT a sprint failure - each sprint is gated on its own visible scenarios; this journey is the release gate.
