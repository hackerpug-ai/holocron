# Independent review — Sprint 32 D08-09 live cross-tailnet drill

Reviewed commit: `26b557688da8e349c38ea72da67ef1a3cf62b49d`

Review date: 2026-08-14
Mode: adversarial, read-only, non-disruptive
Overall result: **FAIL** — two HIGH findings prevent approval.

## Scope and method

All committed-file inspection was pinned with `git show 26b557688da8e349c38ea72da67ef1a3cf62b49d:<path>`. No checkout, branch, commit, product code, evidence, task file, container, service, Tailscale configuration, or volume was modified. Postgres was not stopped and no service was restarted. The later checkout state was not used as evidence for the reviewed commit.

Read-only checks included the four task `jq` predicates, commit/tree/history inspection, artifact parsing and credential-pattern scanning, current Tailscale peer status, Node-B HTTPS health, authenticated MCP `initialize` and `tools/list`, and one unreachable-port request. Node-A SSH status access was unavailable (`Permission denied`), so no remote Docker or Serve command was attempted.

## Findings

### HIGH-1 — The sealed peer identity hash does not bind to Node B's MagicDNS identity

The evidence contract requires target and peer identity hashes to be SHA-256 hashes of their MagicDNS names (`services/platform/deploy/compose/README.md:356-358`). The active artifact records `peer_identity_hash=de31b7c2...` (`evidence/D08-09/cross-tailnet-drill.json:6`). Independent read-only Tailscale status identifies this machine as the `inference1` peer, whose normalized MagicDNS-name SHA-256 is `dbe6c872c8b657652c8d12e3778e41c497d1a28f1bb577640503e0a21c4f7cf1`. The preserved prior attempt records that same MagicDNS hash (`evidence/D08-09/cross-tailnet-drill.prev-20260814T220650Z.json:7`). By contrast, the active artifact's `de31b7c2...` is SHA-256 of the bare label `inference1`, not its MagicDNS name.

The verifier only checks that `peer_identity_hash` is 64 hexadecimal characters (`services/platform/src/deploy/verify-production.ts:1169-1173`); it has no expected authorized-peer parameter (`:1152-1157`), and the sealer writes `real_device_count=2` unconditionally (`:1287`). Therefore the reviewed evidence is not bound to the asserted authorized second device and does not satisfy the two-real-device identity requirement.

### HIGH-2 — The pass artifact lacks the independently captured live, authorization, cleanup, and volume-preservation proof required by the task

The task requires both nodes to record independently timestamped outputs (`D08-09-cross-tailnet-cold-host-recovery-drill.md:163-166`) and explicitly requires captured peer health/MCP plus server Docker/Tailscale output, cleanup verification, and full gate validation (`:202-208`). It also forbids running Postgres recovery or Mastra restart without an explicit operator window and authorization and forbids volume deletion/recreation (`:61-67`, `:168-171`).

At the reviewed commit, the evidence directory contains only:

- `blocked.json`, the superseded 2026-08-12 blocked record;
- `cross-tailnet-drill.prev-20260814T220650Z.json`, an exact blob-for-blob preservation of the prior blocked attempt; and
- `cross-tailnet-drill.json`, a 29-line scalar summary.

There is no peer receipt, Node-A Docker/Serve capture, Node-B before/after health or MCP capture, operator authorization/window reference, restart event, sentinel query output, negative-control output, cleanup record, or `volume_deletion_count=0` observation. The active summary merely states the desired values (`cross-tailnet-drill.json:12-28`). The preserved blocked audit says the earlier attempt had no selected peer, no operator window, and no Postgres/Mastra authorization (`blocked.json:14-38`); its appended supersession metadata (`:59-62`) does not establish authorization for the later attempt.

This is not a cosmetic omission. `sealCrossTailnetDrillEvidence` accepts caller-supplied server counts/statuses (`services/platform/src/deploy/verify-production.ts:1223-1244`) and copies them into a passing summary (`:1259-1304`). The committed integration test demonstrates that synthetic peer and server objects with the expected numbers produce `status=pass` (`services/platform/tests/integration/service/health-readiness.test.ts:490-570`). Without the required source captures, the artifact cannot distinguish a real drill from hand-supplied values.

Consequently the reviewed commit does not independently establish: Postgres-down 503/recovery 200, exactly four healthy containers after recovery, exactly one **authorized** Mastra restart, Postgres/blob sentinels at 1/1, wrong-identity and missing-dependency rejections at 1/1, Funnel endpoint count 0, cleanup completion, or zero volume deletions. Because the user prohibited repeating the disruptive steps, durable historical evidence is the only safe proof; it is absent.

## Verification results

| Check | Result | Evidence |
|---|---|---|
| Four exact task `jq` predicates | PASS as scalar validation | All four predicates return true against the exact committed artifact. This validates JSON values, not their live provenance. |
| Artifact metadata | PASS | Schema/status are present; timestamps are ordered; digest, revision, generation, and hashes are non-empty; `source_revision=e116f828...` equals the reviewed commit's parent. |
| Two real devices | FAIL | Current Tailscale status shows `inference1` and `holocron` online, but the sealed peer hash is not the Node-B MagicDNS hash; see HIGH-1. |
| Node-B private HTTPS health | CORROBORATED CURRENTLY | Read-only request returned HTTP 200. Health reported the same image digest, source revision, and compose generation as the artifact, with dependencies ready. |
| MCP initialize/tools/list | CORROBORATED CURRENTLY | Authenticated `initialize` returned HTTP 200 and `tools/list` returned HTTP 200 with exactly 44 tools. No credential value was printed or serialized. |
| Unreachable Serve rejection | CORROBORATED CURRENTLY | One request to HTTPS port 44112 failed, producing rejection count 1. |
| Postgres 503 and recovery 200 | FAIL / not auditable | Scalar claim only; no historical node-A output or cleanup record. The disruption was not repeated. |
| Exactly one authorized Mastra restart | FAIL / not auditable | `mastra_restart_count=1` is claimed, but there is no restart event or operator authorization/window evidence. |
| Postgres/blob sentinels each 1 | FAIL / not auditable | Scalar claims only; no retained query/object output. |
| Wrong-identity and missing-dependency rejections each 1 | FAIL / not auditable | Scalar claims only; no retained negative-control outputs. |
| Funnel count 0 | FAIL / not auditable | Scalar claim only; no retained Node-A `tailscale serve status --json` capture, and Node-A status access was unavailable. |
| Credential count 0 / raw environment absent | PASS for tracked artifacts | All three JSON files parse; the repository credential-pattern scan found zero credential-value pattern classes; active and prior evidence report `raw_environment_present=false`. |
| No volume deletion | FAIL / not auditable | Commit scope contains no product/runtime mutation, but the drill evidence has no volume-deletion observation or Node-A event/volume capture. Repository scope cleanliness cannot prove runtime volume preservation. |
| Recovered exact-four healthy state | FAIL / not auditable | Current health is 200 and release-bound, but it does not expose the four-container count; the only count is the uncorroborated scalar. |
| Source/product scope cleanliness | PASS | The commit changes exactly three files, all under `evidence/D08-09/`; no source, task, container, Tailscale, or volume definition is changed. |
| Prior blocked history retained | PASS | The previous attempt's committed blob is preserved exactly as `cross-tailnet-drill.prev-20260814T220650Z.json`; `blocked.json` retains the blocked facts and marks them superseded. |
| D08-05 pending and unexecuted | PASS | D08-05 remains `Status: Backlog` (`D08-05-delete-the-convex-cloud-deployment-operator-executed-irreversible.md:13`), its task file is unchanged by the commit, and none of its pre-delete authorization, deletion receipt, or post-delete verification artifacts exists at the reviewed SHA. |

## Disposition

The current endpoint behavior is encouraging, and the commit is repository-scope clean, secret-safe, and preserves the earlier failure history. Those facts do not cure the broken peer identity binding or replace the task-mandated historical evidence for disruptive node-A operations and cleanup. Because both findings are HIGH, this exact commit is not approvable and must not be used to unlock D08-05.

VERDICT: FAIL
