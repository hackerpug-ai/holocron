# Convex Decommission Runbook (CAP-CUT-01 / CAP-BAK-01 / D08-04)

**Mission:** Ordered, gated checklist from readiness through D08-03 recovery eligibility,
an explicit **human hold**, D08-05 operator deletion, post-delete proof, abort, recovery,
escalation, and secret-safe evidence handling.

**Audience:** Operator (human) with production Convex provider console access + repo checkout  
**Dispatcher:** `bun services/platform/src/cli/holo.ts` (or `./bin/holo` — never a PATH stub)  
**IRREVERSIBLE boundary:** D08-05 only — **do not automate** the provider deletion  
**This runbook (D08-04) NEVER deletes Convex.**

| Artifact | Path |
|----------|------|
| Deletion eligibility gate (D08-03) | `.spec/prds/mk6-migration/tasks/sprint-32-convex-decommission-code-deps-and-cloud-deletion/evidence/D08-03/deletion-gate.json` |
| Cross-tailnet portable drill (D08-09) | `.spec/prds/mk6-migration/tasks/sprint-32-convex-decommission-code-deps-and-cloud-deletion/evidence/D08-09/cross-tailnet-drill.json` |
| Pre-delete authorization (D08-05) | `…/evidence/D08-05/pre-delete-authorization.json` |
| Deletion receipt (D08-05) | `…/evidence/D08-05/deletion-receipt.json` |
| Post-delete verification (D08-05) | `…/evidence/D08-05/post-delete-verification.json` |
| Scratch evidence (this runbook) | `.tmp/REDHAT-FIX-S32-D08-04/` |

**State machine (fail-closed):**

```
G0 preflight → G1 readiness → G2 D08-03 artifact → G3 human hold
    → G4 D08-05 handoff → G5 post-delete verification
Any failure → G6 ABORT / ESCALATE (exit 2) + Postgres/blob recovery (no Convex rollback)
```

Eligibility (`deletion_eligible=true`, `convex_deletion_performed=false`) is **not** authorization.
Only the G3 **human hold** may advance to D08-05. There is **no rollback** of the Convex
cloud deployment after D08-05 completes.

---

## Secret-safe evidence (all gates)

- **Never** write secret values, tokens, cookies, private keys, or raw provider response bodies
  into the runbook, tickets, logs, or evidence JSON.
- Evidence may record: status enums, operation identifiers, target fingerprints, SHA-256 digests,
  timestamps, redacted receipts, operator approval references, exit codes, and counts.
- Secret-bearing names live only in local `.env` / `secrets.yaml` (see `AGENTS.md` secret index).
  Load live credentials explicitly when required:
  ```bash
  set -a; source .env; set +a
  export HOLO_SECRETS_PATH="${HOLO_SECRETS_PATH:-services/platform/config/secrets.yaml}"
  ```
- On any secret-scan hit (`secret_scan_hits >= 1` or credential-shaped residue in evidence):
  **ABORT** (exit 2), scrub the artifact, and **ESCALATE**.

---

## G0 — Preflight (repository + environment)

Complete every item. On any failure: **ABORT** exit 2 → G6.

- [ ] **Checkout is the intended branch / worktree** (not a disposable dirty tree for production ops).
  ```bash
  git rev-parse --show-toplevel
  git status -sb
  git rev-parse HEAD
  ```
- [ ] **Secrets path present** (names only; never `cat` secret values into logs).
  ```bash
  test -f "${HOLO_SECRETS_PATH:-services/platform/config/secrets.yaml}"
  ```
- [ ] **Dispatcher resolves platform CLI** (not a PATH stub that only implements a subset).
  ```bash
  bun services/platform/src/cli/holo.ts --help 2>&1 | head -5
  # or: ./bin/holo --help
  ```
- [ ] **Evidence scratch writable**
  ```bash
  mkdir -p .tmp/REDHAT-FIX-S32-D08-04
  test -d .tmp/REDHAT-FIX-S32-D08-04
  ```
- [ ] **No accidental deletion receipt yet** (pre-delete world must show `convex_deletion_performed=false`).
  ```bash
  test ! -e .spec/prds/mk6-migration/tasks/sprint-32-convex-decommission-code-deps-and-cloud-deletion/evidence/D08-05/deletion-receipt.json \
    || /usr/bin/jq -e '.convex_deletion_performed != true' \
      .spec/prds/mk6-migration/tasks/sprint-32-convex-decommission-code-deps-and-cloud-deletion/evidence/D08-05/deletion-receipt.json
  ```

**Pass:** all commands exit 0. **Fail:** G6 ABORT.

---

## G1 — Readiness (D08-01 / D08-02 no-Convex oracles)

Prove the repository, env, and decommission inventory are clean **before** treating recovery
eligibility as meaningful. Exact repository-native commands only.

- [ ] **Composite no-Convex oracle (D08-01)**
  ```bash
  bun services/platform/src/cli/holo.ts verify:no-convex --json
  # expect exit 0; residue counts zero across repository + build/MCP probes
  ```
- [ ] **Client residue authority**
  ```bash
  bun services/platform/src/cli/holo.ts verify:no-convex-client \
    --roots app,components,hooks,screens,lib,holocron-mcp/src --json
  ```
- [ ] **Env alias clean**
  ```bash
  bun services/platform/src/cli/holo.ts verify-no-convex-env
  ```
- [ ] **Decommission inventory (Sprint 31 / D08-02)**
  ```bash
  bun services/platform/src/cli/holo.ts verify:decommission-inventory --json
  ```

Optional re-bind of D08-03 consumer (does not re-run restore):

```bash
PLATFORM_IT=1 pnpm vitest run --project integration \
  services/platform/tests/integration/sprint32-d08-03-deletion-gate.test.ts
```

**Pass:** all exit 0. **Fail:** G6 ABORT — do **not** proceed to G2 eligibility consumption.

---

## G2 — D08-03 recovery eligibility artifact (hard gate)

D08-03 proves **recovery eligibility only**. It does **not** authorize deletion and must show
`convex_deletion_performed=false`.

Artifact:

```text
.spec/prds/mk6-migration/tasks/sprint-32-convex-decommission-code-deps-and-cloud-deletion/evidence/D08-03/deletion-gate.json
```

- [ ] **Non-empty artifact present**
  ```bash
  ART=.spec/prds/mk6-migration/tasks/sprint-32-convex-decommission-code-deps-and-cloud-deletion/evidence/D08-03/deletion-gate.json
  test -s "$ART"
  ```
- [ ] **All-pass eligibility with deletion not yet performed**
  ```bash
  /usr/bin/jq -e '
    .schema == "holo.decommission.deletion-gate.v1"
    and .status == "pass"
    and .deletion_eligible == true
    and .convex_deletion_performed == false
    and ([.checks[]|.status]|all(. == "pass"))
    and (.evidence_manifest|length > 0)
  ' "$ART"
  ```
- [ ] **Fail-closed assert script (SHA-256 manifest + secret-free body)**
  ```bash
  /bin/bash scripts/assert-s32-d08-03-deletion-gate.sh "$ART"
  ```
- [ ] **Record gate digests for handoff** (secret-free)
  ```bash
  /usr/bin/jq -r '
    "gate_run_id=" + .gate_run_id,
    "status=" + .status,
    "deletion_eligible=" + (.deletion_eligible|tostring),
    "convex_deletion_performed=" + (.convex_deletion_performed|tostring),
    "manifest_count=" + (.evidence_manifest|length|tostring),
    "secret_scan_hits=" + ((.secret_scan_hits // 0)|tostring)
  ' "$ART" | tee .tmp/REDHAT-FIX-S32-D08-04/g2-eligibility-summary.txt
  shasum -a 256 "$ART" | tee -a .tmp/REDHAT-FIX-S32-D08-04/g2-eligibility-summary.txt
  ```

If the artifact is missing, empty, stale, contradictory, `status != "pass"`,
`deletion_eligible != true`, any check not `pass`, or `convex_deletion_performed == true`:
**ABORT** exit 2 → G6. Re-run D08-03 (`scripts/run-s32-d08-03-deletion-gate.sh`) only via its
own task contract — never invent a shortcut.

**Required before human hold:** `deletion_eligible=true` **and** `convex_deletion_performed=false`.

**Pass:** jq + assert exit 0. **Fail:** G6 ABORT. **Do not enter G3.**

---

## G3 — Human hold (hard block before D08-05)

> **STOP. This is the explicit human hold.**  
> A passing G2 eligibility gate is **not** approval.  
> D08-05 remains blocked until an authorized human records explicit production-scope approval.

The operator must confirm **all** of the following before any provider action:

| Check | Required observation |
|-------|----------------------|
| Upstream chain | D08-01, D08-02, D08-03, D08-04 (this runbook), and **D08-09** complete |
| D08-03 gate | `deletion_eligible=true`, `convex_deletion_performed=false`, all checks pass |
| D08-09 portable | `cross-tailnet-drill.json` present with real two-device private proof (see D08-05 task) |
| Target identity | Provider **account**, **organization**, **environment=`production`**, deployment **fingerprint** match live provider control plane |
| Authorization | Explicit **operator-authorized** sign-off (name/reference + UTC timestamp) |
| Semantics | Action is **manual**, **irreversible**, production-scoped; **do not automate** |
| Receipt plan | Capture only a **redacted receipt** (no raw provider body, zero secret hits) |

- [ ] **D08-09 hard dependency** (blocks D08-05 even when G2 passes)
  ```bash
  PORTABLE=.spec/prds/mk6-migration/tasks/sprint-32-convex-decommission-code-deps-and-cloud-deletion/evidence/D08-09/cross-tailnet-drill.json
  test -s "$PORTABLE"
  /usr/bin/jq -e '
    .schema == "holo.deploy.cross-tailnet-drill.v1"
    and .real_device_count == 2
    and .healthy_service_count == 4
    and .second_device_health_status == 200
    and .mcp_tool_count == 44
    and .funnel_endpoint_count == 0
    and .credential_value_count == 0
  ' "$PORTABLE"
  ```
  If D08-09 is absent or not all-pass: **hold remains**; **ABORT** any attempt to skip to G4.

- [ ] **Provider target identity (manual query on provider control surface)**  
  Record only redacted identity fields in `pre-delete-authorization.json` (D08-05).  
  Abort on mismatch, unreachable provider, or staging/non-production target.

- [ ] **Explicit human authorization recorded**  
  Required fields (names only — no secrets):
  - `operator_authorized: true`
  - `target_environment: "production"`
  - `target_fingerprint_match: true`
  - `provider_action_manual: true`
  - approval reference + UTC timestamp  
  Implicit approval from a green CI job or green G2 **must not** pass.

- [ ] **Hold acknowledgement (operator)**  
  I confirm G0–G2 passed, D08-09 passed, production target identity matches, and I authorize
  proceeding to the **manual** D08-05 provider action. I understand the action is **irreversible**
  and there is **no rollback** of Convex after deletion.

**Pass:** human hold lifted with written authorization artifact path prepared for D08-05.  
**Fail / incomplete:** remain on hold; G6 if any contradictory evidence appears.

---

## G4 — D08-05 handoff (operator-executed provider deletion)

**Handoff only.** This runbook does **not** invent a repository deletion verb, CLI flag, or
automation bridge from eligibility → delete.

Execute under task contract:

```text
.spec/prds/mk6-migration/tasks/sprint-32-convex-decommission-code-deps-and-cloud-deletion/D08-05-delete-the-convex-cloud-deployment-operator-executed-irreversible.md
```

### Operator sequence (summary — full detail in D08-05)

1. Re-validate G0–G3 and both gate artifacts (D08-03 + D08-09).
2. Query the **real** external provider; confirm production account/org/environment/fingerprint.
3. Record `pre-delete-authorization.json` with `operator_authorized=true` and production scope.
4. Perform the provider's **documented manual** console/API deletion action **only** against the
   confirmed production deployment. **Do not automate.** This repository has **no** CLI verb,
   script flag, or package script that performs provider deletion — do not invent one.
5. Capture a **redacted receipt** → `deletion-receipt.json`:
   - schema `holo.decommission.convex-deletion-receipt.v1`
   - `provider_status=deleted`
   - `convex_deletion_performed=true`
   - target fingerprint, `provider_operation_id`, `provider_response_sha256` (64 hex)
   - `secret_scan_hits=0`, `raw_provider_response_present=false`
6. On any mismatch, wrong target, automation attempt, secret hit, or missing receipt fields:
   **ABORT** exit 2 → G6.

**Irreversible semantics:** after the provider reports deletion, Convex cloud state for that
deployment cannot be restored by this repository. Recovery is **Postgres + blob (R2)** only.

---

## G5 — Post-delete verification

Run only after a valid redacted receipt shows `convex_deletion_performed=true`.

- [ ] **Provider control-plane absence** for the exact target fingerprint  
  Record `provider_lookup=not-found` in `post-delete-verification.json` (no raw body).

- [ ] **No-Convex re-proof (exact commands)**
  ```bash
  bun services/platform/src/cli/holo.ts verify:no-convex-client \
    --roots app,components,hooks,screens,lib,holocron-mcp/src --json
  bun services/platform/src/cli/holo.ts verify-no-convex-env
  bun services/platform/src/cli/holo.ts verify:decommission-inventory --json
  ```

- [ ] **Real MCP (Postgres/Zero, no Convex references)**
  ```bash
  PLATFORM_IT=1 pnpm vitest run --project integration \
    services/platform/tests/integration/sprint31-legacy-mcp-repoint.test.ts \
    -t 'AC-4 legacy package serves Postgres over stdio with no Convex references'
  ```

- [ ] **Real app journey**
  ```bash
  /bin/bash scripts/e2e/run-maestro-reference-flow.sh --run
  ```

- [ ] **Post-delete artifact schema**
  ```bash
  POST=.spec/prds/mk6-migration/tasks/sprint-32-convex-decommission-code-deps-and-cloud-deletion/evidence/D08-05/post-delete-verification.json
  test -s "$POST"
  /usr/bin/jq -e '
    .provider_lookup == "not-found"
    and .source_convex_reference_count == 0
    and .env_convex_reference_count == 0
    and .mcp_exit_code == 0
    and .app_exit_code == 0
    and .documents_payload_count > 0
  ' "$POST"
  ```

**Pass:** all probes exit 0 and artifact predicates hold.  
**Fail:** G6 ABORT / ESCALATE — do **not** claim decommission complete.

---

## G6 — Abort, escalation, and recovery

### ABORT (exit code **2**)

Any of the following **must** abort with exit code **2** (fail-closed):

- Missing, empty, stale, malformed, or contradictory gate evidence
- G1 oracle non-zero exit
- G2: `status != pass`, `deletion_eligible != true`, any check not pass, or
  `convex_deletion_performed == true` before authorized D08-05 completion
- Human hold skipped, implicit approval, or staging/non-production target
- Provider unreachable, fingerprint mismatch, or automation of deletion
- Secret-scan hits in any evidence artifact
- Post-delete probe failure or empty journey payloads

```bash
# Canonical abort pattern for operator scripts wrapping this runbook:
echo "ABORT: decommission gate failed — see G6" >&2
# ESCALATE: open incident with secret-free evidence pointers only
exit 2
```

### ESCALATE

- Open / update an incident with: gate id (G0–G5), failed command name, exit code,
  evidence **paths** and SHA-256 digests only (never secret values or raw provider bodies).
- Preserve secret-free evidence under `.tmp/REDHAT-FIX-S32-D08-04/` and task `evidence/` trees.
- Page on-call / migration owner per operator incident process.
- Do **not** retry D08-05 until G0–G3 are green again and a new human hold is recorded.

### Recovery path = Postgres + blob (not Convex)

There is **no rollback** of the Convex cloud deployment after D08-05.

| Need | Path |
|------|------|
| Postgres PITR | Sprint 28 / fire-drill: `holo restore --pitr …`, `scripts/run-fire-drill-on-fresh-target.sh`, [fire-drill-monthly.md](./fire-drill-monthly.md) |
| Blob restore | restic / R2 restore tuple `R2_RESTORE_*` with `REQUIRE_LIVE_R2_RO=1` |
| Fresh-target isolation | `scripts/prove-isolation.sh`, `scripts/provision-fresh-restore-target.sh` |
| Monthly drill | `holo restore:fire-drill` / mission `fire-drill-monthly` |

Example recovery re-proof (scratch only — never live mini mounts):

```bash
# Distinct restore credentials — load from secrets; never print values
export REQUIRE_LIVE_R2_RO=1
/bin/bash scripts/prove-r2-readonly.sh
HOST="$(/bin/bash scripts/derive-s28-fresh-host.sh)"
/bin/bash scripts/provision-fresh-restore-target.sh --host "$HOST"
# Then volume-bound fire-drill + parity (see D08-03 / HUMAN-GATE.md)
```

### What never happens in G6

- **No** Convex rollback / thaw / re-create as a recovery strategy after deletion
- **No** silent success on failed probes
- **No** retention of raw provider responses or credentials in evidence

---

## Ordered gate checklist (operator sign-off)

| Gate | Name | Blocking condition | Exit on fail |
|------|------|--------------------|--------------|
| **G0** | Preflight | Repo/CLI/secrets path not ready | **ABORT** 2 |
| **G1** | Readiness | `verify:no-convex*` / inventory non-zero | **ABORT** 2 |
| **G2** | D08-03 artifact | Not all-pass / not eligible / deletion already claimed | **ABORT** 2 |
| **G3** | Human hold | Missing operator-authorized production approval or D08-09 | Hold / **ABORT** 2 |
| **G4** | D08-05 handoff | Manual provider delete only after G3 | **ABORT** 2 |
| **G5** | Post-delete | Provider not-found + app/MCP independence fail | **ABORT** 2 |
| **G6** | Abort / escalate / recover | Always available; Postgres+blob recovery; **no rollback** of Convex | exit **2** |

Sign-off order is fixed: **G0 → G1 → G2 → G3 → G4 → G5**. G6 may interrupt at any step.

---

## References

- Sprint 32: `.spec/prds/mk6-migration/tasks/sprint-32-convex-decommission-code-deps-and-cloud-deletion/SPRINT.md`
- D08-03 task + `scripts/run-s32-d08-03-deletion-gate.sh` / `scripts/assert-s32-d08-03-deletion-gate.sh`
- D08-05 task (operator-executed irreversible deletion)
- Sprint 28: `HUMAN-GATE.md`, `gate-plan.json`, [fire-drill-monthly.md](./fire-drill-monthly.md)
- UC-SYNC-05 / T-SYNC-018 / CAP-CUT-01 / CAP-BAK-01
- Contract test: `services/platform/tests/integration/sprint32-decommission-runbook.test.ts`

---

## Anti-patterns (reject)

- Combining restore proof and provider deletion in one script
- Implicit approval from green CI or green `deletion_eligible`
- Invented repository deletion command or mock provider
- Raw provider receipt / secret-bearing evidence
- Claiming Convex rollback after D08-05
- Skipping the G3 human hold
