# Independent read-only QA — Sprint 32 D08-09

Reviewed implementation SHA: `78fdf6e615ab68953071cf240107f88ebc673d58`

QA date: 2026-08-14

Scope: independent, read-only QA of the exact committed evidence package. This QA did not move a checkout, merge, push, or commit; did not change product code or committed evidence; did not run D08-05 or repeat the drill; and did not stop/restart any service, container, Postgres, or Mastra, mutate Tailscale Serve/Funnel, or delete/recreate/inspect volume contents. The only file written is this report.

## Materials reviewed

- `RULES.md` in full.
- Full D08-09 task specification.
- The D08-09 package at the exact SHA, including the manifest and every committed capture.
- The prior failed review and the independent R2 PASS review.
- The D08-05 task/status and exact-SHA tree history.

The earlier review's two high findings were peer MagicDNS-hash binding and absent durable raw captures. The current package contains the corrected full-MagicDNS binding plus manifest-bound Node A/Node B/authorization/cleanup records; the checks below independently validate those changes.

## Historical drill proof — exact committed package

| Gate | Result | Independent result |
|---|---|---|
| Exact implementation identity | PASS | `HEAD` equals `78fdf6e615ab68953071cf240107f88ebc673d58`; the evidence subtree has no diff from that commit. |
| Task TC-1 exact `jq` command | PASS | Two devices, private HTTPS `44111`, peer health `200`, Funnel false. |
| Task TC-2 exact `jq` command | PASS | Four services, `503`/`200` recovery, sentinels `1/1`, MCP tools `44`. |
| Task TC-3 exact `jq` command | PASS | Restart count `1`, retained sentinels, healthy four, Funnel count `0`. |
| Task TC-4 exact `jq` command | PASS | All three negative controls reject exactly once; credential-value count is `0`. |
| JSON and evidence shape | PASS | All 35 JSON artifacts parse as objects. The root artifact has the required schema, valid hash/digest/revision shapes, ordered timestamps, zero credential/volume-deletion counts, and no raw environment. |
| Manifest membership | PASS | Manifest contains exactly 29 unique capture paths; its path set exactly equals the committed capture directory. The sole empty capture is the documented ancillary registry-cleanup stdout; all required health, peer, sentinel, cleanup, and service receipts are non-empty. |
| SHA-256 and byte-count recomputation | PASS | All 29 manifest SHA-256 values equal independently recomputed exact-blob hashes. All 25 declared byte counts match exact-blob sizes. Four capture-derived receipts omit a `bytes` field in the manifest (`funnel-proof`, `negative-controls`, `volume-operation-ledger`, `cleanup-proof`); their exact blob sizes were still computed (517, 1147, 1998, and 800 bytes respectively), but there is no declaration to compare. |
| Peer/target identity binding | PASS | Independently recomputed normalized MagicDNS SHA-256 values match the root artifact, manifest, metadata, and all three peer receipts. This is the corrected full peer-name hash, not the prior rejected bare-label hash. |
| Peer health and authenticated MCP receipts | PASS | Before receipt records health `200` and 44 tools; after/final receipt records before-and-after health `200` and tools `44`. Generation, image digest, target hash, port, and peer hash agree with the root artifact. The final receipt also passes the project's no-write `deploy:verify --peer-receipt` schema and credential guard. |
| Node A service/recovery/restart/sentinel proof | PASS | Captures prove exactly `postgres`, `mastra`, `scheduler`, and `zero-cache`, each running and healthy; Postgres stop, missing-dependency `503`, recovery `200`/four healthy; exactly one Mastra restart; and successful Postgres/blob sentinel captures. |
| Negative controls | PASS | Capture-derived records bind unreachable Serve, wrong identity, and missing dependency to rejection count `1` each; wrong identity's live generation/digest agree with the drill target. |
| Private Serve/Funnel proof | PASS | Both before/after Node A Serve captures show HTTPS `44111` proxied to `http://127.0.0.1:44111`; Funnel is absent/empty. Derived Funnel proof records `false` and `0`. |
| Cleanup and volume preservation | PASS | Cleanup proof retains four healthy services, `200` recovery, preserved Serve, cleaned registry state, one restart, and zero volume deletions. The volume ledger names `holocron-postgres` and `holocron-blobs`, records zero delete/recreate operations, and records only non-deleting operations. |
| Authorization and chronology | PASS | The authorization receipt permits the bounded 2026-08-14 Postgres recovery and at most one Mastra restart, forbids Funnel/volume deletion/D08-05, and matches the observation window. Chronology is consistent: peer-before 22:10:02.633Z; drill start 22:10:04.352Z; Postgres stop/503/recovery at 22:10:05/09/15Z; restart 22:10:24Z; post-recovery state about 22:10:31Z; peer-after 22:10:56.772Z. |
| Secret and raw-environment hygiene | PASS | Targeted exact-commit scans, reporting counts only, found zero matching files for the project credential scanner patterns, known credential assignments, Tailscale-key/JWT/private-key shapes, credential-bearing URLs, cookie/password values, and raw sensitive environment assignments. |

## Current non-disruptive corroboration

These checks corroborate current state only; they do not replace the historical drill proof above.

| Gate | Result | Method |
|---|---|---|
| Node B private health | PASS | From the authorized Node B tailnet identity, `GET https://holocron.tail011a51.ts.net:44111/health` returned HTTP `200`. |
| Node A production services | PASS | Using only the supplied existing ControlMaster socket `/tmp/holocron-s32-codex.sock` to `holocron@holocron`, read-only Docker status confirmed exactly four production services—postgres, mastra, scheduler, zero-cache—each running and healthy. |
| Node A private Serve/Funnel | PASS | Read-only `tailscale serve status --json` confirms private HTTPS `:44111` routes to `http://127.0.0.1:44111`; Funnel endpoint count is `0`. |
| Node A persistent volumes | PASS | Read-only Docker listing and inspection confirm `holocron-postgres` and `holocron-blobs` both exist. No volume contents were inspected. |
| Current authenticated MCP discovery | PASS (historical receipt) | No scoped MCP credential was preloaded. The available `deploy:verify --mcp-discovery` command writes evidence, so it was not run; no credential-bearing environment was loaded, copied, or printed. Instead, the committed authenticated Node B peer receipts (44 tools before/after) were validated, including the project's no-write peer-receipt verifier. |

## Landing and D08-05 gates

| Gate | Result | Independent result |
|---|---|---|
| Whitespace | PASS | `git show --check`, tip-parent `git diff --check`, and aggregate `e116f828ea52223eb3bf050a6093fb40832f8a2a..78fdf6e615ab68953071cf240107f88ebc673d58` whitespace checks pass. |
| Scope | PASS | The tip changes one Markdown review file. The aggregate range changes 39 paths, all under `.spec/`; no product/runtime/Compose/package/lockfile/D08-05 path changed. |
| Landing hook read-only legs | PASS | `pnpm tsgo --noEmit` passes; `pnpm test:unit` passes (66 files passed, 5 skipped; 466 tests passed, 30 skipped). The hook's lint glob has no eligible file at this Markdown-only tip; its configured command uses `--write` and was not invoked. |
| D08-05 remains unexecuted | PASS | D08-05 remains `Backlog`; no D08-05 evidence entries exist at the reviewed SHA; the source-to-reviewed range has zero D08-05 task/evidence touches; the D08-09 manifest says `pending_not_executed`; and the authorization receipt explicitly sets D08-05 deletion authorization to false. |

## Non-gating diagnostics

- Node B's read-only Tailscale status emitted a local client/daemon version-skew warning (client 1.98.9, daemon 1.96.5). Node B and the target were online and the private health request returned `200`; this did not affect any gate.
- The non-interactive Node A SSH session did not inherit paths to Docker/Tailscale. The existing ControlMaster session remained usable; read-only checks completed with the installed absolute executable paths. No remote state changed.

This QA approves the cited SHA for the run stage only. It does not merge, push, move a checkout, or land work.

VERDICT: PASS
