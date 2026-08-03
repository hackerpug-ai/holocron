#!/usr/bin/env bash
# D06-07 + REDHAT-FIX-S29-R2-H01/R3-C01 — Re-run all eight Sprint 29 gate steps.
#
# Executes gate-plan.json literal_cmd for steps 1–8 via real deployment/cutover CLI
# (bun services/platform/src/cli/holo.ts). Writes:
#   - .gate-evidence/{run_id}/step{1..8}.log  (real command transcripts)
#   - .gate-evidence/{run_id}/meta.json
#   - gate-results.json + GATE-RESULTS.md (honest pass/fail; never forge 8/8)
#
# R3-C01 binding rules:
#   - source_sha/git_sha MUST equal `git rev-parse HEAD` of this worktree (refuse unknown).
#   - Prefer independently deployed HTTP identity (HOLO_VERIFY_BASE_URL / HOLO_SOAK_BASE_URL /
#     PLATFORM_URL / HOLO_SERVICE_IDENTITY). If only local-process:// is available, record it
#     honestly and set landing_eligible=false (non-landing; never claim cutover approval).
#   - landing_eligible=true only when verdict==pass AND 8/8 AND identity is not local-process://
#     AND git_sha == HEAD.
#
# NEVER accepts historical run_id 20260802T004525Z as pass for the remediated SHA.
# NEVER rewrites historical .gate-evidence/20260802T004525Z/**.
# Full 8/8 may remain blocked — record honest fail/partial; never forge.
#
# Usage:
#   export HOLO_SECRETS_PATH=...   # optional; defaults may resolve secrets
#   export GATE_RUN_ID=20260802TxxxxxxZ   # optional; auto-generated if unset
#   export HOLO_VERIFY_BASE_URL=https://...  # preferred deployed identity for landing
#   export HOLO_ARTICLE_SHARE_TOKEN=...  # existing public Convex article sampled before ETL
#   export MINT_R2_PREFIX_RESTORE=1  # mint temporary scoped RO proof/data tuples after .env
#   bash scripts/run-sprint29-human-gate-rerun.sh
#   WRITE_GATE_RESULTS=0 bash scripts/run-sprint29-human-gate-rerun.sh  # evidence only
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SPRINT_DIR="$ROOT/.spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip"
PLAN="$SPRINT_DIR/gate-plan.json"
RESULTS="$SPRINT_DIR/gate-results.json"
RESULTS_MD="$SPRINT_DIR/GATE-RESULTS.md"
HISTORICAL_STALE_RUN_ID="20260802T004525Z"
# R3-C01 evidence root (R2-H01 path also mirrored for lineage consumers).
TMP_ROOT="$ROOT/.tmp/REDHAT-FIX-S29-R3-C01"
TMP_ROOT_R2="$ROOT/.tmp/REDHAT-FIX-S29-R2-H01"
WRITE_GATE_RESULTS="${WRITE_GATE_RESULTS:-1}"
QUIET_WINDOW_SECONDS="${QUIET_WINDOW_SECONDS:-30}"
# Per-step wall-clock caps (seconds). Honest fail on timeout — never hang forever.
STEP_TIMEOUT_DEFAULT="${STEP_TIMEOUT_DEFAULT:-180}"
STEP_TIMEOUT_1="${STEP_TIMEOUT_1:-10800}" # go/no-go includes serial live backup/PITR suites
STEP_TIMEOUT_2="${STEP_TIMEOUT_2:-600}"   # build/pull/cold-recreate deployment
STEP_TIMEOUT_3="${STEP_TIMEOUT_3:-600}"   # dependency + SIGKILL + durability + MCP
STEP_TIMEOUT_6="${STEP_TIMEOUT_6:-1800}"  # run-etl / convex export / real embeddings
STEP_TIMEOUT_7="${STEP_TIMEOUT_7:-300}"   # flip + verify-soak

if [[ ! -f "$PLAN" ]]; then
  echo "error: gate-plan missing: $PLAN" >&2
  exit 2
fi

if [[ -z "${GATE_RUN_ID:-}" ]]; then
  GATE_RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)"
fi

# Refuse historical false-pass id as the new run.
if [[ "$GATE_RUN_ID" == "$HISTORICAL_STALE_RUN_ID" ]]; then
  echo "error: refuse GATE_RUN_ID=$HISTORICAL_STALE_RUN_ID (historical false-pass lineage)" >&2
  exit 2
fi

# Allowlist: same contract as scripts/assert-gate-run-id.sh
if [[ ! "$GATE_RUN_ID" =~ ^[A-Za-z0-9]([A-Za-z0-9_-]{0,62}[A-Za-z0-9])?$ ]]; then
  echo "error: refuse invalid GATE_RUN_ID: $GATE_RUN_ID" >&2
  exit 2
fi

export GATE_RUN_ID
export QUIET_WINDOW_SECONDS
GATE_RUN_NONCE="$(python3 -c 'import secrets; print(secrets.token_hex(32))')"
export GATE_RUN_NONCE
GATE_RUN_NONCE_SHA256="$(printf '%s' "$GATE_RUN_NONCE" | python3 -c 'import hashlib, sys; print(hashlib.sha256(sys.stdin.buffer.read()).hexdigest())')"
RUNNER_PID="$$"
RUN_FINALIZED=0

# R3-C01: require real HEAD (never "unknown" theatre).
SOURCE_SHA="$(git -C "$ROOT" rev-parse HEAD)"
if [[ ! "$SOURCE_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "error: git rev-parse HEAD did not return a 40-char sha: $SOURCE_SHA" >&2
  exit 2
fi
STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# Prefer deployed identity when the operator supplies one; else honest local-process (non-landing).
IDENTITY_CLASS="deployed-http"
NON_LANDING_REASON=""
DEPLOYED_BASE_URL="${HOLO_PRODUCTION_BASE_URL:-${HOLO_VERIFY_BASE_URL:-${HOLO_SOAK_BASE_URL:-${PLATFORM_URL:-}}}}"
if [[ -z "$DEPLOYED_BASE_URL" ]]; then
  # Honest local identity — do not claim remote deployment (R2-H02 / R3-C01).
  DEPLOYED_BASE_URL="local-process://holo-cli"
  IDENTITY_CLASS="local-process"
    NON_LANDING_REASON="no HOLO_PRODUCTION_BASE_URL/HOLO_VERIFY_BASE_URL/HOLO_SOAK_BASE_URL/PLATFORM_URL; local-process:// is non-landing"
fi
SERVICE_IDENTITY="${HOLO_SERVICE_IDENTITY:-${DEPLOYED_BASE_URL}}"
if [[ "$SERVICE_IDENTITY" == local-process://* ]] || [[ "$DEPLOYED_BASE_URL" == local-process://* ]]; then
  IDENTITY_CLASS="local-process"
  if [[ -z "$NON_LANDING_REASON" ]]; then
    NON_LANDING_REASON="service_identity is local-process:// (self-minted CLI theatre; non-landing)"
  fi
fi
if [[ "$DEPLOYED_BASE_URL" != local-process://* ]]; then
  export HOLO_PRODUCTION_BASE_URL="$DEPLOYED_BASE_URL"
fi
# Landing eligibility is finalized after the run (needs 8/8). Default false until then.
LANDING_ELIGIBLE=false

EVID_DIR="$SPRINT_DIR/.gate-evidence/$GATE_RUN_ID"
mkdir -p "$EVID_DIR" "$TMP_ROOT" "$TMP_ROOT_R2" \
  "$ROOT/.tmp/D06-02" "$ROOT/.tmp/D06-03" "$ROOT/.tmp/D06-04" "$ROOT/.tmp/D06-05" \
  "$ROOT/.tmp/REDHAT-FIX-S29-H03" "$TMP_ROOT/steps" "$TMP_ROOT_R2/steps"

# Prefer operator secrets when available (worktrees often lack local secrets.yaml).
if [[ -z "${HOLO_SECRETS_PATH:-}" ]]; then
  if [[ -f "$ROOT/services/platform/config/secrets.yaml" ]]; then
    export HOLO_SECRETS_PATH="$ROOT/services/platform/config/secrets.yaml"
  elif [[ -f "${HOME}/Projects/holocron/services/platform/config/secrets.yaml" ]]; then
    export HOLO_SECRETS_PATH="${HOME}/Projects/holocron/services/platform/config/secrets.yaml"
  fi
fi

# Load root .env when present (or primary checkout) for live credentials.
if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
elif [[ -f "${HOME}/Projects/holocron/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${HOME}/Projects/holocron/.env"
  set +a
fi

# The operator .env can name a cloud/dev deployment, but an explicitly
# configured self-hosted Convex endpoint must use the self-hosted CLI mode.
# Convex refuses to run when CONVEX_DEPLOYMENT is present alongside both
# self-hosted credentials, so clear only that conflicting selector after the
# .env load. The isolated go/no-go lane receives its own local deployment via
# HOLO_GO_NO_GO_CONVEX_DEPLOYMENT.
if [[ -n "${CONVEX_SELF_HOSTED_URL:-}" && -n "${CONVEX_SELF_HOSTED_ADMIN_KEY:-}" ]]; then
  unset CONVEX_DEPLOYMENT
fi

# A caller may request fresh temporary restore tuples for the exact-scope R2
# and fire-drill gates. This must run after .env is loaded so durable operator
# values cannot overwrite the minted tuples. The helper never logs values.
if [[ "${MINT_R2_PREFIX_RESTORE:-0}" == "1" ]]; then
  # shellcheck source=scripts/mint-r2-prefix-restore-env.sh
  source "$ROOT/scripts/mint-r2-prefix-restore-env.sh"
fi

echo "R3-C01 / R2-H01 human-gate re-run"
echo "  GATE_RUN_ID=$GATE_RUN_ID"
echo "  source_sha=$SOURCE_SHA  (git rev-parse HEAD)"
echo "  deployed_base_url=$DEPLOYED_BASE_URL"
echo "  service_identity=$SERVICE_IDENTITY"
echo "  identity_class=$IDENTITY_CLASS"
echo "  landing_eligible(pre-run)=$LANDING_ELIGIBLE  (true only after 8/8 + deployed identity + HEAD)"
echo "  evidence=$EVID_DIR"
echo "  started_at=$STARTED_AT"
if [[ -n "$NON_LANDING_REASON" ]]; then
  echo "  non_landing_reason=$NON_LANDING_REASON"
fi

python3 - "$PLAN" "$EVID_DIR/meta.json" "$GATE_RUN_ID" "$SOURCE_SHA" "$DEPLOYED_BASE_URL" \
  "$SERVICE_IDENTITY" "$STARTED_AT" "$HISTORICAL_STALE_RUN_ID" "$IDENTITY_CLASS" \
  "$NON_LANDING_REASON" "$RUNNER_PID" "$GATE_RUN_NONCE_SHA256" <<'PY'
import json, sys
from pathlib import Path
plan_path, meta_path = Path(sys.argv[1]), Path(sys.argv[2])
(
    run_id, sha, base, ident, started, stale, identity_class, non_landing,
    runner_pid, runner_nonce_sha256,
) = sys.argv[3:13]
assert len(sha) == 40 and all(c in "0123456789abcdef" for c in sha), f"HEAD sha invalid: {sha}"
plan = json.loads(plan_path.read_text())
steps = plan.get("steps") or []
assert [s["n"] for s in steps] == [1, 2, 3, 4, 5, 6, 7, 8], "gate-plan must have steps 1..8"
for s in steps:
    cmd = s.get("literal_cmd") or ""
    assert "bun services/platform/src/cli/holo.ts" in cmd, f"step {s['n']} missing dispatcher"
    assert s.get("method") == "real-cli", f"step {s['n']} method must be real-cli"
meta = {
    "task_id": "REDHAT-FIX-S29-R3-C01",
    "lineage_task_id": "REDHAT-FIX-S29-R2-H01",
    "run_id": run_id,
    "source_sha": sha,
    "git_sha": sha,
    "head_bound": True,
    "status": "in_progress",
    "runner_pid": int(runner_pid),
    "runner_nonce_sha256": runner_nonce_sha256,
    "active_step": 0,
    "deployed_base_url": base,
    "service_identity": ident,
    "identity_class": identity_class,
    "landing_eligible": False,  # finalized after steps
    "non_landing_reason": non_landing or None,
    "started_at": started,
    "historical_stale_run_id": stale,
    "historical_preserved": True,
    "gate_plan_remediation": plan.get("remediation"),
    "gate_plan_remediated_at": plan.get("remediated_at"),
    "sibling_blockers_for_full_6_of_6": [
        "REDHAT-FIX-S29-R2-C01",
        "REDHAT-FIX-S29-R2-C02",
        "REDHAT-FIX-S29-R2-C03",
        "REDHAT-FIX-S29-R2-C04",
        "REDHAT-FIX-S29-R2-H02",
        "REDHAT-FIX-S29-R2-H03",
        "REDHAT-FIX-S29-R2-H04",
        "REDHAT-FIX-S29-R3-C02",
        "REDHAT-FIX-S29-R3-C03",
    ],
    "notes": [
        "Honest re-run under current gate-plan predicates (H03 + C01 + R3-C01 HEAD bind).",
        "Never reuses 20260802T004525Z as pass evidence for remediated SHA.",
        "git_sha == git rev-parse HEAD required; local-process:// is non-landing.",
        "Full 8/8 may remain blocked until sibling remediations land — never forge.",
    ],
}
meta_path.write_text(json.dumps(meta, indent=2) + "\n")
print(f"wrote {meta_path}")
PY

finalize_aborted_run() {
  local rc=$?
  if [[ "${RUN_FINALIZED:-0}" != "1" && -f "$EVID_DIR/meta.json" ]]; then
    python3 - "$EVID_DIR/meta.json" "$rc" <<'PY'
import datetime, json, sys
from pathlib import Path

meta_path = Path(sys.argv[1])
meta = json.loads(meta_path.read_text())
if meta.get("status") == "in_progress":
    meta.update(
        {
            "status": "aborted",
            "finished_at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "abort_exit_code": int(sys.argv[2]),
            "landing_eligible": False,
        }
    )
    meta_path.write_text(json.dumps(meta, indent=2) + "\n")
PY
  fi
}
trap finalize_aborted_run EXIT

# Extract step N literal_cmd from plan
step_cmd() {
  local n="$1"
  jq -r --argjson n "$n" '.steps[] | select(.n==$n) | .literal_cmd' "$PLAN"
}

step_text() {
  local n="$1"
  jq -r --argjson n "$n" '.steps[] | select(.n==$n) | .text' "$PLAN"
}

# Per-step results accumulate for gate-results.json
declare -a STEP_RESULTS=()
steps_executed=0
steps_passed=0
steps_failed=0

run_step() {
  local n="$1"
  local cmd text log exit_file started ended rc tmo tmo_var cmd_pid waited
  rc=""
  cmd="$(step_cmd "$n")"
  text="$(step_text "$n")"
  log="$EVID_DIR/step${n}.log"
  exit_file="$EVID_DIR/step${n}.exit"
  started="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  {
    echo "@@GATE-META step=${n} task=REDHAT-FIX-S29-R3-C01 run_id=${GATE_RUN_ID} source_sha=${SOURCE_SHA} git_sha=${SOURCE_SHA} started_at=${started} deployed_base_url=${DEPLOYED_BASE_URL} identity_class=${IDENTITY_CLASS}@@"
    echo "CMD: ${cmd}"
    echo "---"
  } >"$log"

  # Resolve per-step timeout
  tmo_var="STEP_TIMEOUT_${n}"
  tmo="${!tmo_var:-$STEP_TIMEOUT_DEFAULT}"

  set +e
  # Real shell execution of the gate-plan literal_cmd (not a jq-only peek).
  # Prefer gtimeout/timeout when present; else background + wait with kill on expiry.
  if command -v gtimeout >/dev/null 2>&1; then
    gtimeout --signal=TERM --kill-after=15 "$tmo" bash -c "$cmd" >>"$log" 2>&1
    rc=$?
  elif command -v timeout >/dev/null 2>&1; then
    timeout --signal=TERM --kill-after=15 "$tmo" bash -c "$cmd" >>"$log" 2>&1
    rc=$?
  else
    bash -c "$cmd" >>"$log" 2>&1 &
    cmd_pid=$!
    waited=0
    while kill -0 "$cmd_pid" 2>/dev/null; do
      if [[ "$waited" -ge "$tmo" ]]; then
        echo "@@GATE-TIMEOUT=${tmo}s killing pid=${cmd_pid}@@" >>"$log"
        kill -TERM "$cmd_pid" 2>/dev/null || true
        sleep 2
        kill -KILL "$cmd_pid" 2>/dev/null || true
        pkill -P "$cmd_pid" 2>/dev/null || true
        wait "$cmd_pid" 2>/dev/null
        rc=124
        break
      fi
      sleep 1
      waited=$((waited + 1))
    done
    if [[ -z "${rc}" ]]; then
      wait "$cmd_pid"
      rc=$?
    fi
  fi
  set -e

  ended="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  {
    echo "---"
    echo "@@GATE-EXIT=${rc}@@"
    echo "@@GATE-ENDED=${ended}@@"
    echo "@@GATE-TIMEOUT-CAP=${tmo}s@@"
  } >>"$log"
  echo "$rc" >"$exit_file"

  # Copy log into .tmp evidence roots for worktree-local capture (R3-C01 + R2 lineage)
  cp "$log" "$TMP_ROOT/steps/step${n}.log" 2>/dev/null || true
  cp "$log" "$TMP_ROOT_R2/steps/step${n}.log" 2>/dev/null || true

  local result="fail"
  if [[ "$rc" -eq 0 ]]; then
    result="pass"
    steps_passed=$((steps_passed + 1))
  else
    steps_failed=$((steps_failed + 1))
  fi
  steps_executed=$((steps_executed + 1))

  echo "  step ${n}: result=${result} exit=${rc} log=${log}"

  # Accumulate JSON fragment via python later — store line records
  printf '%s\t%s\t%s\t%s\t%s\n' "$n" "$result" "$rc" "$log" "$text" >>"$TMP_ROOT/step-results.tsv"
}

: >"$TMP_ROOT/step-results.tsv"

# Carry freeze engagement into subsequent steps when freeze report proves env_value=1.
# cutover:freeze arms durable control-plane state in gate-plan step 5.
propagate_fence_env() {
  local freeze_report="$ROOT/.tmp/D06-03/freeze-report.json"
  local flip_report="$ROOT/.tmp/D06-05/flip-report.json"
  if [[ -f "$freeze_report" ]]; then
    local v
    v="$(jq -r '.env_value // empty' "$freeze_report" 2>/dev/null || true)"
    if [[ "$v" == "1" ]]; then
      export HOLO_MIGRATION_READ_ONLY=1
      echo "  (propagated HOLO_MIGRATION_READ_ONLY=1 from freeze-report)"
    fi
  fi
  if [[ -f "$flip_report" ]]; then
    local fv
    fv="$(jq -r '.env_value // empty' "$flip_report" 2>/dev/null || true)"
    if [[ "$fv" == "1" ]]; then
      export HOLO_MIGRATION_READ_ONLY=1
    fi
  fi
}

# Steps 6–7 must operate on the exact Postgres data plane served by the deployed
# four-service Compose generation. The generated deployment override publishes
# that database on loopback at app-port+1; credentials remain in the private
# 0600 runtime store and are captured into the child environment without logs.
activate_deployed_database() {
  local runtime_path
  runtime_path="${HOLO_RUNTIME_SECRETS_PATH:-${HOME}/.config/holocron/runtime/inference1.json}"
  if [[ ! -f "$runtime_path" ]]; then
    echo "error: deployed runtime secret store missing" >&2
    return 2
  fi
  DATABASE_URL="$(
    HOLO_GATE_RUNTIME_PATH="$runtime_path" HOLO_GATE_BASE_URL="$DEPLOYED_BASE_URL" bun -e '
      import { readFileSync } from "node:fs";
      import { statSync } from "node:fs";
      if ((statSync(process.env.HOLO_GATE_RUNTIME_PATH).mode & 0o777) !== 0o600) process.exit(2);
      const runtime = JSON.parse(readFileSync(process.env.HOLO_GATE_RUNTIME_PATH, "utf8"));
      const internal = new URL(runtime.DATABASE_URL);
      const deployed = new URL(process.env.HOLO_GATE_BASE_URL);
      const appPort = Number(deployed.port || (deployed.protocol === "https:" ? 443 : 80));
      if (!Number.isInteger(appPort) || appPort < 1 || appPort >= 65535) process.exit(2);
      internal.hostname = "127.0.0.1";
      internal.port = String(appPort + 1);
      process.stdout.write(internal.toString());
    '
  )"
  if [[ -z "$DATABASE_URL" ]]; then
    echo "error: failed to resolve deployed Postgres operator connection" >&2
    return 2
  fi
  export DATABASE_URL
  export HOLO_DANGEROUS_ALLOW_PROD_DB=1
  HOLO_ZERO_BASE_URL="$(
    HOLO_GATE_BASE_URL="$DEPLOYED_BASE_URL" bun -e '
      const deployed = new URL(process.env.HOLO_GATE_BASE_URL);
      const appPort = Number(deployed.port || (deployed.protocol === "https:" ? 443 : 80));
      if (!Number.isInteger(appPort) || appPort < 1 || appPort > 65533) process.exit(2);
      process.stdout.write(`http://127.0.0.1:${appPort + 2}`);
    '
  )"
  if [[ -z "$HOLO_ZERO_BASE_URL" ]]; then
    echo "error: failed to resolve deployed Zero operator endpoint" >&2
    return 2
  fi
  export HOLO_ZERO_BASE_URL
}

mark_active_step() {
  local n="$1"
  local tmo_var="STEP_TIMEOUT_${n}"
  local tmo="${!tmo_var:-$STEP_TIMEOUT_DEFAULT}"
  local deadline_epoch=$(( $(date +%s) + tmo + 60 ))
  python3 - "$EVID_DIR/meta.json" "$n" "$deadline_epoch" <<'PY'
import datetime, json, sys
from pathlib import Path

meta_path = Path(sys.argv[1])
meta = json.loads(meta_path.read_text())
if meta.get("status") != "in_progress":
    raise SystemExit("refuse: gate metadata is not in progress")
meta.update(
    {
        "active_step": int(sys.argv[2]),
        "active_step_started_at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "active_step_deadline_epoch": int(sys.argv[3]),
    }
)
meta_path.write_text(json.dumps(meta, indent=2) + "\n")
PY
}

echo "Executing 8 gate-plan steps (real-cli)..."
for n in 1 2 3 4 5 6 7 8; do
  echo "=== Step $n: $(step_text "$n") ==="
  mark_active_step "$n"
  # After combined freeze/drain step 5, carry fence into later CLI processes.
  if [[ "$n" -ge 6 ]]; then
    propagate_fence_env
    activate_deployed_database
  fi
  run_step "$n" || true
done

FINISHED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# Determine overall verdict — pass ONLY when all 8 pass (never forge).
VERDICT="fail"
if [[ "$steps_passed" -eq 8 && "$steps_executed" -eq 8 && "$steps_failed" -eq 0 ]]; then
  VERDICT="pass"
elif [[ "$steps_passed" -gt 0 ]]; then
  VERDICT="partial"
else
  VERDICT="fail"
fi

# Absolute refuse: never claim pass for historical stale run id.
if [[ "$GATE_RUN_ID" == "$HISTORICAL_STALE_RUN_ID" ]]; then
  VERDICT="fail"
fi

# R3-C01 landing eligibility: 8/8 + HEAD-bound + non-local-process deployed identity.
LANDING_ELIGIBLE=false
if [[ "$VERDICT" == "pass" \
   && "$steps_passed" -eq 8 \
   && "$IDENTITY_CLASS" != "local-process" \
   && "$DEPLOYED_BASE_URL" != local-process://* \
   && "$SERVICE_IDENTITY" != local-process://* \
   && "$SOURCE_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  LANDING_ELIGIBLE=true
  NON_LANDING_REASON=""
else
  if [[ "$IDENTITY_CLASS" == "local-process" || "$DEPLOYED_BASE_URL" == local-process://* ]]; then
    NON_LANDING_REASON="${NON_LANDING_REASON:-local-process:// identity is non-landing for cutover approval (R3-C01)}"
  elif [[ "$VERDICT" != "pass" || "$steps_passed" -ne 8 ]]; then
    NON_LANDING_REASON="${NON_LANDING_REASON:-human-gate not 8/8 under current oracles (honest partial/fail)}"
  fi
fi

python3 - "$RESULTS" "$RESULTS_MD" "$TMP_ROOT/step-results.tsv" \
  "$GATE_RUN_ID" "$SOURCE_SHA" "$DEPLOYED_BASE_URL" "$SERVICE_IDENTITY" \
  "$STARTED_AT" "$FINISHED_AT" "$VERDICT" "$steps_executed" "$steps_passed" \
  "$steps_failed" "$WRITE_GATE_RESULTS" "$HISTORICAL_STALE_RUN_ID" "$EVID_DIR" \
  "$SPRINT_DIR" "$IDENTITY_CLASS" "$LANDING_ELIGIBLE" "$NON_LANDING_REASON" \
  "$TMP_ROOT" <<'PY'
import json, sys
from pathlib import Path

(
    results_path,
    results_md_path,
    tsv_path,
    run_id,
    source_sha,
    deployed_base_url,
    service_identity,
    started_at,
    finished_at,
    verdict,
    steps_executed,
    steps_passed,
    steps_failed,
    write_gate_results,
    stale_id,
    evid_dir,
    sprint_dir,
    identity_class,
    landing_eligible_s,
    non_landing_reason,
    tmp_root,
) = sys.argv[1:]

steps_executed = int(steps_executed)
steps_passed = int(steps_passed)
steps_failed = int(steps_failed)
write = write_gate_results == "1"
landing_eligible = landing_eligible_s == "true"
assert len(source_sha) == 40 and all(c in "0123456789abcdef" for c in source_sha), (
    f"R3-C01 refuse: source_sha must be 40-char HEAD, got {source_sha!r}"
)

steps = []
for line in Path(tsv_path).read_text().splitlines():
    if not line.strip():
        continue
    n_s, result, rc, log, text = line.split("\t", 4)
    n = int(n_s)
    steps.append(
        {
            "n": n,
            "text": text,
            "type": "terminal",
            "executed": True,
            "result": result,
            "evidence": f"exit={rc}",
            "exit_code": int(rc),
            "log": str(Path(log).relative_to(Path(sprint_dir).parents[4]) if False else log).replace(
                str(Path.cwd()) + "/", ""
            )
            if log.startswith(str(Path.cwd()))
            else log,
        }
    )

# Normalize log paths to repo-relative when under repo
repo = Path.cwd()
for s in steps:
    lp = Path(s["log"])
    try:
        s["log"] = str(lp.resolve().relative_to(repo.resolve()))
    except Exception:
        s["log"] = str(lp)

# Fail-closed: pass only when all eight green under current oracles
if verdict == "pass":
    assert steps_passed == 8 and steps_executed == 8 and steps_failed == 0
    assert run_id != stale_id
    assert all(s["result"] == "pass" and s["executed"] for s in steps)

# Never present stale historical id as current pass
if run_id == stale_id and verdict == "pass":
    raise SystemExit("refuse: historical false-pass run_id cannot be current pass")

# R3-C01: never mark landing_eligible under local-process theatre
if identity_class == "local-process" or str(deployed_base_url).startswith("local-process://"):
    landing_eligible = False
    if not non_landing_reason:
        non_landing_reason = (
            "local-process:// identity is non-landing for cutover approval (R3-C01)"
        )
if landing_eligible and not (
    verdict == "pass" and steps_passed == 8 and identity_class != "local-process"
):
    raise SystemExit("refuse: landing_eligible=true without 8/8 deployed identity")

payload = {
    "sprint": "sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip",
    "sprint_identity": {
        "resolved_sprint_path": str(Path(sprint_dir)),
        "sprint_slug": "sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip",
    },
    "run_id": run_id,
    "verdict": verdict,
    "steps_total": 8,
    "steps_executed": steps_executed,
    "steps_passed": steps_passed,
    "steps_failed": steps_failed,
    "ui_driver": "none",
    "exec_surface": "agent-real-cli",
    "runner": "real-cli",
    "source_sha": source_sha,
    "git_sha": source_sha,
    "deployed_base_url": deployed_base_url,
    "service_identity": service_identity,
    "identity_class": identity_class,
    "landing_eligible": landing_eligible,
    "started_at": started_at,
    "finished_at": finished_at,
    "written_at": finished_at,
    "meta": {
        "task_id": "REDHAT-FIX-S29-R3-C01",
        "lineage_task_id": "REDHAT-FIX-S29-R2-H01",
        "source_sha": source_sha,
        "git_sha": source_sha,
        "head_bound": True,
        "deployed_base_url": deployed_base_url,
        "service_identity": service_identity,
        "identity_class": identity_class,
        "landing_eligible": landing_eligible,
        "non_landing_reason": non_landing_reason or None,
        "historical_stale_run_id_preserved": stale_id,
        "gate_plan_predicates": "REDHAT-FIX-S29-H03 + REDHAT-FIX-S29-C01 + R3-C01 HEAD bind",
        "sibling_blockers_for_full_8_of_8": [
            "REDHAT-FIX-S29-R2-C01",
            "REDHAT-FIX-S29-R2-C02",
            "REDHAT-FIX-S29-R2-C03",
            "REDHAT-FIX-S29-R2-C04",
            "REDHAT-FIX-S29-R2-H02",
            "REDHAT-FIX-S29-R2-H03",
            "REDHAT-FIX-S29-R2-H04",
            "REDHAT-FIX-S29-R3-C02",
            "REDHAT-FIX-S29-R3-C03",
        ],
        "honest_note": (
            "Verdict is honest per-step under current gate-plan oracles. "
            "git_sha equals git rev-parse HEAD. "
            "local-process:// is non-landing; 8/8 against deployed HTTP identity required for landing. "
            "Full 8/8 is not claimed unless all eight current oracles actually pass."
        ),
    },
    "steps": steps,
}

out_tmp = Path(tmp_root) / "gate-results.json"
out_tmp.parent.mkdir(parents=True, exist_ok=True)
out_tmp.write_text(json.dumps(payload, indent=2) + "\n")
# Mirror for R2-H01 lineage consumers
r2_tmp = Path(".tmp/REDHAT-FIX-S29-R2-H01")
r2_tmp.mkdir(parents=True, exist_ok=True)
(r2_tmp / "gate-results.json").write_text(json.dumps(payload, indent=2) + "\n")

# Close the runner-owned provisional state before publishing canonical final
# results. A crash between these writes fails closed: completed metadata without
# final results cannot use the step-1 in-progress freshness path.
meta_path = Path(evid_dir) / "meta.json"
meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}
meta.update(
    {
        "status": "complete",
        "finished_at": finished_at,
        "verdict": verdict,
        "steps_executed": steps_executed,
        "steps_passed": steps_passed,
        "steps_failed": steps_failed,
        "landing_eligible": landing_eligible,
        "identity_class": identity_class,
        "non_landing_reason": non_landing_reason or None,
        "git_sha": source_sha,
        "source_sha": source_sha,
        "head_bound": True,
    }
)
meta_path.write_text(json.dumps(meta, indent=2) + "\n")

if write:
    Path(results_path).write_text(json.dumps(payload, indent=2) + "\n")

# GATE-RESULTS.md
rows = "\n".join(
    f"| {s['n']} | {s['text'][:60]} | {s['result']} |" for s in steps
)
if verdict == "pass" and landing_eligible:
    header = "## ✅ VERIFIED — human-test assert exit 0; 8/8 steps ran & passed (deployed identity; landing-eligible)"
elif verdict == "pass" and not landing_eligible:
    header = "## ⚠️ PASS (non-landing) — 8/8 under local-process or non-deployed identity (R3-C01 refuses landing)"
elif verdict == "partial":
    header = f"## ⚠️ PARTIAL — {steps_passed}/8 steps passed under current oracles (honest fail on rest; non-landing)"
else:
    header = f"## ❌ FAIL — {steps_passed}/8 steps passed; re-run under remediated gate-plan (D06-07 / R3-C01 / R2-H01)"

landing_line = (
    f"**Landing eligible:** `{str(landing_eligible).lower()}` "
    f"(identity_class=`{identity_class}`)"
)
if non_landing_reason:
    landing_line += f"\n**Non-landing reason:** {non_landing_reason}"

md = f"""# Gate Results: sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip

{header}
**Date:** {finished_at}
**Verdict:** {verdict}
**Run ID:** {run_id}
**Source SHA (git rev-parse HEAD):** `{source_sha}`
**git_sha:** `{source_sha}`
**Deployed identity:** `{deployed_base_url}` / `{service_identity}`
{landing_line}
**Task:** REDHAT-FIX-S29-R3-C01 (HEAD-bound re-run; lineage R2-H01; historical false-pass `{stale_id}` preserved under `.gate-evidence/{stale_id}/`)

## Summary

| # | Step | Result |
|---|------|--------|
{rows}

**Evidence:** `.gate-evidence/{run_id}/step{{1..8}}.log`

**Predicates:** current eight-step `gate-plan.json` (D06-07 + H03 + C01 + R3-C01) — steps 2–4 require exact external deployment/restart/identity; step7 requires non-null `toolsPassed==toolsTotal`; evidence `git_sha` must equal worktree HEAD.

**Sibling dependency (full 8/8):** cutover remediations may still block end-to-end green; this re-run records honest per-step failure rather than reusing `{stale_id}` theatre or ancestor SHAs.

**Gate:** freeze → drain → ETL → flip → every write returns `migration_read_only`.
"""

md_tmp = Path(tmp_root) / "GATE-RESULTS.md"
md_tmp.write_text(md)
(r2_tmp / "GATE-RESULTS.md").write_text(md)
if write:
    Path(results_md_path).write_text(md)

summary = {
    "run_id": run_id,
    "verdict": verdict,
    "steps_passed": steps_passed,
    "steps_executed": steps_executed,
    "steps_failed": steps_failed,
    "source_sha": source_sha,
    "git_sha": source_sha,
    "identity_class": identity_class,
    "landing_eligible": landing_eligible,
    "non_landing_reason": non_landing_reason or None,
    "wrote_gate_results": write,
    "evidence_dir": evid_dir,
}
print(json.dumps(summary, indent=2))
(Path(tmp_root) / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")
PY

RUN_FINALIZED=1

echo "Done. verdict=$VERDICT steps_passed=$steps_passed/8 run_id=$GATE_RUN_ID git_sha=$SOURCE_SHA landing_eligible=$LANDING_ELIGIBLE identity_class=$IDENTITY_CLASS"
# Exit non-zero only if harness itself failed to run (always exit 0 after honest record
# so CI can inspect gate-results; operator can check verdict).
exit 0
