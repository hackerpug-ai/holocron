#!/usr/bin/env bash
# GATE-FIX-G4 / REDHAT-FIX-H2 — Capture real ci-e2e run provenance after success.
#
# Usage:
#   scripts/e2e/capture-ci-provenance.sh --run-id <id> [--expected-sha <sha>] [--out path] [--download-dir path]
#   scripts/e2e/capture-ci-provenance.sh <run_id>
#
# Behavior:
#   - gh run view <run_id> for conclusion/headSha/url/workflow
#   - Fail closed if gh fails OR conclusion != success
#   - Download artifact maestro-reference-flow-<run_id> (fallback: maestro-reference-flow)
#   - sha256 of the artifact zip (or of a re-zipped download tree when zip unavailable)
#   - Write ci-run-provenance.json with run_id, run_url, head_sha, artifact_sha256, conclusion
#
# NEVER fabricates success provenance when no real run exists.
# NEVER substitutes local Maestro artifacts for CI evidence.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
sprint_dir="$repo_root/.spec/prds/mk6-migration/tasks/sprint-20-e2e-maestro-harness-and-cold-boot-reference-flow"

run_id=""
expected_sha="${CI_TESTED_SHA:-}"
out_path=""
download_dir="${CI_E2E_DOWNLOAD_DIR:-$repo_root/.tmp/ci-e2e-download}"
artifact_name_override=""

usage() {
  cat <<'EOF'
Usage:
  capture-ci-provenance.sh --run-id <id> [--expected-sha <sha>] [--out path] [--download-dir path]
  capture-ci-provenance.sh <run_id>

Fail closed when gh is missing/unauthenticated, run_id invalid, conclusion != success,
or the run head does not equal the expected tested SHA. If --expected-sha is omitted,
the current HEAD is used as the expected tested SHA.
Writes ci-run-provenance.json; does not fabricate success.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --run-id)
      run_id="${2:-}"; shift 2 ;;
    --expected-sha|--tested-sha)
      expected_sha="${2:-}"; shift 2 ;;
    --out)
      out_path="${2:-}"; shift 2 ;;
    --download-dir)
      download_dir="${2:-}"; shift 2 ;;
    --artifact-name)
      artifact_name_override="${2:-}"; shift 2 ;;
    -h|--help)
      usage; exit 0 ;;
    -*)
      echo "capture-ci-provenance: unknown flag: $1" >&2
      usage >&2
      exit 2 ;;
    *)
      if [[ -z "$run_id" ]]; then
        run_id="$1"
        shift
      else
        echo "capture-ci-provenance: unexpected arg: $1" >&2
        exit 2
      fi
      ;;
  esac
done

if [[ -z "$run_id" ]]; then
  echo "capture-ci-provenance: --run-id required" >&2
  usage >&2
  exit 2
fi

# Reject non-positive / non-numeric run ids (fail closed; never fabricate)
if ! [[ "$run_id" =~ ^[1-9][0-9]*$ ]]; then
  echo "capture-ci-provenance: invalid run_id='$run_id' (must be positive integer)" >&2
  exit 1
fi

if [[ -z "$expected_sha" ]]; then
  expected_sha="$(git -C "$repo_root" rev-parse HEAD 2>/dev/null || echo unknown)"
fi
if ! [[ "$expected_sha" =~ ^[0-9a-fA-F]{40}$ ]]; then
  echo "capture-ci-provenance: invalid expected tested SHA='$expected_sha' (must be 40 hex characters)" >&2
  exit 1
fi

if [[ -z "$out_path" ]]; then
  out_path="$sprint_dir/ci-run-provenance.json"
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "capture-ci-provenance: gh CLI not found — install gh and authenticate" >&2
  exit 1
fi

if [[ -z "${GH_TOKEN:-}${GITHUB_TOKEN:-}" ]]; then
  if ! gh auth status >/dev/null 2>&1; then
    echo "capture-ci-provenance: gh not authenticated (gh auth login or GH_TOKEN)" >&2
    exit 1
  fi
fi

# View run metadata (fail closed on gh error)
view_json=""
if ! view_json="$(gh run view "$run_id" --json databaseId,status,conclusion,headSha,url,workflowName,event,displayTitle 2>&1)"; then
  echo "capture-ci-provenance: gh run view failed for run_id=$run_id" >&2
  echo "$view_json" >&2
  exit 1
fi

# Parse + validate
meta="$(python3 -c '
import json,sys
raw=sys.stdin.read()
try:
    d=json.loads(raw)
except Exception as e:
    print(json.dumps({"error": str(e)}))
    raise SystemExit(2)
rid=d.get("databaseId")
concl=str(d.get("conclusion") or "")
status=str(d.get("status") or "")
head=str(d.get("headSha") or "")
url=str(d.get("url") or "")
wf=str(d.get("workflowName") or "")
ok = (
    isinstance(rid, int) and rid > 0
    and concl == "success"
    and status == "completed"
    and len(head) == 40
    and all(c in "0123456789abcdef" for c in head.lower())
    and url.startswith("http")
)
print(json.dumps({
    "ok": ok,
    "run_id": rid,
    "conclusion": concl,
    "status": status,
    "head_sha": head,
    "run_url": url,
    "workflow_name": wf,
    "error": None if ok else f"run not success/completed or bad head_sha (conclusion={concl} status={status})"
}))
' <<<"$view_json")" || {
  echo "capture-ci-provenance: failed to parse gh run view JSON" >&2
  exit 1
}

meta_ok="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1]).get("ok"))' "$meta")"
if [[ "$meta_ok" != "True" && "$meta_ok" != "true" ]]; then
  err="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1]).get("error") or "not success")' "$meta")"
  echo "capture-ci-provenance: fail-closed: $err" >&2
  echo "capture-ci-provenance: refusing to write success provenance" >&2
  exit 1
fi

head_sha="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["head_sha"])' "$meta")"
run_url="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["run_url"])' "$meta")"
conclusion="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["conclusion"])' "$meta")"
workflow_name="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1]).get("workflow_name") or "ci-e2e")' "$meta")"

head_sha_lower="$(printf '%s' "$head_sha" | tr '[:upper:]' '[:lower:]')"
expected_sha_lower="$(printf '%s' "$expected_sha" | tr '[:upper:]' '[:lower:]')"
if [[ "$head_sha_lower" != "$expected_sha_lower" ]]; then
  echo "capture-ci-provenance: fail-closed: CI run head_sha=$head_sha does not match expected tested SHA=$expected_sha" >&2
  echo "capture-ci-provenance: refusing to write mismatched success provenance" >&2
  exit 1
fi

# Prefer artifact name with run_id suffix (ci-e2e.yml: maestro-reference-flow-${{ github.run_id }})
artifact_name="${artifact_name_override:-maestro-reference-flow-${run_id}}"
mkdir -p "$download_dir"
rm -rf "${download_dir:?}/"*

zip_path="$download_dir/${artifact_name}.zip"
artifact_sha=""
artifact_size=0
download_ok=false

# Try download as zip via API for sha256 of the uploaded artifact bytes
if gh api \
  -H "Accept: application/vnd.github+json" \
  "/repos/{owner}/{repo}/actions/runs/${run_id}/artifacts" >"$download_dir/artifacts-list.json" 2>/dev/null; then
  art_meta="$(python3 -c '
import json,sys
wanted=sys.argv[1]
fallback="maestro-reference-flow"
d=json.load(open(sys.argv[2]))
arts=d.get("artifacts") or []
pick=None
for a in arts:
    if a.get("name")==wanted:
        pick=a; break
if pick is None:
    for a in arts:
        name=str(a.get("name") or "")
        if name==fallback or name.startswith(fallback):
            pick=a; break
if not pick:
    print(json.dumps({"found": False}))
else:
    print(json.dumps({
        "found": True,
        "name": pick.get("name"),
        "id": pick.get("id"),
        "size_in_bytes": pick.get("size_in_bytes") or 0,
        "archive_download_url": pick.get("archive_download_url"),
    }))
' "$artifact_name" "$download_dir/artifacts-list.json")"

  found="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1]).get("found"))' "$art_meta")"
  if [[ "$found" == "True" || "$found" == "true" ]]; then
    artifact_name="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["name"])' "$art_meta")"
    art_id="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["id"])' "$art_meta")"
    artifact_size="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1]).get("size_in_bytes") or 0)' "$art_meta")"
    # Download zip bytes for sha256
    if gh api \
      -H "Accept: application/vnd.github+json" \
      "/repos/{owner}/{repo}/actions/artifacts/${art_id}/zip" >"$zip_path" 2>/dev/null \
      && [[ -s "$zip_path" ]]; then
      artifact_sha="$(shasum -a 256 "$zip_path" | awk '{print $1}')"
      artifact_size="$(wc -c <"$zip_path" | tr -d ' ')"
      # Also extract for capstone / junit inspection
      mkdir -p "$download_dir/bundle"
      if command -v unzip >/dev/null 2>&1; then
        unzip -q -o "$zip_path" -d "$download_dir/bundle" || true
        # Flatten if nested
        if [[ ! -f "$download_dir/junit.xml" && -f "$download_dir/bundle/junit.xml" ]]; then
          cp -R "$download_dir/bundle/." "$download_dir/"
        elif [[ ! -f "$download_dir/junit.xml" ]]; then
          # Search one level
          found_j="$(find "$download_dir/bundle" -name junit.xml 2>/dev/null | head -1 || true)"
          if [[ -n "$found_j" ]]; then
            cp -R "$(dirname "$found_j")/." "$download_dir/"
          fi
        fi
      fi
      download_ok=true
    fi
  fi
fi

# Fallback: gh run download (extracts; sha256 of a deterministic tar of contents)
if [[ "$download_ok" != "true" ]]; then
  if gh run download "$run_id" -n "$artifact_name" -D "$download_dir" 2>/dev/null \
    || gh run download "$run_id" -n "maestro-reference-flow" -D "$download_dir" 2>/dev/null \
    || gh run download "$run_id" -D "$download_dir" 2>/dev/null; then
    download_ok=true
    # Prefer existing zip sha; else hash a sorted file manifest of the download tree
    if [[ -z "$artifact_sha" ]]; then
      artifact_sha="$(
        (
          cd "$download_dir"
          find . -type f ! -name 'artifacts-list.json' ! -name 'ci-run-provenance.json' -print0 \
            | sort -z \
            | xargs -0 shasum -a 256 2>/dev/null
        ) | shasum -a 256 | awk '{print $1}'
      )"
      artifact_size="$(
        find "$download_dir" -type f ! -name 'artifacts-list.json' ! -name 'ci-run-provenance.json' \
          -exec wc -c {} + 2>/dev/null | tail -1 | awk '{print $1}'
      )"
      artifact_size="${artifact_size:-0}"
    fi
  fi
fi

if [[ "$download_ok" != "true" || -z "$artifact_sha" || ! "$artifact_sha" =~ ^[0-9a-f]{64}$ ]]; then
  echo "capture-ci-provenance: fail-closed: could not download/hash artifact for run_id=$run_id" >&2
  exit 1
fi

# Optional junit presence check (warn only — conclusion already success)
junit_present=false
if [[ -f "$download_dir/junit.xml" ]] || find "$download_dir" -name junit.xml 2>/dev/null | grep -q .; then
  junit_present=true
fi

evidence_capture_sha="$(git -C "$repo_root" rev-parse HEAD 2>/dev/null || echo unknown)"
captured_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

mkdir -p "$(dirname "$out_path")"
python3 - "$out_path" <<PY
import json, sys
out = sys.argv[1]
payload = {
  "task": "GATE-FIX-G4",
  "workflow": "ci-e2e.yml",
  "workflow_name": """$workflow_name""",
  "run_id": int("""$run_id"""),
  "run_url": """$run_url""",
  "head_sha": """$head_sha""",
  "committed_sha": """$head_sha""",
  "tested_sha": """$head_sha""",
  "evidence_capture_sha": """$evidence_capture_sha""",
  "conclusion": """$conclusion""",
  "artifact_name": """$artifact_name""",
  "artifact_size_bytes": int("""${artifact_size:-0}"""),
  "artifact_sha256": """$artifact_sha""",
  "download_dir": """$download_dir""",
  "junit_present": """$junit_present""" == "true",
  "captured_at": """$captured_at""",
}
# Strict validation before write
assert payload["run_id"] > 0
assert payload["conclusion"] == "success"
assert len(payload["head_sha"]) == 40
assert payload["head_sha"] == payload["committed_sha"] == payload["tested_sha"]
assert len(payload["artifact_sha256"]) == 64
with open(out, "w", encoding="utf-8") as f:
    json.dump(payload, f, indent=2)
    f.write("\n")
print(json.dumps(payload, indent=2))
PY

# Also mirror into download dir for regenerator dual-path
cp -f "$out_path" "$download_dir/ci-run-provenance.json" 2>/dev/null || true
cp -f "$out_path" "$download_dir/ci-provenance.json" 2>/dev/null || true

echo "capture-ci-provenance: wrote $out_path (run_id=$run_id conclusion=success)" >&2
exit 0
