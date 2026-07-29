# REDHAT-FIX-H3 — Prove fresh-target isolation across network, IPC, mounts, identity, and alternate mini access paths (review H-3)

## What this does

Close red-hat H-3 by making the fresh-restore-target isolation contract establish genuine zero access to the original mini across network, IPC/sockets, mounts/bind-mounts, process/SSH identity, alternate control-plane paths, and independently attested hardware/VM identity — superseding the TCP/5432 + two-path-string theatre in D05-03 AC-1 and D05-06 AC-1.

## Why

Remediate red-hat finding for CAP-BAK-01 (REDHAT-FIX-H3). Grounded in UC-PLAT-06 / T-PLAT-022 / T-PLAT-025 / CAP-BAK-01. Review evidence: `.spec/reviews/red-hat-20260728T235155Z-sprint-28.md` (reviewed SHA `a9b5b6e7ff2b707fddf15084e2895221c62c68cb`).

## How to verify

- `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-h3-multi-axis-isolation.test.ts` → RED on narrow TCP/mount-only theatre; GREEN only after multi-axis scripts
- `bash scripts/prove-isolation.sh` → Exit 0 only when all axes PASS; exit != 0 if any axis open
- `bash scripts/verify-restore-isolation.sh` → Exit 0 with 0 reachable mini routes/sockets/mounts and distinct attested identity
- `pnpm tsgo --noEmit` → Exit 0
- `pnpm tsgo --noEmit && pnpm biome check .` → Exit 0

## Scope

Writes: scripts/prove-isolation.sh (MODIFY|NEW — multi-axis isolation), scripts/verify-restore-isolation.sh (MODIFY|NEW — multi-axis isolation), scripts/provision-fresh-restore-target.sh (MODIFY only if identity attestation wiring required), services/platform/src/backup/fresh-target.md (MODIFY isolation contract documentation), services/platform/tests/integration/redhat-fix-h3-multi-axis-isolation.test.ts (NEW), .spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/D05-03-provision-a-genuinely-fresh-restore-target-zero-access-to-the-original-mini.md (MODIFY AC-1 supersession notes only if required), .spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/D05-06-security-review-fresh-restore-target-trust-boundary.md (MODIFY AC-1 isolation oracle alignment only if required), .tmp/REDHAT-FIX-H3/** (NEW evidence)

Prohibited: Mocking network isolation or hardcoding exit 0, Leaving D05-03/D05-06 isolation gates as TCP/5432 + two path strings only, Implementing unrelated restore product features outside isolation remediation, Any file not listed under write_allowed

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: REDHAT-FIX-H3 — Prove fresh-target isolation across network, IPC, mounts, identity, and alternate mini access paths (review H-3)
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M  (120 min)
AGENT:      implementer=security-reviewer | reviewer=code-reviewer
PROPOSED-BY: security-reviewer
TDD_MODE:   red_first     RED_GREEN_REQUIRED: yes     (requires_seeded_evidence: True)
CAPABILITY: CAP-BAK-01
SPRINT:     [Sprint 28 — Point-in-Time Restore and Fresh-Hardware Fire Drill](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-h3-multi-axis-isolation.test.ts
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
scripts/prove-isolation.sh and scripts/verify-restore-isolation.sh require multi-axis PASS and fail closed on any open axis; target identity is independently attested and distinct from the mini; integration suite RED then GREEN; D05-03/D05-06 isolation ACs cannot false-pass on same-host or partial isolation; typecheck and lint clean on write_allowed paths.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST supersede D05-03 AC-1 and D05-06 AC-1 narrow checks so 'zero access to the original mini' requires multi-axis proof: network (IPv4/IPv6/tailnet/LAN/DNS aliases), IPC/sockets, mounts/bind-mounts (not only /mnt/mini-pgdata and /mnt/mini-blobs), process/SSH identity, and alternate control-plane paths
- MUST bind the restore target to an independently attested hardware or VM identity distinct from the original mini (machine-id / SMBIOS UUID / cloud instance-id / documented VM UUID) and fail closed if identity collides or is missing
- MUST extend scripts/prove-isolation.sh and scripts/verify-restore-isolation.sh with real multi-axis probes that exit non-zero if ANY axis is open
- MUST prove isolation with real OS probes (ip route, ss/nc, mount/findmnt, test -S, getent, identity files) — never mock network isolation
- MUST write red_first integration/e2e coverage that fails when only TCP/5432 + two path strings pass while other mini routes remain open
- NEVER treat a single failed nc -z mini 5432 plus absence of /mnt/mini-pgdata and /mnt/mini-blobs as sufficient isolation
- NEVER accept same-host containers, shared network namespaces, shared PID/IPC namespaces, or residual bind-mounts of mini PGDATA/blob volumes as 'fresh hardware'
- NEVER hardcode exit 0 or static PASS lines without executing real probes
- NEVER mock, stub, or simulate network unreachability in place of real connectivity/route/socket checks
- NEVER expand product restore runtime beyond isolation probe/provision scripts and tests required for this finding
- STRICTLY PRIMARY AC is integration/e2e against a real provisioned target surface (or documented isolation fixture that still runs real probe code paths) with flow_ref T-PLAT-025
- STRICTLY tdd_mode red_first: capture RED that narrow D05-03/D05-06 checks would pass while alternate mini paths remain open, then green multi-axis probe
- STRICTLY fail-closed: any open axis → probe exit != 0 and gate FAIL
- STRICTLY preserve Sprint 28 CAP-BAK-01 fresh-hardware fire-drill scope; plan remediation of isolation contract only

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [x] AC-1: GIVEN a candidate fresh restore target WHEN multi-axis isolation probes run THEN exit 0 only if network, IPC/sockets, mo
- [x] AC-2: GIVEN target and mini attested identities WHEN probe compares them THEN identities are non-empty, independently read, an
- [x] AC-3: GIVEN mini network coordinates WHEN probe runs THEN all configured mini network targets are unreachable across IPv4/IPv6
- [x] AC-4: GIVEN target mounts and sockets WHEN probe inspects beyond legacy path strings THEN alternate mini bind-mounts and socke
- [x] AC-5: GIVEN mini management endpoints WHEN probe validates denial THEN SSH and alternate control-plane paths to mini are close
- [x] AC-6: GIVEN H-3 negative control WHEN suite runs against narrow TCP/mount-only checks THEN suite fails; GREEN only after multi
- [x] `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads)
--------------------------------------------------------------------------------

### AC-1 [PRIMARY] — Multi-axis isolation probe fails closed if any axis is open (flow_ref T-PLAT-025)
  GIVEN/WHEN/THEN: GIVEN a candidate fresh restore target WHEN multi-axis isolation probes run THEN exit 0 only if network, IPC/sockets, mounts/bind-mounts, process/SSH identity, control-plane paths, and hardware/VM identity are all closed; any open axis fails closed
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: multi-axis-isolation-probe
  VERIFY: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-h3-multi-axis-isolation.test.ts -t 'AC-1'; bash scripts/prove-isolation.sh; bash scripts/verify-restore-isolation.sh`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if probe exits 0 when only TCP/5432 fails and two path strings are absent while other axes remain open; probe hardcodes exit 0; network isolation mocked
  START_REF: fresh-target-multi-axis-provisioned
  MUST_OBSERVE: exit 0 only when every axis PASS; network/IPC/mounts/identity axes all documented
  MUST_NOT_OBSERVE: narrow TCP/5432 + two-path-only PASS; static exit 0
  EVIDENCE: stdout (required_capture=True)

### AC-2 — Independently attested hardware/VM identity distinct from mini (flow_ref T-PLAT-025)
  GIVEN/WHEN/THEN: GIVEN target and mini attested identities WHEN probe compares them THEN identities are non-empty, independently read, and unequal; collision fails closed
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: hardware-vm-identity-attestation
  VERIFY: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-h3-multi-axis-isolation.test.ts -t 'AC-2'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if identity check skipped; same machine-id PASSes
  START_REF: fresh-target-multi-axis-provisioned
  MUST_OBSERVE: identities non-empty and unequal
  MUST_NOT_OBSERVE: identity collision with exit 0
  EVIDENCE: stdout (required_capture=True)

### AC-3 — Network axis covers IPv4/IPv6/tailnet/LAN/DNS (flow_ref T-PLAT-025)
  GIVEN/WHEN/THEN: GIVEN mini network coordinates WHEN probe runs THEN all configured mini network targets are unreachable across IPv4/IPv6/tailnet/LAN/DNS aliases
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: network-isolation-probe
  VERIFY: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-h3-multi-axis-isolation.test.ts -t 'AC-3'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if only port 5432 checked; IPv6/tailnet ignored
  START_REF: fresh-target-multi-axis-provisioned
  MUST_OBSERVE: 0 successful mini network connections
  MUST_NOT_OBSERVE: reachable mini with overall PASS
  EVIDENCE: stdout (required_capture=True)

### AC-4 — IPC/sockets and mounts exhaustively deny mini paths (flow_ref T-PLAT-025)
  GIVEN/WHEN/THEN: GIVEN target mounts and sockets WHEN probe inspects beyond legacy path strings THEN alternate mini bind-mounts and sockets fail closed
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: mount-and-ipc-isolation-probe
  VERIFY: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-h3-multi-axis-isolation.test.ts -t 'AC-4'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if only /mnt/mini-pgdata and /mnt/mini-blobs checked; shared namespace PASSes
  START_REF: same-host-or-partial-isolation-negative
  MUST_OBSERVE: probe exit != 0 when alternate mini mount or socket present
  MUST_NOT_OBSERVE: PASS with only two path strings absent
  EVIDENCE: stdout (required_capture=True)

### AC-5 — SSH/control-plane alternate paths denied (flow_ref T-PLAT-025)
  GIVEN/WHEN/THEN: GIVEN mini management endpoints WHEN probe validates denial THEN SSH and alternate control-plane paths to mini are closed
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: identity-and-control-plane-isolation
  VERIFY: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-h3-multi-axis-isolation.test.ts -t 'AC-5'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if SSH to mini succeeds with overall PASS
  START_REF: fresh-target-multi-axis-provisioned
  MUST_OBSERVE: PASS for SSH/control-plane isolation
  MUST_NOT_OBSERVE: open management path with exit 0
  EVIDENCE: stdout (required_capture=True)

### AC-6 — Red-first suite rejects narrow isolation theatre (flow_ref T-PLAT-025)
  GIVEN/WHEN/THEN: GIVEN H-3 negative control WHEN suite runs against narrow TCP/mount-only checks THEN suite fails; GREEN only after multi-axis fail-closed contract
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: multi-axis-isolation-probe
  VERIFY: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-h3-multi-axis-isolation.test.ts`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if suite greens on narrow checks; mocked probes
  START_REF: narrow-isolation-false-pass-baseline
  MUST_OBSERVE: RED on narrow theatre; GREEN only multi-axis closed
  MUST_NOT_OBSERVE: false green on TCP-only probe
  EVIDENCE: stdout (required_capture=True)

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | Multi-axis isolation scripts exit 0 only when all axes closed | AC-1 | `bash scripts/prove-isolation.sh; bash scripts/verify-restore-isolation.sh; PLATF` |
| TC-2 | Hardware/VM identity independently attested and distinct from mini | AC-2 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-h3-` |
| TC-3 | Network axis covers IPv4/IPv6/tailnet/LAN/DNS not only 5432 | AC-3 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-h3-` |
| TC-4 | Mounts/IPC checks catch alternate bind-mounts and sockets | AC-4 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-h3-` |
| TC-5 | SSH and alternate control-plane paths denied | AC-5 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-h3-` |
| TC-6 | Suite fails closed on narrow isolation theatre | AC-6 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-h3-` |
| TC-7 | Typecheck and lint clean on write_allowed surfaces | AC-1 | `pnpm tsgo --noEmit && pnpm biome check .` |

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- scripts/prove-isolation.sh (MODIFY|NEW — multi-axis isolation)
- scripts/verify-restore-isolation.sh (MODIFY|NEW — multi-axis isolation)
- scripts/provision-fresh-restore-target.sh (MODIFY only if identity attestation wiring required)
- services/platform/src/backup/fresh-target.md (MODIFY isolation contract documentation)
- services/platform/tests/integration/redhat-fix-h3-multi-axis-isolation.test.ts (NEW)
- .spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/D05-03-provision-a-genuinely-fresh-restore-target-zero-access-to-the-original-mini.md (MODIFY AC-1 supersession notes only if required)
- .spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/D05-06-security-review-fresh-restore-target-trust-boundary.md (MODIFY AC-1 isolation oracle alignment only if required)
- .tmp/REDHAT-FIX-H3/** (NEW evidence)
writeProhibited:
- Mocking network isolation or hardcoding exit 0
- Leaving D05-03/D05-06 isolation gates as TCP/5432 + two path strings only
- Implementing unrelated restore product features outside isolation remediation
- Any file not listed under write_allowed

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. .spec/reviews/red-hat-20260728T235155Z-sprint-28.md:110-115 [H-3 source finding: isolation contract does not establish zero access to original mini]
2. .spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/D05-03-provision-a-genuinely-fresh-restore-target-zero-access-to-the-original-mini.md:95-104 [D05-03 AC-1 narrow TCP/5432 + two mount path strings to supersede]
3. .spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/D05-06-security-review-fresh-restore-target-trust-boundary.md:68-100 [D05-06 critical constraints require no route/socket/IPC yet AC-1 is still narrow]
4. services/platform/src/backup/config.ts:all [Backup/restore trust boundary context for CAP-BAK-01]
5. .spec/prds/mk6-migration/10-technical-requirements/09-capability-chains.md:63-72 [CAP-BAK-01 restore half: PITR + fresh-hardware fire drill]
6. .spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/SPRINT.md:all [Sprint 28 gate: restore from R2 alone with zero mini access]
7. RULES.md:all [Project rules; no fakeable gates]

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- RED multi-axis isolation suite (pre-fix / negative control): `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-h3-multi-axis-isolation.test.ts` → RED on narrow TCP/mount-only theatre; GREEN only after multi-axis scripts
- prove-isolation multi-axis: `bash scripts/prove-isolation.sh` → Exit 0 only when all axes PASS; exit != 0 if any axis open
- verify-restore-isolation multi-axis: `bash scripts/verify-restore-isolation.sh` → Exit 0 with 0 reachable mini routes/sockets/mounts and distinct attested identity
- Typecheck: `pnpm tsgo --noEmit` → Exit 0
- Lint: `pnpm biome check .` → Exit 0

--------------------------------------------------------------------------------
DESIGN
--------------------------------------------------------------------------------
References: .spec/reviews/red-hat-20260728T235155Z-sprint-28.md H-3, D05-03 AC-1, D05-06 AC-1 + critical constraints, CAP-BAK-01 / T-PLAT-025
Interaction notes:
- Axes must be enumerated in script output: network, IPC/sockets, mounts, identity, control-plane, hardware/VM attestation
- Prefer real OS tools: nc/ss, ip route, findmnt/mount, test -S, getent hosts, cat /etc/machine-id or cloud metadata
- Coordinate with D05-03 provisioner so identity attestation is recorded at provision time
pattern: Fail-closed multi-axis isolation probe: independently attested target identity + deny/verify ALL mini routes and mounts; red_first integration suite encodes H-3 narrow false-pass
pattern_source: D05-03 prove-isolation.sh intent; D05-06 verify-restore-isolation.sh; red-hat H-3
anti_pattern: nc -z mini 5432 + absence of two mount strings only; same-host container pretending to be fresh hardware; mocked network isolation; static PASS theatre

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------
Implementer: security-reviewer — Remediates red-hat H-3 isolation contract gaps. Agent remains security-reviewer per stub; script implementer may be security-reviewer or devops under this task ownership. Reviewer: security-reviewer (adversarial isolation).
Reviewer: code-reviewer (+ security-reviewer when task is security-scoped)

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: D05-03
Blocks: false-isolation-gate-pass, D05-06-isolation-AC-honest-pass, Sprint-28-human-gate-step-fresh-target
Coordinates with: D05-06, REDHAT-FIX-H1

--------------------------------------------------------------------------------
NOTES
--------------------------------------------------------------------------------
- Review evidence (immutable): `.spec/reviews/red-hat-20260728T235155Z-sprint-28.md` @ SHA `a9b5b6e7ff2b707fddf15084e2895221c62c68cb`.
- Do not claim gate pass; do not implement outside write_allowed.
- Preserve Sprint 28 CAP-BAK-01 restore-half scope.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-H3",
  "proposed_by": "security-reviewer",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "narrow-isolation-false-pass-baseline": {
      "description": "RED baseline matching H-3: a target that fails only TCP/5432 and lacks /mnt/mini-pgdata|/mnt/mini-blobs can still retain tailnet/LAN/IPv6/DNS/SSH/control-plane paths, alternate bind mounts, sockets, or same-host container identity",
      "seed_method": "recorded_external",
      "records": [
        "Review H-3 at .spec/reviews/red-hat-20260728T235155Z-sprint-28.md:110-115",
        "D05-03 AC-1 only requires failed TCP/5432 and absence of /mnt/mini-pgdata and /mnt/mini-blobs",
        "D05-06 AC-1 repeats narrow TCP/mount check despite critical constraints requiring no reachable network route, socket, or IPC path",
        "Reviewed SHA a9b5b6e7ff2b707fddf15084e2895221c62c68cb planned state"
      ]
    },
    "fresh-target-multi-axis-provisioned": {
      "description": "Restore target provisioned under D05-03 with multi-axis isolation probe installed and mini identity endpoints configured for real probes",
      "seed_method": "cli",
      "records": [
        "MINI_HOST / MINI_IPV4 / MINI_IPV6 / MINI_TAILNET_IP configured as probe targets (or documented empty with fail-closed if mini coords unavailable when required)",
        "Target machine-id or VM UUID recorded as TARGET_ATTESTED_IDENTITY",
        "Mini machine-id or VM UUID recorded as MINI_ATTESTED_IDENTITY and unequal to target",
        "scripts/prove-isolation.sh and scripts/verify-restore-isolation.sh executable on target"
      ]
    },
    "same-host-or-partial-isolation-negative": {
      "description": "Negative control fixture: target co-located with mini or retaining at least one open axis (route, socket, mount, identity collision)",
      "seed_method": "public_api",
      "records": [
        "At least one of: reachable mini IPv4/IPv6/tailnet route, shared mount of mini data, accessible mini unix socket, same machine-id as mini, SSH to mini succeeds from target",
        "Probe MUST exit non-zero",
        "Must not be greened by TCP-only checks"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "description": "GIVEN a candidate fresh restore target WHEN multi-axis isolation probes run THEN exit 0 only if network, IPC/sockets, mounts/bind-mounts, process/SSH identity, control-plane paths, and hardware/VM identity are all closed; any open axis fails closed",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-h3-multi-axis-isolation.test.ts -t 'AC-1'; bash scripts/prove-isolation.sh; bash scripts/verify-restore-isolation.sh",
      "maps_to_ac": null,
      "primary": true,
      "flow_ref": "T-PLAT-025",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "multi-axis-isolation-probe",
        "flow_ref": "T-PLAT-025",
        "negative_control": {
          "would_fail_if": [
            "probe exits 0 when only TCP/5432 fails and two path strings are absent while other axes remain open",
            "probe hardcodes exit 0",
            "network isolation mocked"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "fresh-target-multi-axis-provisioned",
            "action": {
              "actor": "security-reviewer",
              "steps": [
                "run multi-axis prove-isolation and verify-restore-isolation scripts"
              ]
            },
            "end_state": {
              "must_observe": [
                "exit 0 only when every axis PASS",
                "network/IPC/mounts/identity axes all documented"
              ],
              "must_not_observe": [
                "narrow TCP/5432 + two-path-only PASS",
                "static exit 0"
              ]
            }
          }
        ],
        "topology": "single-node"
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN target and mini attested identities WHEN probe compares them THEN identities are non-empty, independently read, and unequal; collision fails closed",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-h3-multi-axis-isolation.test.ts -t 'AC-2'",
      "maps_to_ac": null,
      "primary": false,
      "flow_ref": "T-PLAT-025",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "hardware-vm-identity-attestation",
        "flow_ref": "T-PLAT-025",
        "negative_control": {
          "would_fail_if": [
            "identity check skipped",
            "same machine-id PASSes"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "fresh-target-multi-axis-provisioned",
            "action": {
              "actor": "security-reviewer",
              "steps": [
                "compare TARGET_ATTESTED_IDENTITY to MINI_ATTESTED_IDENTITY"
              ]
            },
            "end_state": {
              "must_observe": [
                "identities non-empty and unequal"
              ],
              "must_not_observe": [
                "identity collision with exit 0"
              ]
            }
          }
        ],
        "topology": "single-node"
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN mini network coordinates WHEN probe runs THEN all configured mini network targets are unreachable across IPv4/IPv6/tailnet/LAN/DNS aliases",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-h3-multi-axis-isolation.test.ts -t 'AC-3'",
      "maps_to_ac": null,
      "primary": false,
      "flow_ref": "T-PLAT-025",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "network-isolation-probe",
        "flow_ref": "T-PLAT-025",
        "negative_control": {
          "would_fail_if": [
            "only port 5432 checked",
            "IPv6/tailnet ignored"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "fresh-target-multi-axis-provisioned",
            "action": {
              "actor": "security-reviewer",
              "steps": [
                "probe all mini network coordinates"
              ]
            },
            "end_state": {
              "must_observe": [
                "0 successful mini network connections"
              ],
              "must_not_observe": [
                "reachable mini with overall PASS"
              ]
            }
          }
        ],
        "topology": "single-node"
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "GIVEN target mounts and sockets WHEN probe inspects beyond legacy path strings THEN alternate mini bind-mounts and sockets fail closed",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-h3-multi-axis-isolation.test.ts -t 'AC-4'",
      "maps_to_ac": null,
      "primary": false,
      "flow_ref": "T-PLAT-025",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "mount-and-ipc-isolation-probe",
        "flow_ref": "T-PLAT-025",
        "negative_control": {
          "would_fail_if": [
            "only /mnt/mini-pgdata and /mnt/mini-blobs checked",
            "shared namespace PASSes"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "same-host-or-partial-isolation-negative",
            "action": {
              "actor": "security-reviewer",
              "steps": [
                "inspect mounts and sockets"
              ]
            },
            "end_state": {
              "must_observe": [
                "probe exit != 0 when alternate mini mount or socket present"
              ],
              "must_not_observe": [
                "PASS with only two path strings absent"
              ]
            }
          }
        ],
        "topology": "single-node"
      }
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "description": "GIVEN mini management endpoints WHEN probe validates denial THEN SSH and alternate control-plane paths to mini are closed",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-h3-multi-axis-isolation.test.ts -t 'AC-5'",
      "maps_to_ac": null,
      "primary": false,
      "flow_ref": "T-PLAT-025",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "identity-and-control-plane-isolation",
        "flow_ref": "T-PLAT-025",
        "negative_control": {
          "would_fail_if": [
            "SSH to mini succeeds with overall PASS"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "fresh-target-multi-axis-provisioned",
            "action": {
              "actor": "security-reviewer",
              "steps": [
                "validate SSH/control-plane denial"
              ]
            },
            "end_state": {
              "must_observe": [
                "PASS for SSH/control-plane isolation"
              ],
              "must_not_observe": [
                "open management path with exit 0"
              ]
            }
          }
        ],
        "topology": "single-node"
      }
    },
    {
      "id": "AC-6",
      "type": "acceptance_criterion",
      "description": "GIVEN H-3 negative control WHEN suite runs against narrow TCP/mount-only checks THEN suite fails; GREEN only after multi-axis fail-closed contract",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-h3-multi-axis-isolation.test.ts",
      "maps_to_ac": null,
      "primary": false,
      "flow_ref": "T-PLAT-025",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "multi-axis-isolation-probe",
        "flow_ref": "T-PLAT-025",
        "negative_control": {
          "would_fail_if": [
            "suite greens on narrow checks",
            "mocked probes"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "narrow-isolation-false-pass-baseline",
            "action": {
              "actor": "security-reviewer",
              "steps": [
                "run suite against pre-fix and post-fix scripts"
              ]
            },
            "end_state": {
              "must_observe": [
                "RED on narrow theatre",
                "GREEN only multi-axis closed"
              ],
              "must_not_observe": [
                "false green on TCP-only probe"
              ]
            }
          }
        ],
        "topology": "single-node"
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Multi-axis isolation scripts exit 0 only when all axes closed",
      "verify": "bash scripts/prove-isolation.sh; bash scripts/verify-restore-isolation.sh; PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-h3-multi-axis-isolation.test.ts -t 'AC-1'",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Hardware/VM identity independently attested and distinct from mini",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-h3-multi-axis-isolation.test.ts -t 'AC-2'",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Network axis covers IPv4/IPv6/tailnet/LAN/DNS not only 5432",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-h3-multi-axis-isolation.test.ts -t 'AC-3'",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Mounts/IPC checks catch alternate bind-mounts and sockets",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-h3-multi-axis-isolation.test.ts -t 'AC-4'",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "SSH and alternate control-plane paths denied",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-h3-multi-axis-isolation.test.ts -t 'AC-5'",
      "maps_to_ac": "AC-5"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "Suite fails closed on narrow isolation theatre",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-h3-multi-axis-isolation.test.ts",
      "maps_to_ac": "AC-6"
    },
    {
      "id": "TC-7",
      "type": "test_criterion",
      "description": "Typecheck and lint clean on write_allowed surfaces",
      "verify": "pnpm tsgo --noEmit && pnpm biome check .",
      "maps_to_ac": "AC-1"
    }
  ]
}
-->

</details>
