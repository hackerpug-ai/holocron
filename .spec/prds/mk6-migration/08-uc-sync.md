---
stability: FEATURE_SPEC
last_validated: 2026-07-13
prd_version: 1.0.0
functional_group: SYNC
---

# Use Cases: Client Sync, Cutover & Decommission (SYNC)

| ID | Title | Description |
|----|-------|-------------|
| UC-SYNC-01 | Zero integration & app rewrite | Replace the ConvexProvider + ~105 Convex hook call-sites across ~47 files with Zero reactive hooks over Postgres. |
| UC-SYNC-02 | Reactive surfaces | Live chat (SSE + Zero-durable messages) and mission progress reflect within a sync tick — the UX the app had, on the new stack. |
| UC-SYNC-03 | Big-bang cutover | The ordered parallel-build → freeze → ETL → flip → verify sequence with real-service gates. |
| UC-SYNC-04 | Rollback plan | A coexistence window and defined point-of-no-return so a failed flip loses zero committed data. |
| UC-SYNC-05 | Convex decommission | Delete all Convex code, deps, dead clients, and the cloud deployment — nothing Convex survives. |

---

## UC-SYNC-01: Zero integration & app rewrite

The RN app swaps `ConvexProvider` for the Zero provider and migrates every Convex hook (`useQuery`/`useMutation`/`useAction` — ~105 call-sites across ~47 files) to Zero reactive hooks reading/writing Postgres, with the share-URL builder in `app/document/[id].tsx` re-pointed to the new host.

**Acceptance Criteria**
- ☐ User can open the app and see conversations, documents, feed, and research load from Postgres via Zero, with zero `convex/react` hooks remaining in `app/`, `components/`, `hooks/`, `screens/` (grep-verified).
- ☐ User can mutate data (send a chat message, add a subscription, submit an improvement) and see it reactively reflected within one sync tick through Zero, with no `useMutation` from `convex/react` on the path.
- ☐ System can cold-start the RN app with the Zero provider replacing `ConvexProvider` in `app/_layout.tsx` and boot without `EXPO_PUBLIC_CONVEX_URL` set.
- ☐ User can generate a share URL from `app/document/[id].tsx` pointing at the new Mastra `/article/` host with no `.convex.cloud`→`.convex.site` rewrite remaining.

---

## UC-SYNC-02: Reactive surfaces

The surfaces that depended on Convex reactivity — live chat and mission progress — work on the new stack: real token streaming over SSE plus durable message/progress rows that Zero pushes reactively, so cross-device liveness and reconnect survive.

**Acceptance Criteria**
- ☐ User can watch a mission's progress update live on the app as the Mastra workflow advances, driven by Zero-synced Postgres rows.
- ☐ User can see chat responses stream token-by-token over SSE and remain consistent with the durable Zero-synced message after completion.
- ☐ User can observe a change made on one surface (e.g. the MCP gateway updates a document) reflect on the app within a sync tick without a manual refresh.

---

## UC-SYNC-03: Big-bang cutover

The cutover runs as an ordered sequence — build the new stack in parallel without touching Convex; freeze Convex writes; one-time `convex export`→ETL; flip the app + MCP to the new backend; pass real-service verification gates — before any decommission.

**Acceptance Criteria**
- ☐ Operator can stand up and validate the entire new stack (Postgres + Mastra + Zero + fleet) against a real integration suite while Convex still serves production untouched.
- ☐ Operator can freeze Convex writes, run the one-time ETL, and reconcile row counts for all tables between the export snapshot and Postgres with a green parity report.
- ☐ System can serve the app + MCP entirely from the new backend after the flip, verified by an end-to-end pass across app, MCP (all 44 tools), the `/article/` endpoint, and every migrated cron against real services.
- ☐ Agent Client can invoke all 44 MCP tools post-flip and receive Postgres-backed results with `src/convex/client.ts` no longer importing `convex/browser`.

---

## UC-SYNC-04: Rollback plan

Because the cutover is big-bang, a rollback path exists: the Convex cloud deployment stays live and deletable through the flip and soak, writes are frozen so Convex remains last-known-good, and the data-plane can be re-pointed via config before the point of no return.

**Acceptance Criteria**
- ☐ Operator can keep the Convex cloud deployment live and un-deleted through the flip + soak window, with a Convex-pointing app build pinned for fallback.
- ☐ Operator can re-point the data plane back to Convex via configuration (env + pinned build) if a Sev-1 gate fails within the soak window, losing zero committed data (writes were frozen at ETL).
- ☐ Operator can identify the explicit point of no return (Convex deployment deletion) and confirm it occurs only after a clean soak.

---

## UC-SYNC-05: Convex decommission

Once soak passes, everything Convex is removed: the `convex/` directory (all modules, `_generated/`, 11 backup files), the Convex + Cohere deps, the two dead Python/CLI clients, `ratatui-playground/`, all Convex env vars, and finally the Convex cloud deployment.

**Acceptance Criteria**
- ☐ Operator can run a `grep -ri convex` over `app/`, `components/`, `hooks/`, `screens/`, `lib/`, and `holocron-mcp/src/` and both `package.json` files and get zero hits.
- ☐ System can build the app and start the MCP server with the `convex`, `convex-helpers`, `@convex-dev/*`, `convex-test`, and `@ai-sdk/cohere` dependencies removed.
- ☐ Operator can confirm the dead Python (`python/`) and CLI (`cli/`) Convex clients are deleted and `ratatui-playground/` is archived out of the repo.
- ☐ Operator can delete the Convex cloud deployment as the final irreversible step, after which no Convex surface remains reachable.
