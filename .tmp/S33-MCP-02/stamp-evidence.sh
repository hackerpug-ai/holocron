#!/usr/bin/env bash
# Deterministic, fail-closed evidence stamp for S33-MCP-02.
# Run only after the RED and GREEN commits and after harvest-evidence.sh.
set -euo pipefail

TASK_ID="S33-MCP-02"
ROOT="$(git rev-parse --show-toplevel)"
DIR="$ROOT/.tmp/$TASK_ID"
RED_SHA="${1:-}"
GREEN_SHA="${2:-}"
SUMMARY="$DIR/verification-summary.json"
TEST="services/platform/tests/integration/sprint33-mcp-02-hybrid-search-fleet.test.ts"

die() { echo "stamp-evidence: ERROR: $*" >&2; exit 1; }
[[ -n "$RED_SHA" && -n "$GREEN_SHA" ]] || die "red and green commit SHAs are required"
git -C "$ROOT" cat-file -e "$RED_SHA^{commit}" || die "red commit is not a commit"
git -C "$ROOT" cat-file -e "$GREEN_SHA^{commit}" || die "green commit is not a commit"
[[ "$RED_SHA" != "$GREEN_SHA" ]] || die "RED and GREEN commits must be distinct"
git -C "$ROOT" merge-base --is-ancestor "$RED_SHA" "$GREEN_SHA" || die "RED is not an ancestor of GREEN"
[[ -f "$SUMMARY" ]] || die "harvest summary is missing"
command -v jq >/dev/null || die "jq is required"

sha256_file() { shasum -a 256 "$1" | awk '{print $1}'; }
blob_sha() { git -C "$ROOT" cat-file blob "$1:$2" | shasum -a 256 | awk '{print $1}'; }
require_file() { [[ -f "$DIR/$1" && ! -L "$DIR/$1" && -s "$DIR/$1" ]] || die "required artifact missing or empty: $1"; }
require_regular() { [[ -f "$DIR/$1" && ! -L "$DIR/$1" ]] || die "required artifact missing: $1"; }
require_file "red-output.txt"
require_file "green-output.txt"
require_file "seeded-artifact-red.json"
require_file "seeded-artifact-green.json"
require_file "red-ac-1-http-red.json"
require_file "red-ac-2-http-closed-fleet-red.json"
require_file "red-ac-3-http-fts-closed-fleet-red.json"
require_file "red-ac-4-stdio-red.json"
require_file "green-ac-1-http.json"
require_file "green-ac-2-http-closed-fleet.json"
require_file "green-ac-3-http-fts-closed-fleet.json"
require_file "green-ac-4-stdio.json"
require_file "manifest-output.txt"
require_file "inspector-smoke-output.txt"
require_file "test-source-snapshot.ts"
require_file "verify-manifest.json"
require_file "tdd-lineage.json"
for harvested in typecheck-output.txt lint-output.txt test-output.txt requirement-results.json ac-1-output.txt ac-2-output.txt ac-3-output.txt ac-4-output.txt tc-1-output.txt tc-2-output.txt tc-3-output.txt tc-4-output.txt tc-5-output.txt tc-6-output.txt; do
  require_regular "$harvested"
done

[[ "$(git -C "$ROOT" ls-files --error-unmatch ".tmp/$TASK_ID/red-output.txt" 2>/dev/null)" == ".tmp/$TASK_ID/red-output.txt" ]] || die "RED log is not tracked"
[[ "$(git -C "$ROOT" ls-files --error-unmatch ".tmp/$TASK_ID/green-output.txt" 2>/dev/null)" == ".tmp/$TASK_ID/green-output.txt" ]] || die "GREEN log is not tracked"
[[ "$(git -C "$ROOT" ls-files --error-unmatch "$TEST" 2>/dev/null)" == "$TEST" ]] || die "test source is not tracked"

RED_LOG_SHA="$(sha256_file "$DIR/red-output.txt")"
GREEN_LOG_SHA="$(sha256_file "$DIR/green-output.txt")"
[[ "$RED_LOG_SHA" == "$(blob_sha "$RED_SHA" ".tmp/$TASK_ID/red-output.txt")" ]] || die "RED log bytes differ from RED commit blob"
[[ "$GREEN_LOG_SHA" == "$(blob_sha "$GREEN_SHA" ".tmp/$TASK_ID/green-output.txt")" ]] || die "GREEN log bytes differ from GREEN commit blob"
TEST_BLOB_RED="$(git -C "$ROOT" rev-parse "$RED_SHA:$TEST")" || die "RED test blob missing"
TEST_BLOB_GREEN="$(git -C "$ROOT" rev-parse "$GREEN_SHA:$TEST")" || die "GREEN test blob missing"
TEST_BLOB_CURRENT="$(git -C "$ROOT" rev-parse "HEAD:$TEST")" || die "current test blob missing"
[[ "$TEST_BLOB_RED" == "$TEST_BLOB_GREEN" && "$TEST_BLOB_GREEN" == "$TEST_BLOB_CURRENT" ]] || die "test source changed across RED/GREEN/current"
[[ "$(sha256_file "$DIR/test-source-snapshot.ts")" == "$(sha256_file "$ROOT/$TEST")" ]] || die "test source snapshot differs from current source"

grep -Fq 'EXIT_CODE:1' "$DIR/red-output.txt" || die "RED terminal marker missing"
grep -Fq '3 failed | 1 passed' "$DIR/red-output.txt" || die "RED test count missing"
grep -Fq 'EXIT_CODE:0' "$DIR/green-output.txt" || die "GREEN terminal marker missing"
grep -Eq '[4] passed|4 tests.*passed' "$DIR/green-output.txt" || die "GREEN test count missing"
grep -Fq '23 passed' "$DIR/manifest-output.txt" || die "manifest gate result missing"
grep -Fq 'EXIT_CODE:0' "$DIR/manifest-output.txt" || die "manifest gate marker missing"
grep -Fq 'EXIT_CODE:0' "$DIR/inspector-smoke-output.txt" || die "Inspector marker missing"
grep -Fq 'hybrid' "$DIR/inspector-smoke-output.txt" || die "Inspector hybrid result missing"
jq -e '.embeddingDimension == 1024 and .semanticTitle == "S33-MCP-02 Fleet Retrieval Proof" and (.closedFleetUrl|startswith("http://127.0.0.1:"))' "$DIR/seeded-artifact-green.json" >/dev/null || die "seeded artifact invariants missing"
jq -e '.live.parseFailures == [] and .closed.parseFailures == [] and .live.result.isError != true and .closed.result.isError == true and .closedError.code == "ROLE_UNAVAILABLE"' "$DIR/green-ac-4-stdio.json" >/dev/null || die "stdio parity/parse evidence invalid"
CLOSED_URL="$(jq -r '.closedFleetUrl' "$DIR/green-ac-2-http-closed-fleet.json")"
jq -e --arg closed "$CLOSED_URL" '.error.code == "ROLE_UNAVAILABLE" and (.error.message|contains("fleet role '\''embed'\''")) and (.error.message|contains($closed))' "$DIR/green-ac-2-http-closed-fleet.json" >/dev/null || die "closed fleet role evidence invalid"

validate_lineage() {
  local red="$1" green="$2"
  [[ -n "$red" && -n "$green" && "$red" != "$green" ]] || return 1
  git -C "$ROOT" cat-file -e "$red^{commit}" >/dev/null 2>&1 || return 1
  git -C "$ROOT" cat-file -e "$green^{commit}" >/dev/null 2>&1 || return 1
  git -C "$ROOT" merge-base --is-ancestor "$red" "$green" >/dev/null 2>&1
}
validate_lineage "$RED_SHA" "$GREEN_SHA" || die "lineage validation failed"

TMP_NEG="$(mktemp -d "$DIR/.stamp-negative.XXXXXX")"
trap 'rm -rf "$TMP_NEG"' EXIT
cp "$DIR/red-output.txt" "$TMP_NEG/red-output.txt"
printf '\nTAMPERED\n' >> "$TMP_NEG/red-output.txt"
[[ "$(sha256_file "$TMP_NEG/red-output.txt")" != "$RED_LOG_SHA" ]] || die "artifact tamper negative control did not detect change"
cp "$ROOT/$TEST" "$TMP_NEG/test.ts"
printf '\nTAMPERED\n' >> "$TMP_NEG/test.ts"
[[ "$(sha256_file "$TMP_NEG/test.ts")" != "$(sha256_file "$ROOT/$TEST")" ]] || die "source tamper negative control did not detect change"
if validate_lineage "" "$GREEN_SHA"; then die "null lineage negative control passed"; fi
if validate_lineage "$GREEN_SHA" "$RED_SHA"; then die "out-of-order lineage negative control passed"; fi

RECIPE_SHA="$(sha256_file "$DIR/stamp-evidence.sh")"
INPUTS_TMP="$(mktemp "$DIR/.evidence-inputs.XXXXXX")"
SUMMARY_TMP="$(mktemp "$DIR/.verification-summary.XXXXXX")"
trap 'rm -f "$INPUTS_TMP" "$SUMMARY_TMP"; rm -rf "$TMP_NEG"' EXIT
for file in red-output.txt green-output.txt seeded-artifact-red.json seeded-artifact-green.json red-ac-1-http-red.json red-ac-2-http-closed-fleet-red.json red-ac-3-http-fts-closed-fleet-red.json red-ac-4-stdio-red.json green-ac-1-http.json green-ac-2-http-closed-fleet.json green-ac-3-http-fts-closed-fleet.json green-ac-4-stdio.json manifest-output.txt inspector-smoke-output.txt test-source-snapshot.ts verify-manifest.json tdd-lineage.json typecheck-output.txt lint-output.txt test-output.txt requirement-results.json ac-1-output.txt ac-2-output.txt ac-3-output.txt ac-4-output.txt tc-1-output.txt tc-2-output.txt tc-3-output.txt tc-4-output.txt tc-5-output.txt tc-6-output.txt stamp-evidence.sh; do
  jq -nc --arg path "$file" --arg sha "$(sha256_file "$DIR/$file")" '{path:$path,sha256:$sha}' >> "$INPUTS_TMP"
done
INPUTS_JSON="$(jq -s '.' "$INPUTS_TMP")"
STAMPED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
jq --arg tool "stamp-evidence.sh" --arg version "1.0" --arg ts "$STAMPED_AT" --arg layered "harvest-evidence.sh" --arg recipe_sha "$RECIPE_SHA" --arg red "$RED_SHA" --arg green "$GREEN_SHA" --arg red_blob "$(blob_sha "$RED_SHA" ".tmp/$TASK_ID/red-output.txt")" --arg green_blob "$(blob_sha "$GREEN_SHA" ".tmp/$TASK_ID/green-output.txt")" --arg test_red "$TEST_BLOB_RED" --arg test_green "$TEST_BLOB_GREEN" --argjson inputs "$INPUTS_JSON" '.generator = {tool:$tool,version:$version,generated_at:$ts,layered_from:$layered,recipe_sha256:$recipe_sha,inputs:$inputs,lineage:{red_commit:$red,green_commit:$green,red_artifact_blob:$red_blob,green_artifact_blob:$green_blob,test_source_blob_red:$test_red,test_source_blob_green:$test_green},negative_controls:{artifact_tamper:true,source_tamper:true,null_lineage:true,out_of_order_lineage:true}}' "$SUMMARY" > "$SUMMARY_TMP"
mv "$SUMMARY_TMP" "$SUMMARY"
cp "$INPUTS_TMP" "$DIR/evidence-inputs.jsonl"
echo "stamp-evidence: layered_from=harvest-evidence.sh inputs=$(jq length <<<"$INPUTS_JSON") recipe_sha256=$RECIPE_SHA"
