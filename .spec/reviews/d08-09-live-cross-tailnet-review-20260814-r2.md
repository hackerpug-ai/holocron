# Independent adversarial review — Sprint 32 D08-09 remediation (R2)

Reviewed SHA: `78fdf6e615ab68953071cf240107f88ebc673d58`

Review date: 2026-08-14
Mode: read-only, historical-evidence-only, non-disruptive
Result: **PASS**

No checkout or branch was moved. No product source, task, evidence, service, container, database, device, Tailscale Serve/Funnel configuration, or volume was changed. D08-05 was not executed. The only file written by this review is this requested report.

## Findings by severity

### Critical

None.

### High

None.

### Medium

None.

### Low

None.

### Informational observations

1. `captures-20260814T222935Z/node-a-registry-cleanup-post.txt` is intentionally zero bytes and is manifest-bound to the SHA-256 of the empty blob. It is an ancillary capture of an empty remaining-registry listing, not an empty health, MCP, sentinel, or required cleanup receipt. The required cleanup result is non-empty in `node-a-registry-cleanup.json` (`status=0`, `removed=true`, `remaining=""`) and is cross-referenced by `cleanup-proof.json`.
2. `node-b-peer-receipt-after.json` and `node-b-peer-receipt-final.json` are byte-identical and share the same internal observation timestamp. The final file is a retained alias/copy, not a claimed third independent observation. The two required independent peer observations are the non-identical before and after receipts at `22:10:02.633Z` and `22:10:56.772Z`.
3. The extra, repository-wide diagnostic `pnpm lint` is not green: Biome reports three formatter errors in unrelated files. Those three file blobs are identical at `78fdf6e6^` and `78fdf6e6`, and none is in the D08-09 live/remediation diff. This does not fail the configured landing hook: `lefthook.yml` scopes lint to staged `*.ts,*.tsx,*.js,*.jsx,*.json`; the exact reviewed commit changes only a Markdown review file, while its unconditional typecheck and unit-test legs both pass.

## Commit and parent-history inspection

The exact first-parent sequence inspected was:

| Commit | Purpose | Scope observed |
|---|---|---|
| `26b557688da8e349c38ea72da67ef1a3cf62b49d` | Initial live two-node seal | Three D08-09 evidence files only |
| `0cf047002b5f4fef98c5b0c2e2918ece8718189b` | Re-seal under operator-enabled private Serve | Two D08-09 evidence files only |
| `ac6f60cfd1215a008935497e77f0fa8257343181` | Peer-hash correction and historical capture package | D08-09 evidence plus the retained failed review only |
| `5d4976ee82e221b8950ee8d1c3a032e9bfb8353d` | Record remediation commit pointer | `landed-sha.json` only |
| `78fdf6e615ab68953071cf240107f88ebc673d58` | Strip trailing whitespace | Prior review Markdown only |

The aggregate diff from the deployed source revision/parent `e116f828ea52223eb3bf050a6093fb40832f8a2a` through the reviewed SHA contains 39 files, all beneath `.spec/`: D08-09 evidence and review artifacts. There are no changes under product/source/runtime paths, package manifests, lockfiles, Tailscale configuration, Docker service definitions, or D08-05.

## Evidence inspected

### Governing and top-level artifacts

- `RULES.md` in full.
- Full `D08-09-cross-tailnet-cold-host-recovery-drill.md` task specification.
- `services/platform/deploy/compose/README.md` two-node runbook and identity-hash contract.
- `services/platform/src/deploy/verify-production.ts` peer-receipt verification and sealing logic.
- Prior failed review `.spec/reviews/d08-09-live-cross-tailnet-review-20260814.md`.
- `cross-tailnet-drill.json`.
- `evidence-manifest.json`.
- `operator-authorization-receipt.json`.
- `review-remediation-20260814.json`.
- `landed-sha.json`.
- `blocked.json`.
- Preserved historical artifacts `cross-tailnet-drill.prev-20260814T220650Z.json`, `cross-tailnet-drill.prev-20260814T221057Z.json`, and `cross-tailnet-drill.prev-20260814T222935Z.json`.

### Every committed capture under `captures-20260814T222935Z`

| Capture(s) | Inspection result |
|---|---|
| `node-b-peer-receipt-before.json`, `node-b-peer-receipt-after.json`, `node-b-peer-receipt-final.json` | Valid JSON; before/after timestamps bracket the node-A drill; health and authenticated MCP counts are generation/digest/target/peer-bound. |
| `node-b-peer-before-console.json`, `node-b-peer-after-console.json`, `node-b-peer-meta.json` | Non-empty; peer entrypoint results and corrected full-MagicDNS identity binding agree with the peer receipts. |
| `node-a-preflight.json`, `node-a-compose-override.generated.yaml` | Non-empty; target/private-port/Serve/volume readiness and exact generation/digest/revision metadata agree with the drill. No credential value is present. |
| `node-a-services-ps.json` | Names exactly `postgres`, `mastra`, `scheduler`, `zero-cache`; each is `running`, `healthy`, and `ok=true`; count is exactly four. |
| `node-a-serve-status-summary.json`, `node-a-serve-health-probes.json` | Private HTTPS `44111`, tailnet and loopback health `200`, Funnel false/zero, target loopback `44111`. |
| `node-a-serve-status-before-drill.json`, `node-a-serve-status-after-drill.json` | Independently timestamped before/after copies; both contain only private HTTPS `44111` and proxy `http://127.0.0.1:44111`; Funnel key is absent. |
| `node-a-postgres-sentinel.json`, `node-a-blob-sentinel.json` | Non-empty seed/query/file receipts with success status and non-empty sentinel observations; identifiers are redacted/hashed. |
| `node-a-postgres-stop.json`, `node-a-postgres-down-health.json`, `node-a-postgres-recovered-health.json` | Successful stop receipt, HTTP `503` missing-dependency receipt, then HTTP `200`/healthy-four recovery receipt in timestamp order. |
| `node-a-mastra-restart.json`, `node-a-post-mastra-health.json` | One successful Mastra restart and post-restart tailnet/loopback `200` with healthy count four. |
| `node-a-wrong-identity-negative.json` | Live vs planted generation/digest mismatch records exactly one rejection. |
| `node-a-drill-console.log`, `node-a-drill-result.json` | Non-empty node-A event/result receipts; timestamps bracket stop/recovery/restart and finish with counts `1/1`, healthy four, Funnel zero, matching release identity. |
| `node-a-registry-cleanup.json`, `node-a-registry-cleanup-post.txt` | Non-empty structured cleanup result plus intentionally empty remaining-list stdout; both manifest-bound. |
| `node-a-funnel-proof.json` | Capture-derived Funnel false/zero proof with before/after Serve references and exact private target. |
| `negative-controls.json` | Capture-derived mapping for unreachable Serve, wrong identity, and missing Postgres dependency; each count is exactly one. |
| `volume-operation-ledger.json` | Names both retained volumes, records no delete/recreate operation, and reports `volume_deletion_count=0` and `volume_recreate_count=0`. |
| `cleanup-proof.json` | Post-drill health four/200, private Serve retained, registry cleanup complete, one Mastra restart, and zero volume deletions. |

All 29 capture paths are present exactly once in the manifest path set. Every manifest SHA-256 equals the exact committed blob at the reviewed SHA; every declared byte count matches. Twenty-eight captures are non-empty. The sole empty ancillary stdout is discussed above and has the correct empty-blob hash. All 35 JSON files in the D08-09 evidence directory parse successfully.

## Required verification results

| Requirement | Result | Evidence and independent check |
|---|---|---|
| Exact reviewed SHA | PASS | `HEAD` and the inspected commit object are `78fdf6e615ab68953071cf240107f88ebc673d58`; tracked and index diffs were empty before this report. |
| Peer bound to full authorized MagicDNS identity | PASS | SHA-256 of normalized `inference1.tail011a51.ts.net` independently recomputes to `dbe6c872c8b657652c8d12e3778e41c497d1a28f1bb577640503e0a21c4f7cf1`. SHA-256 of bare `inference1` is the preserved rejected value `de31b7c2...`. Active artifact, manifest, meta, and all peer receipts agree on the corrected full-name hash. |
| Target identity binding | PASS | SHA-256 of normalized `holocron.tail011a51.ts.net` recomputes to `d54fa31f4139b78b978426b0cba7ea06f076eb77312f0bc5473e863ad5ffb493`, matching active and peer/server receipts. |
| Historic receipt integrity | PASS | 29/29 committed capture hashes match the manifest; all declared sizes match; chronological source mtimes/internal timestamps are ordered and consistent. |
| Independent event timing | PASS | Peer before `22:10:02.633Z`; node-A start `22:10:04.352Z`; Postgres stop `22:10:05Z`; down `503` at `22:10:09Z`; recovered `200` at `22:10:15Z`; Mastra restart at `22:10:24Z`; node-A complete/post-health/Serve-after at about `22:10:31Z`; peer after `22:10:56.772Z`. |
| Health 200 before/after | PASS | Peer before receipt has health `200`; after/final receipt has before and post-restart health `200`; node-A post-Mastra capture also has tailnet and loopback `200`. |
| Authenticated MCP exact count | PASS | Peer before reports 44 tools; peer after/final reports 44 before and 44 after restart. The repository peer-receipt verifier accepts the final committed receipt. |
| Exact four healthy services | PASS | `node-a-services-ps.json` contains exactly the required four named services, all running and healthy. Recovery/post-Mastra receipts return healthy count four. |
| Postgres 503 then 200 | PASS | Timestamped stop/down/recovered captures record success, `503` with one missing-dependency rejection, then `200` and four healthy services. |
| Exactly one Mastra restart | PASS | Timestamped restart receipt records status `0`, count `1`; authorization maximum is one; final drill and cleanup receipts also record one. |
| Postgres/blob sentinels persist | PASS | Non-empty sentinel receipts seed/query one Postgres row and one blob object before disruption; the node-A drill result emitted after recovery/restart records `1/1`; cleanup and volume ledger retain the same named volumes with zero deletion/recreation. |
| Three negative controls | PASS | Peer unreachable Serve count `1`; wrong-generation/digest count `1`; Postgres-missing `503` count `1`. The derived negative-control map points back to the exact manifest-bound raw captures. |
| Serve target and Funnel zero | PASS | Before/after raw Serve JSON contains HTTPS `44111` proxying only to `http://127.0.0.1:44111`; Funnel key is absent; capture-derived proof reports false/zero. No live Tailscale mutation was performed by this review. |
| Cleanup and volumes | PASS | Recovered and post-Mastra health is `200`; post-drill healthy count is four; after-Serve state is preserved; registry temp state is gone; volume ledger reports delete/recreate `0/0`. No capture contains a volume deletion/recreation operation. |
| Durable operator authorization/window | PASS | Committed receipt authorizes the 2026-08-14 window, Node A/B identities, temporary Postgres stop/recovery, at most one Mastra restart, private Serve `44111`, and the exact four-service stack. It explicitly forbids Funnel, volume deletion/recreation, product parser workarounds, and D08-05. Observed timestamps exactly match the drill/peer receipts. |
| Secret/raw-environment absence | PASS | Targeted scans found zero known credential assignments, authorization values, credential-bearing URLs, sensitive query values, cookie values, private-key blocks, JWTs, common token prefixes, raw sensitive env assignments, or password values. The generated Compose capture contains only non-secret runtime metadata and a read-only secret-file path, not secret contents. |
| No product source change | PASS | Aggregate `e116f828..78fdf6e6` diff contains only `.spec/**`. No product, deploy/runtime source, Compose service graph, package, or lockfile changed. |
| D08-05 not executed | PASS | D08-05 remains `Status: Backlog`; its evidence directory is absent/empty at the exact SHA; no commit in the live/remediation chain touches its task/evidence; authorization and manifest both state pending/not executed. |
| Git whitespace/diff checks | PASS | `git show --check 78fdf6e6`, tip-parent `git diff --check`, and aggregate `e116f828..78fdf6e6 git diff --check` all exit `0`. Exact-SHA-to-HEAD, working-tree, and index tracked diffs were empty before this report. |
| Project landing hook | PASS | Exact tip changes only Markdown, so staged-file lint legs have no matching file. `pnpm tsgo --noEmit` exits `0`; `pnpm test:unit` exits `0` with 66 files passed, 5 skipped, 466 tests passed, 30 skipped. |

## Commands and checks run

Read-only/local commands included:

- `git status --short --branch`, `git rev-parse HEAD`, `git cat-file -t`, `git show -s --format=fuller`.
- `git log --graph`, `git diff-tree --name-status`, aggregate/tip `git diff --stat`, `git diff --name-status`, and path-scoped history checks.
- `git show <SHA>:<path>` for the task, prior review, top-level evidence, source contract, and every capture; `git ls-tree -r -l` for exact committed membership and sizes.
- Independent `shasum -a 256` derivation for full peer/target MagicDNS names and the rejected bare peer label.
- Manifest loop comparing all 29 declared SHA-256 values and byte counts against `git cat-file blob <SHA>:<path>`.
- `jq -e` for the four task predicates, cross-capture consistency, timestamp ordering, authorization scope, cleanup, negative controls, and volume ledger; all authoritative checks passed. A preliminary `jq -e empty` parse invocation was discarded because jq's `empty` filter intentionally emits no result/nonzero; the corrected `jq -e '.'` run parsed 35/35 JSON files.
- `bun services/platform/src/cli/holo.ts deploy:verify --peer-receipt ... --json` with output suppressed; exit `0`.
- Exact-commit `git grep` secret-shape scans (filenames/counts only, never credential values); all targeted categories returned zero.
- `git show --check`, tip-parent and aggregate `git diff --check`, exact-SHA-to-HEAD `git diff --exit-code`, working-tree tracked diff, and index diff.
- Project landing legs `pnpm tsgo --noEmit` and `pnpm test:unit`; both passed.
- Additional non-gating diagnostics: evidence-path Biome invocation checked zero files because `.spec` is ignored; repository-wide `pnpm lint` / `pnpm biome check . --diagnostic-level=error` found the three unrelated formatter errors described above. Their exact blobs were verified identical in the reviewed commit and its parent.

No live drill command, D08-05 command, credential-loading command, service/container/database/device control, Tailscale control, or volume mutation was run.

## Conclusion

The two HIGH findings from the first review are remediated at the exact reviewed SHA. The peer identity is now deterministically bound to the full authorized MagicDNS name, and the committed manifest-bound historical package supplies the previously absent peer/server, authorization, negative-control, Serve/Funnel, cleanup, and volume-preservation evidence. The task's exact predicates, repository scope, and configured landing hook pass without repeating any live operation. This SHA is approvable for the run stage; this review does not merge, push, or move any checkout.

VERDICT: PASS
