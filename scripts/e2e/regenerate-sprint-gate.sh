#!/usr/bin/env bash
# REDHAT-FIX-H1 — regenerate a Sprint's gate-results.json from current main.
#
# Independently recomputes the Human Testing Gate verdict per step from REAL
# evidence files, never copying sprint-goal-state.json. Each step records a
# PASS / PARTIAL / FAIL verdict plus a concrete evidence_path. committed_sha is
# the evidence commit, while tested_sha is the source SHA exercised by real CI.
# They may differ when evidence is committed after CI, but the provenance and
# capstone must agree on tested_sha.
#
# Usage:
#   regenerate-sprint-gate.sh sprint-20
set -Eeuo pipefail

sprint_id="${1:?usage: regenerate-sprint-gate.sh <sprint-id-or-dir>}"
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

sprint_dir=""
for cand in \
  "$repo_root/.spec/prds/mk6-migration/tasks/sprint-${sprint_id#sprint-}-"* \
  "$repo_root/.spec/prds/mk6-migration/tasks/${sprint_id}"-* ; do
  if [[ -d "$cand" ]]; then sprint_dir="$cand"; break; fi
done
[[ -n "$sprint_dir" ]] || { echo "regenerate-sprint-gate: no sprint dir for $sprint_id" >&2; exit 2; }

artifact_dir="${E2E_ARTIFACT_DIR:-$repo_root/.tmp/maestro-reference-flow}"
db_url="${DATABASE_URL:-}"
conv_id="${REFERENCE_CONVERSATION_ID:-00000000-0000-0000-0000-000000000020}"
committed_sha="$(git -C "$repo_root" rev-parse HEAD 2>/dev/null || echo unknown)"
expected_tested_sha="${EXPECTED_TESTED_SHA:-${CI_TESTED_SHA:-$committed_sha}}"
if [[ ! "$expected_tested_sha" =~ ^[0-9a-fA-F]{40}$ ]]; then
  echo "regenerate-sprint-gate: EXPECTED_TESTED_SHA must be a 40-character hex SHA" >&2
  exit 2
fi
generated_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

junit="$artifact_dir/junit.xml"
junit_failures=-1
junit_sha=""
if [[ -s "$junit" ]]; then
  f="$(sed -En 's/.*<testsuite[^>]* failures="([0-9]+)".*/\1/p' "$junit" | head -1)"
  [[ -n "$f" && "$f" =~ ^[0-9]+$ ]] && junit_failures="$f"
  junit_sha="$(shasum -a 256 "$junit" | awk '{print $1}')"
fi

# GATE-FIX-G5 / GATE-FIX-G2 — this-cycle provenance honesty.
# A historical SUCCESS junit (official11 checksum a9eb6f7a…) copied into
# $artifact_dir/junit.xml must NEVER force step1 PASS while failed-this-cycle
# still reports failures>0. A genuine this-cycle green junit (different sha)
# MAY PASS even if failed-this-cycle retains prior crash quarantine evidence.
OFFICIAL11_SUCCESS_SHA="a9eb6f7adb5771585d6d4efae16a7f5123bd6f6c2694923e9ef7269ece15738d"
failed_cycle_junit="$artifact_dir/failed-this-cycle/junit.xml"
failed_cycle_failures=-1
if [[ -s "$failed_cycle_junit" ]]; then
  fcf="$(sed -En 's/.*<testsuite[^>]* failures="([0-9]+)".*/\1/p' "$failed_cycle_junit" | head -1)"
  [[ -n "$fcf" && "$fcf" =~ ^[0-9]+$ ]] && failed_cycle_failures="$fcf"
fi

# Step verdict derivations — each backed by a real file or live query.
# Step 1: cold boot open (junit failures==0) with this-cycle honesty.
# Refuse PASS only when live junit is the historical official11 SUCCESS byte
# identity AND failed-this-cycle still reports failures>0 (substitution attack).
# Genuine this-cycle green (failures=0, sha != official11) PASSes.
s1="FAIL"; s1ev="$junit"
if [[ "$junit_failures" -eq 0 && -n "$junit_sha" && "$junit_sha" == "$OFFICIAL11_SUCCESS_SHA" && "$failed_cycle_failures" -gt 0 ]]; then
  s1="FAIL"
  s1ev="$failed_cycle_junit failures=${failed_cycle_failures} (historical official11 SUCCESS substitution rejected; this-cycle fail overrides)"
elif [[ "$junit_failures" -eq 0 ]]; then
  s1="PASS"
  s1ev="$junit"
elif [[ "$failed_cycle_failures" -gt 0 ]]; then
  s1="FAIL"
  s1ev="$failed_cycle_junit failures=${failed_cycle_failures} (this-cycle fail)"
fi

# Step 2: send through fleet/Postgres (Postgres user+agent rows)
s2="FAIL"; s2ev="(none)"
if [[ -n "$db_url" && "$db_url" == *holocron_nonprod* ]]; then
  cnt="$(psql "$db_url" -t -A -c "select count(*) from chat_messages where conversation_id='${conv_id}' and role in ('user','agent');" 2>/dev/null || echo 0)"
  s2ev="psql chat_messages conversation=${conv_id} count=${cnt}"
  [[ "$cnt" =~ ^[0-9]+$ && "$cnt" -ge 2 ]] && s2="PASS" || s2="PARTIAL"
else
  ci_capstone="$artifact_dir/capstone-verdict.json"
  ci_provenance="$sprint_dir/ci-run-provenance.json"
  if [[ -s "$ci_capstone" && -s "$ci_provenance" ]]; then
    ci_gate="$(jq -r '.coldboot_gate // "red"' "$ci_capstone" 2>/dev/null || echo red)"
    ci_pg_count="$(jq -r '.postgres_agent_count // 0' "$ci_capstone" 2>/dev/null || echo 0)"
    ci_pg_content_len="$(jq -r '.postgres_agent_content_len // 0' "$ci_capstone" 2>/dev/null || echo 0)"
    ci_capstone_sha="$(jq -r '.committed_sha // empty' "$ci_capstone" 2>/dev/null || true)"
    ci_provenance_sha="$(jq -r '.committed_sha // empty' "$ci_provenance" 2>/dev/null || true)"
    ci_conclusion="$(jq -r '.conclusion // empty' "$ci_provenance" 2>/dev/null || true)"
    ci_provenance_head_sha="$(jq -r '.head_sha // empty' "$ci_provenance" 2>/dev/null || true)"
    if [[ "$ci_gate" == "green" && "$ci_conclusion" == "success" && "$ci_capstone_sha" == "$expected_tested_sha" && "$ci_provenance_sha" == "$expected_tested_sha" && "$ci_provenance_head_sha" == "$expected_tested_sha" && "$ci_pg_count" =~ ^[0-9]+$ && "$ci_pg_count" -ge 1 && "$ci_pg_content_len" =~ ^[0-9]+$ && "$ci_pg_content_len" -ge 1 ]]; then
      s2="PASS"
      s2ev="$ci_capstone real CI Postgres evidence conversation=${conv_id} agent_count=${ci_pg_count} content_len=${ci_pg_content_len}"
    else
      s2="FAIL"
      s2ev="DATABASE_URL unavailable and provenance-bound CI Postgres capstone evidence is incomplete"
    fi
  else
    s2="FAIL"; s2ev="DATABASE_URL not holocron_nonprod; cannot verify"
  fi
fi

# Step 3: durable Zero reply — NEVER PASS from Zero-only while junit red.
# Require capstone green (which itself requires junit_failures==0 + media + PG + Zero)
# OR (junit_failures==0 AND zero_agent_content_len>=1). Zero-only while junit red → PARTIAL/FAIL.
s3="FAIL"; s3ev="$artifact_dir/capstone-verdict.json"
if [[ -s "$artifact_dir/capstone-verdict.json" ]]; then
  gate="$(jq -r '.coldboot_gate // "red"' "$artifact_dir/capstone-verdict.json" 2>/dev/null || echo red)"
  zacl="$(jq -r '.zero_agent_content_len // 0' "$artifact_dir/capstone-verdict.json" 2>/dev/null || echo 0)"
  cap_jf="$(jq -r '.junit_failures // -1' "$artifact_dir/capstone-verdict.json" 2>/dev/null || echo -1)"
  if [[ "$gate" == "green" ]]; then
    s3="PASS"
    s3ev="$artifact_dir/capstone-verdict.json coldboot_gate=green"
  elif [[ "$junit_failures" -eq 0 && "$zacl" =~ ^[0-9]+$ && "$zacl" -ge 1 ]]; then
    s3="PASS"
    s3ev="$artifact_dir/capstone-verdict.json junit_failures=0 zero_agent_content_len=${zacl}"
  elif [[ "$zacl" =~ ^[0-9]+$ && "$zacl" -ge 1 && "$junit_failures" -ne 0 ]]; then
    s3="PARTIAL"
    s3ev="$artifact_dir/capstone-verdict.json zero_only_while_junit_red junit_failures=${junit_failures} cap_jf=${cap_jf}"
  else
    s3="PARTIAL"
    s3ev="$artifact_dir/capstone-verdict.json coldboot_gate=${gate} zero_agent_content_len=${zacl}"
  fi
else
  s3="FAIL"; s3ev="capstone-verdict.json absent (run scripts/e2e/capstone-verdict.sh)"
fi

# Step 4: CI artifacts (real CI provenance only — GATE-FIX-G4 / REDHAT-FIX-H2).
# PASS only from real CI provenance with conclusion=success + run_id + head_sha +
# artifact_sha256. Probe-green alone MUST NOT flip step4 PASS.
# Dual-path (prefer committed H2 path, then artifact-dir):
#   1) $sprint_dir/ci-run-provenance.json
#   2) $artifact_dir/ci-provenance.json
#   3) $artifact_dir/ci-run-provenance.json
s4="FAIL"
s4ev="ci-run-provenance.json / ci-provenance.json absent (GATE-FIX-G4: dispatch ci-e2e.yml + capture-ci-provenance.sh)"
s4_prov=""
for cand in \
  "$sprint_dir/ci-run-provenance.json" \
  "$artifact_dir/ci-provenance.json" \
  "$artifact_dir/ci-run-provenance.json"; do
  if [[ -s "$cand" ]]; then
    s4_prov="$cand"
    break
  fi
done
if [[ -n "$s4_prov" ]]; then
  # Validate required CI fields — conclusion alone is insufficient.
  s4_eval="$(python3 - "$s4_prov" "$expected_tested_sha" <<'PY'
import json, re, sys
path = sys.argv[1]
expected = sys.argv[2]
try:
    d = json.load(open(path, encoding="utf-8"))
except Exception as e:
    print(f"FAIL\t{path} invalid-json ({e})")
    raise SystemExit(0)
run_id = d.get("run_id")
try:
    run_id_n = int(run_id)
except Exception:
    run_id_n = 0
head = str(d.get("head_sha") or "")
committed = str(d.get("committed_sha") or "")
tested = str(d.get("tested_sha") or "")
art = str(d.get("artifact_sha256") or "")
concl = str(d.get("conclusion") or "missing")
ok = (
    run_id_n > 0
    and concl == "success"
    and bool(re.fullmatch(r"[0-9a-fA-F]{40}", head))
    and head == committed == expected
    and (not tested or tested == expected)
    and bool(re.fullmatch(r"[0-9a-fA-F]{64}", art))
)
if ok:
    print(f"PASS\t{path} conclusion=success run_id={run_id_n} tested_sha={head[:12]}…")
else:
    print(
        f"FAIL\t{path} incomplete-or-unsuccessful "
        f"conclusion={concl} run_id={run_id_n} "
        f"head_sha_len={len(head)} committed_sha_matches_expected={committed == expected} "
        f"tested_sha_matches_expected={not tested or tested == expected} artifact_sha256_len={len(art)}"
    )
PY
)"
  s4="${s4_eval%%$'\t'*}"
  s4ev="${s4_eval#*$'\t'}"
  [[ "$s4" == "PASS" || "$s4" == "FAIL" ]] || { s4="FAIL"; s4ev="$s4_prov unparseable"; }
else
  s4="FAIL"
  s4ev="ci-run-provenance.json / ci-provenance.json absent (GATE-FIX-G4: dispatch ci-e2e.yml + capture-ci-provenance.sh)"
fi

# Step 5: missing build fails closed (D03-01 PLATFORM_IT suite result)
# GATE-FIX-G6 — PASS only with dual evidence:
#   1) step5-harness-suite.json with exitCode==0 (PLATFORM_IT suite green)
#   2) step5-missing-build-run.json with exitCode!=0 and junit_present=false
#      (or recorded artifact_dir has no junit.xml)
# File existence alone → PARTIAL. Suite-only or missing-build-only → PARTIAL.
# NEVER PASS from file existence alone; NEVER require full Maestro cold-boot green.
s5="FAIL"
s5ev="$repo_root/tests/integration/sprint20-maestro-harness.test.ts"
suite_ev="$artifact_dir/step5-harness-suite.json"
miss_ev="$artifact_dir/step5-missing-build-run.json"
suite_ok=0
miss_ok=0
if [[ -s "$suite_ev" ]]; then
  suite_exit="$(jq -r '.exitCode // .exit_code // 1' "$suite_ev" 2>/dev/null || echo 1)"
  [[ "$suite_exit" == "0" ]] && suite_ok=1
fi
if [[ -s "$miss_ev" ]]; then
  miss_exit="$(jq -r '.exitCode // .exit_code // 0' "$miss_ev" 2>/dev/null || echo 0)"
  junit_present="$(jq -r '.junit_present // .junitPresent // empty' "$miss_ev" 2>/dev/null || true)"
  miss_art="$(jq -r '.artifact_dir // empty' "$miss_ev" 2>/dev/null || true)"
  junit_absent=0
  if [[ "$junit_present" == "false" ]]; then
    junit_absent=1
  elif [[ -n "$miss_art" && ! -f "$miss_art/junit.xml" ]]; then
    junit_absent=1
  elif [[ ! -f "$artifact_dir/junit.xml" && -z "$junit_present" ]]; then
    junit_absent=1
  fi
  if [[ "$miss_exit" != "0" && "$junit_absent" == "1" ]]; then
    miss_ok=1
  fi
fi
if [[ "$suite_ok" == "1" && "$miss_ok" == "1" ]]; then
  s5="PASS"
  s5ev="suite=$suite_ev exit=0 AND missing-build=$miss_ev no-junit"
elif [[ "$suite_ok" == "1" || "$miss_ok" == "1" ]]; then
  s5="PARTIAL"
  s5ev="partial dual evidence suite_ok=$suite_ok miss_ok=$miss_ok suite=$suite_ev miss=$miss_ev"
elif [[ -f "$s5ev" ]]; then
  s5="PARTIAL"
  s5ev="$s5ev (file only; dual evidence required for PASS)"
fi

# Step 6: namespace reset known seed (namespace-reset.json ok:true + fingerprint)
s6="FAIL"; s6ev="$artifact_dir/namespace-reset.json"
if [[ -s "$s6ev" ]]; then
  ok="$(jq -r '.ok // false' "$s6ev" 2>/dev/null || echo false)"
  s6ev="$artifact_dir/namespace-reset.json ok=${ok}"
  [[ "$ok" == "true" ]] && s6="PASS" || s6="FAIL"
fi

# Atomic exclusive write: concurrent PLATFORM_IT regenerators previously interleaved
# non-atomic `jq > gate-results.json` producing Extra data / truncated mid-object
# (e.g. "pace-reset.json ok=true" glued after a closed object). flock + tmp+mv.
gate_out="$sprint_dir/gate-results.json"
gate_tmp="$sprint_dir/gate-results.json.tmp.$$"
gate_lock="$sprint_dir/gate-results.json.lock"

write_gate_json() {
  jq -n \
    --arg sha "$committed_sha" \
    --arg tested "$expected_tested_sha" \
    --arg at "$generated_at" \
    --arg sprint "$(basename "$sprint_dir")" \
    --arg artifact_dir "$artifact_dir" \
    --arg s1 "$s1" --arg s1ev "$s1ev" \
    --arg s2 "$s2" --arg s2ev "$s2ev" \
    --arg s3 "$s3" --arg s3ev "$s3ev" \
    --arg s4 "$s4" --arg s4ev "$s4ev" \
    --arg s5 "$s5" --arg s5ev "$s5ev" \
    --arg s6 "$s6" --arg s6ev "$s6ev" \
    '{committed_sha:$sha, tested_sha:$tested, generated_at:$at, sprint:$sprint, artifact_dir:$artifact_dir,
      steps:[
        {n:1, text:"Cold-boot Maestro reference flow on named iOS Simulator", verdict:$s1, evidence_path:$s1ev},
        {n:2, text:"Send chat message through fleet to Postgres", verdict:$s2, evidence_path:$s2ev},
        {n:3, text:"Observe durable Zero-synced reply (screenshot)", verdict:$s3, evidence_path:$s3ev},
        {n:4, text:"CI artifacts (JUnit/log/video) attached to e2e run", verdict:$s4, evidence_path:$s4ev},
        {n:5, text:"Missing Expo build fails closed (not a false pass)", verdict:$s5, evidence_path:$s5ev},
        {n:6, text:"holo namespace reset brings namespace to known seed", verdict:$s6, evidence_path:$s6ev}
      ]}' >"$gate_tmp"
  # Validate before publish — refuse to leave unparseable JSON on disk.
  python3 -c 'import json,sys; json.load(open(sys.argv[1]))' "$gate_tmp" || {
    echo "regenerate-sprint-gate: produced invalid JSON; aborting publish" >&2
    rm -f "$gate_tmp"
    exit 3
  }
  mv -f "$gate_tmp" "$gate_out"
}

if command -v flock >/dev/null 2>&1; then
  (
    flock -w 30 9 || { echo "regenerate-sprint-gate: could not acquire lock $gate_lock" >&2; exit 4; }
    write_gate_json
  ) 9>"$gate_lock"
else
  # macOS may lack util-linux flock; still atomic via tmp+mv.
  write_gate_json
fi

# Idempotent re-run: committed_sha is always recomputed.
cat "$gate_out"
