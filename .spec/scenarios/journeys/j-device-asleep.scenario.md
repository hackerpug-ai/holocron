---
service: holocron-web
feature: J-DEVICE-ASLEEP
covers_ucs: ["UC-SHELL-02", "UC-CHAT-05", "UC-CHAT-01", "UC-CHAT-03"]
priority: P1
type: happy_path
tier: visible
test_tier: e2e
persona: operator
---

# The machine sleeps and the connection drops, and the product says so instead of lying

The honest-failure arc, and the only journey whose value is entirely in what the product does when things go wrong. The runner really stops the origin Hono process - no mocked network layer - and the Library must name 'the device is not answering' rather than render an empty archive, while a legitimately empty filtered result on a healthy device must render the empty state and NOT the unreachable state. That contrast is the whole point of UC-SHELL-02 and neither half proves it alone. A chat turn against the stopped origin fails with a named reason, not a generic error, and Retry on the same screen succeeds once the process is back. Then a streaming turn is interrupted by a reload after the stream has demonstrably flushed at least twice, and the transcript marks it interrupted rather than presenting a truncated answer as finished; any record produced before the cut still exists as a row and still renders exactly once; and re-ask resends the original question byte-for-byte.

## Steps and assertions

1. **With the origin process stopped by the runner, load the Library**
   - asserts: toHaveCount(1) on [data-testid=device-unreachable]; toHaveCount(0) on [data-testid=empty-archive]; Postgres still holds the full seeded document count, so an empty archive would be a false statement

2. **Send a chat turn while the origin is still stopped**
   - asserts: The turn renders [data-testid=turn-error] with data-reason === 'device-unreachable' (exact string, not a generic error class); no partial answer presented as complete

3. **Restart the origin and press Retry from the same screen**
   - asserts: page.url() unchanged across the retry (no navigation); rendered Library row count equals the Postgres document count

4. **NEGATIVE CONTROL: apply a filter combination that legitimately matches zero rows on the healthy device**
   - asserts: toHaveCount(1) on [data-testid=empty-archive]; toHaveCount(0) on [data-testid=device-unreachable] - the two conditions are distinguishable in what is rendered

5. **Start a streaming turn against the fixtured model with its pinned inter-chunk delay, reading the tRPC stream through the request fixture**
   - asserts: >= 2 distinct chunk flushes separated in time (proves the answer is not buffered before the interruption is meaningful)

6. **Reload the page after the second flush**
   - asserts: The transcript renders that turn with data-state === 'interrupted', toHaveCount(1); the persisted message row's status in Postgres is the interrupted value, not a completed one

7. **Inspect what survived the cut**
   - asserts: Any record created before the interruption exists as a row AND renders as exactly one card keyed by its record id; records not created are absent from both

8. **Use the one-action re-ask from the transcript**
   - asserts: The last user message in the request body sent to the model fixture is byte-identical to the original question string; no typing events dispatched

9. **Cancel the re-asked turn while it is in flight**
   - asserts: The run record transitions to cancelled state in Postgres; the assertion is on the record, never on any sentence the model produced

## Lifecycle

**Turns green when.** UC-CHAT-05 lands. UC-SHELL-02 lands earlier with the shell, so this journey is half-green from the SHELL sprint onward and completes only when interrupted-turn marking exists.

**Expected red until.** The CHAT sprint. Additionally BLOCKED - not merely red - until the harness gains a runner affordance to stop and start the origin process mid-spec; without that, steps 1-4 cannot be written honestly and must not be faked with route interception.

## Note on `type: happy_path`

The subject of this journey is failure; its **outcome** is success. The arc stops the real origin
process, asserts the product names the condition instead of rendering an empty archive, restarts
the process, proves Retry recovers in place, and proves re-ask resends the original question
byte-for-byte. It terminates in a recovered, working state, so `happy_path` describes the arc
accurately. The failure content is carried by the assertions, and by the explicit
empty-vs-unreachable negative control at step 4 — which is the half that makes UC-SHELL-02
provable at all, since neither state alone distinguishes the two.
