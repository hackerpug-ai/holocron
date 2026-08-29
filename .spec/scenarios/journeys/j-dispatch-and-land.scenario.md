---
service: holocron-web
feature: J-DISPATCH-AND-LAND
covers_ucs: ["UC-CHAT-02", "UC-CHAT-04", "UC-CHAT-03", "UC-LIB-01", "UC-LIB-03", "UC-SHELL-01"]
priority: P1
type: happy_path
tier: visible
test_tier: e2e
persona: operator
---

# A command becomes a device job, survives the tab, and lands in the archive as a document

The chat-to-archive loop end to end. From the Library - not from Chats - one keystroke puts the cursor in the prompt input; a slash lists all six carried-over commands with descriptions; /deep-research submits from the keyboard alone with no approval step. The run is acknowledged as a device job with a row in Postgres, and the transcript shows exactly one card for that record. The operator navigates away, then closes every browser context entirely for ten seconds; the run advances in the database while nothing is watching. On return the card's rendered state equals the row's state without a reload. A second dispatched run is cancelled from its card and reaches cancelled state in the record. The first run finishes, produces a documents row, and the card opens it - and searching the Library for that exact title returns it as the first result, closing the loop between the conversation and the archive.

## Steps and assertions

1. **From the Library route, press the palette keystroke**
   - asserts: document.activeElement matches [data-testid=prompt-input]; page.url() still the Library route (no navigation was required to reach the input)

2. **Type '/' and read the palette**
   - asserts: The listbox contains exactly 6 options; data-command values are exactly {research, deep-research, search, browse, stats, help}; every option's description has non-empty text

3. **Complete /deep-research from the palette and submit with keyboard only**
   - asserts: Within 2s a research_sessions row exists with the returned run id and a non-terminal status; zero pointer events dispatched during the interaction; zero approval-prompt elements ever mounted

4. **Look at the transcript**
   - asserts: toHaveCount(1) on [data-testid=research-card][data-record-id='<run id>'] - the duplicate-card regression assertion, prose-free

5. **Navigate Chats -> Library -> Chats, then close every browser context for 10 seconds and reopen**
   - asserts: The research_sessions progress field is strictly greater after the closed window than before closing (the run advanced with no browser attached); after reopening, still toHaveCount(1) on the card

6. **Sample the card's rendered state against the record twice, 3 seconds apart, without reloading**
   - asserts: At each sample the card's data-state and data-progress equal the row's status and progress read directly from Postgres at that moment (progress derived from reported run state, not elapsed time)

7. **Dispatch a second run and cancel it from its card**
   - asserts: Within 5s the second row's status === 'cancelled' and the card's data-state === 'cancelled'

8. **Let the first run complete**
   - asserts: A documents row exists whose research_session_id equals the run id; the card's data-state === 'completed'

9. **Open the finished document from the card in one action**
   - asserts: page.url() ends with that document id; reading-column present; count of data-chrome elements inside the measure is 0

10. **Search the Library for that document's exact title**
   - asserts: The first rendered result row's data-doc-id equals the document id produced by the run

## Lifecycle

**Turns green when.** UC-CHAT-04 lands. It needs UC-CHAT-02 (palette) and UC-CHAT-03 (record-keyed cards) in place, and is the last of the three deliverable because it requires the device-job dispatch path.

**Expected red until.** The CHAT sprint. RED through READ, SHELL, LIB and SHARE - it fails at the palette keystroke until UC-CHAT-02 exists. Its Library legs go green earlier but the journey as a whole cannot, and that is expected.
