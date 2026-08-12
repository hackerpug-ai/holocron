# D08-07 Security Review — Portable host preflight, receipt, private Serve

**Commit:** `d056f6afef95942bf0698faad50d643f691e109e`  
**Reviewer:** security-reviewer  
**TDD_MODE:** red_first  
**Do not merge:** yes  

## AC Enumeration (first section)

| AC | Requirement | Verdict | Evidence |
|----|-------------|---------|----------|
| AC-1 | IMP-AC-7 Docker VM vs host headroom | **PASS** | `evaluateMemoryCapacity` + real Docker/sysctl; `memory-capacity.json` |
| AC-2 | IMP-AC-10 Operator runbook | **PASS** | `compose/README.md` + CLI/script contract tests |
| AC-3 | IMP-AC-12 Non-mutating preflight (9 checks) | **PARTIAL** | Real 9 checks / 0 mutations; weak `target_host` + port availability |
| AC-4 | IMP-AC-13 Non-secret receipt | **PARTIAL** | Apply path writes full receipt; test is synthetic builder / always-true volume assert |
| AC-5 | IMP-AC-14 Receipt-driven verify | **FAIL** | Memory drift stub; identity soft-pass; live_services=0 ok; mock Serve test |
| AC-6 | IMP-AC-15 Authz + redaction | **PARTIAL** | Unauthorized fail-closed real; authorized path test-theatre; unredacted `runOrFail` |

**Block completion:** YES — FAIL + PARTIAL + CRITICAL stub present.

## SECURITY REVIEW VERDICT

```
SECURITY REVIEW VERDICT
STATUS: NEEDS_FIXES

CRITICAL:
- SEC-C1 memory_drift_rejected is a semantic stub (verify-production.ts:868-892)

HIGH:
- SEC-H1 identity mismatch soft-pass when health fails (858-861)
- SEC-H2 live_services accepts zero containers (801-806)
- SEC-H3 runOrFail unredacted child stderr/stdout (production-deploy.ts:601-602)
- SEC-H4 IMP-AC-14 mock fetch + LAN default (health-readiness.test.ts)

MEDIUM:
- target_host always true; fragile Funnel regex; incomplete credential patterns; Serve status.raw retention

LOW:
- LOC budget overrun; missing RED evidence for red_first
```

## Dual-lens technical schema

See `.tmp/D08-07/technical-verdict.json` (`verdict: NEEDS_FIXES`) and `.tmp/D08-07/security-verdict.json`.

## What is solid (do not regress)

1. **Non-mutating preflight** — real Docker/Compose/sysctl/Tailscale status; mutation classifier + ledger; evidence `preflight.json` shows `docker_mutation_count=0`.
2. **Private Serve design** — `tailscale serve --bg --https=44111 http://127.0.0.1:44111`; Funnel refusal; authorize required before Serve apply.
3. **Secret path gate** — realpath, no symlink, mode, store root containment.
4. **Authz gate** — `authorized: false` refuses before Docker mutations.
5. **Receipt schema** — host/port/Serve/services/volumes/memory/generation without secret fields; credential-shaped refuse on write.
6. **LAN removal** — compatibility script uses MagicDNS / `HOLO_PRODUCTION_BASE_URL`, not `ipconfig getifaddr`.

## Required fixes (block merge)

1. **Implement real memory contract verification** — inspect live container `HostConfig.Memory` (or Compose-applied limits) and compare to `receipt.memoryLimitsGib`; reject drift against the running deployment.
2. **Remove identity soft-pass** — if wrong-digest identity probe does not throw, fail verification; do not default `identity_mismatch_rejected=true` when health is down (health already fails `ok`).
3. **Require live service bind** — `live_services` must be exactly 4 (or fail closed); never treat 0 as success.
4. **Redact child process errors** — never embed raw stderr/stdout that may contain env-expanded secrets; log command + status + redacted classification only.
5. **Replace IMP-AC-14 test theatre** — exercise real private Serve or an integration path that proves Tailscale HTTPS 44111 without mock health / LAN defaults; prove negative identity/memory controls against live or deterministic fake runner that still inspects the same code paths as production.
6. **Tighten AC-4/AC-6 tests** — compare receipt to real containers (or recorded real deploy evidence); prove authorized mutation path without hardcoding `authorized: true` as the only success criterion.
7. Capture **RED then GREEN** evidence for red_first; include typecheck/lint evidence per task RUNTIME_COMMANDS.

## Out of scope confirmed

- No Funnel/ACL changes in commit  
- No secret values in evidence artifacts  
- D08-08 cold-host / D08-09 second-device not claimed  
