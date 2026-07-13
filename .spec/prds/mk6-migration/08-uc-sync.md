---
stability: FEATURE_SPEC
last_validated: 2026-07-13
prd_version: 2.0.0
functional_group: SYNC
---

# Use Cases: Client Sync, Cutover & Decommission (SYNC)

| ID | Title | Description |
|----|-------|-------------|
| UC-SYNC-01 | Zero integration & app rewrite | Replace the ConvexProvider + ~105 Convex hook call-sites across ~47 files with Zero reactive hooks over Postgres. |
| UC-SYNC-02 | Reactive surfaces | Live chat (SSE + Zero-durable messages) and mission progress reflect at p95 within 5 seconds on a healthy tailnet — the UX the app had, on the new stack. |
| UC-SYNC-03 | Big-bang cutover | The ordered parallel-build → freeze → ETL → flip → verify sequence with real-service gates. |
| UC-SYNC-04 | Rollback plan | A coexistence window and defined point-of-no-return so a failed flip loses zero committed data. |
| UC-SYNC-05 | Convex decommission | Delete all Convex code, deps, dead clients, and the cloud deployment — nothing Convex survives. |

---

## UC-SYNC-01: Zero integration & app rewrite

The RN app swaps `ConvexProvider` for the Zero provider and migrates every Convex hook (`useQuery`/`useMutation`/`useAction` — ~105 call-sites across ~47 files) to Zero reactive hooks or authoritative Hono commands, with the share-URL builder in `app/document/[id].tsx` re-pointed to the new host. The client-data contract is the approved mapping for each call site, including offline, optimistic, conflict, error, and identifier behavior.

**Acceptance Criteria**
- ☐ User can open the app and see conversations, documents, feed, and research load from Postgres via Zero, with zero `convex/react` hooks remaining in `app/`, `components/`, `hooks/`, `screens/` (grep-verified).
- ☐ User can mutate data through the approved Zero mutator or Hono command and see it reactively reflected within the declared sync SLO, with no `useMutation` from `convex/react` on the path.
- ☐ System can cold-start the RN app with the Zero provider replacing `ConvexProvider` in `app/_layout.tsx` and boot without `EXPO_PUBLIC_CONVEX_URL` set.
- ☐ User can generate a share URL from `app/document/[id].tsx` pointing at the new Mastra `/article/` host with no `.convex.cloud`→`.convex.site` rewrite remaining.
- ☐ System can prove every discovered Convex hook/action has one approved client-data-contract mapping and that airplane-mode reads, queued writes, rejection rollback, duplicate replay, and concurrent-edit outcomes follow the declared contract.

---

## UC-SYNC-02: Reactive surfaces

The surfaces that depended on Convex reactivity — live chat and mission progress — work on the new stack: resumable token streaming over SSE plus durable message/progress rows that Zero pushes reactively, so cross-device liveness and reconnect survive within a declared, measurable sync SLO.

**Acceptance Criteria**
- ☐ User can watch a mission's progress update live on the app as the Mastra workflow advances, driven by Zero-synced Postgres rows.
- ☐ User can see chat responses stream token-by-token over resumable SSE, replay missed events without duplication, and reconcile exactly once to the durable Zero-synced message after completion.
- ☐ User can observe a change made on one surface (e.g. the MCP gateway updates a document) reflect on the app at p95 within 5 seconds on a healthy tailnet without a manual refresh.

---

## UC-SYNC-03: Big-bang cutover

The cutover runs as an ordered sequence — build the new stack in parallel without touching Convex; durably fence Convex writes and drain work; one-time `convex export`→ETL; flip the app + MCP to the new backend in a rollbackable read-only soak; pass real-service verification gates; enable writes at the data-plane point of no return; then decommission.

**Acceptance Criteria**
- ☐ Operator can stand up and validate the entire new stack (Postgres + Mastra + Zero + fleet) against a real integration suite while Convex still serves production untouched.
- ☐ Operator can durably fence Convex mutations/actions/uploads/webhooks, disable and drain all scheduled work, observe a declared quiet interval, capture an export watermark and final-write audit, run the one-time ETL, and produce a source-catalog reconciliation report with zero unexplained variance.
- ☐ System can serve the app + MCP entirely from the new backend in a read-only rollbackable soak, verified by an end-to-end pass across reads, MCP (all 44 tools), the `/article/` endpoint, and every migrated cron against real services while every production write path returns `migration_read_only`.
- ☐ Agent Client can invoke all 44 MCP tools post-flip and receive Postgres-backed results with `src/convex/client.ts` no longer importing `convex/browser`.

---

## UC-SYNC-04: Rollback plan

Because the cutover is big-bang, a rollback path exists only during the read-only soak: the Convex cloud deployment stays live, all post-flip production writes remain blocked, and the data plane can be re-pointed via config to the frozen Convex state. The first accepted Postgres production write ends Convex rollback eligibility; recovery then means restore from Postgres/blob backups.

**Acceptance Criteria**
- ☐ Operator can keep the Convex cloud deployment live and un-deleted through the read-only soak window, with a Convex-pointing app build pinned for fallback.
- ☐ Operator can prove representative app, MCP, upload, scheduled-job, and mission-commit writes are visibly blocked with `migration_read_only`, then re-point the data plane to Convex after a Sev-1 gate failure with zero accepted post-export production writes lost.
- ☐ Operator can identify the data-plane point of no return as the first accepted Postgres production write and confirm Convex deletion is a later source-destruction step permitted only after recovery evidence passes.

---

## UC-SYNC-05: Convex decommission

Once soak passes, everything Convex is removed: the `convex/` directory (all modules, `_generated/`, 11 backup files), the Convex + Cohere deps, the two dead Python/CLI clients, `ratatui-playground/`, all Convex env vars, and finally the Convex cloud deployment.

**Acceptance Criteria**
- ☐ Operator can run a `grep -ri convex` over `app/`, `components/`, `hooks/`, `screens/`, `lib/`, and `holocron-mcp/src/` and both `package.json` files and get zero hits.
- ☐ System can build the app and start the MCP server with the `convex`, `convex-helpers`, `@convex-dev/*`, `convex-test`, and `@ai-sdk/cohere` dependencies removed.
- ☐ Operator can confirm the dead Python (`python/`) and CLI (`cli/`) Convex clients are deleted and `ratatui-playground/` is archived out of the repo.
- ☐ Operator can delete the Convex cloud deployment as the final irreversible step only after a fresh isolated Postgres/blob restore drill verifies post-flip writes, FK integrity, blob hashes, and representative app/MCP journeys.
