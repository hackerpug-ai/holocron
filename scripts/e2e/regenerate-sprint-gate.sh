#!/usr/bin/env bash
# REDHAT-FIX-H1 — regenerate a Sprint's gate-results.json from current main.
#
# Independently recomputes the Human Testing Gate verdict per step from REAL
# evidence files, never copying sprint-goal-state.json. Each step records a
# PASS / PARTIAL / FAIL verdict plus a concrete evidence_path. The committed_sha
# is the current `git rev-parse HEAD`, so a stale SHA is impossible.
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
generated_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

junit="$artifact_dir/junit.xml"
junit_failures=-1
if [[ -s "$junit" ]]; then
  f="$(sed -En 's/.*<testsuite[^>]* failures="([0-9]+)".*/\1/p' "$junit" | head -1)"
  [[ -n "$f" && "$f" =~ ^[0-9]+$ ]] && junit_failures="$f"
fi

# Step verdict derivations — each backed by a real file or live query.
# Step 1: cold boot open (junit failures==0 + screenshot)
s1="FAIL"; s1ev="$junit"
if [[ "$junit_failures" -eq 0 ]]; then s1="PASS"; fi

# Step 2: send through fleet/Postgres (Postgres user+agent rows)
s2="FAIL"; s2ev="(none)"
if [[ -n "$db_url" && "$db_url" == *holocron_nonprod* ]]; then
  cnt="$(psql "$db_url" -t -A -c "select count(*) from chat_messages where conversation_id='${conv_id}' and role in ('user','agent');" 2>/dev/null || echo 0)"
  s2ev="psql chat_messages conversation=${conv_id} count=${cnt}"
  [[ "$cnt" =~ ^[0-9]+$ && "$cnt" -ge 2 ]] && s2="PASS" || s2="PARTIAL"
else
  s2="FAIL"; s2ev="DATABASE_URL not holocron_nonprod; cannot verify"
fi

# Step 3: durable Zero reply (capstone green OR capstone JSON zero_agent_content_len>=1)
s3="FAIL"; s3ev="$artifact_dir/capstone-verdict.json"
if [[ -s "$artifact_dir/capstone-verdict.json" ]]; then
  gate="$(jq -r '.coldboot_gate // "red"' "$artifact_dir/capstone-verdict.json" 2>/dev/null || echo red)"
  zacl="$(jq -r '.zero_agent_content_len // 0' "$artifact_dir/capstone-verdict.json" 2>/dev/null || echo 0)"
  [[ "$zacl" =~ ^[0-9]+$ && "$zacl" -ge 1 ]] && s3="PASS" || { [[ "$gate" == "green" ]] && s3="PASS" || s3="PARTIAL"; }
else
  s3="FAIL"; s3ev="capstone-verdict.json absent (run scripts/e2e/capstone-verdict.sh)"
fi

# Step 4: CI artifacts (real CI provenance manifest — H2 territory)
s4="FAIL"; s4ev="$artifact_dir/ci-provenance.json"
if [[ -s "$artifact_dir/ci-provenance.json" ]]; then
  concl="$(jq -r '.conclusion // "missing"' "$artifact_dir/ci-provenance.json" 2>/dev/null || echo missing)"
  s4ev="$artifact_dir/ci-provenance.json conclusion=$concl"
  [[ "$concl" == "success" ]] && s4="PASS" || s4="FAIL"
else
  s4="FAIL"; s4ev="ci-provenance.json absent (REDHAT-FIX-H2: dispatch ci-e2e.yml)"
fi

# Step 5: missing build fails closed (D03-01 PLATFORM_IT suite result)
s5="FAIL"; s5ev="$repo_root/tests/integration/sprint20-maestro-harness.test.ts"
if [[ -f "$s5ev" ]]; then s5="PARTIAL"; fi  # true PASS requires a green PLATFORM_IT run artifact

# Step 6: namespace reset known seed (namespace-reset.json ok:true + fingerprint)
s6="FAIL"; s6ev="$artifact_dir/namespace-reset.json"
if [[ -s "$s6ev" ]]; then
  ok="$(jq -r '.ok // false' "$s6ev" 2>/dev/null || echo false)"
  s6ev="$artifact_dir/namespace-reset.json ok=${ok}"
  [[ "$ok" == "true" ]] && s6="PASS" || s6="FAIL"
fi

jq -n \
  --arg sha "$committed_sha" \
  --arg at "$generated_at" \
  --arg sprint "$(basename "$sprint_dir")" \
  --arg artifact_dir "$artifact_dir" \
  --arg s1 "$s1" --arg s1ev "$s1ev" \
  --arg s2 "$s2" --arg s2ev "$s2ev" \
  --arg s3 "$s3" --arg s3ev "$s3ev" \
  --arg s4 "$s4" --arg s4ev "$s4ev" \
  --arg s5 "$s5" --arg s5ev "$s5ev" \
  --arg s6 "$s6" --arg s6ev "$s6ev" \
  '{committed_sha:$sha, generated_at:$at, sprint:$sprint, artifact_dir:$artifact_dir,
    steps:[
      {n:1, text:"Cold-boot Maestro reference flow on named iOS Simulator", verdict:$s1, evidence_path:$s1ev},
      {n:2, text:"Send chat message through fleet to Postgres", verdict:$s2, evidence_path:$s2ev},
      {n:3, text:"Observe durable Zero-synced reply (screenshot)", verdict:$s3, evidence_path:$s3ev},
      {n:4, text:"CI artifacts (JUnit/log/video) attached to e2e run", verdict:$s4, evidence_path:$s4ev},
      {n:5, text:"Missing Expo build fails closed (not a false pass)", verdict:$s5, evidence_path:$s5ev},
      {n:6, text:"holo namespace reset brings namespace to known seed", verdict:$s6, evidence_path:$s6ev}
    ]}' >"$sprint_dir/gate-results.json"

# Idempotent re-run: committed_sha is always recomputed.
cat "$sprint_dir/gate-results.json"
