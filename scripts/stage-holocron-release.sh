#!/usr/bin/env bash
# CUTOVER-RELEASE-001 — deterministic exact-SHA release staging.
# Fails closed on dirty/wrong SHA BEFORE any docker build or push.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO="$ROOT"
OUT=""
SOURCE_REVISION=""
JSON=0
REGISTRY="${HOLO_OCI_REGISTRY:-localhost:5000}"
PREVIOUS_IMAGE="${HOLO_PREVIOUS_PLATFORM_IMAGE:-}"
BUILD_HOST="${HOLO_RELEASE_BUILD_HOST:-holocron}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --source-revision) SOURCE_REVISION="${2:-}"; shift 2 ;;
    --out) OUT="${2:-}"; shift 2 ;;
    --repo) REPO="${2:-}"; shift 2 ;;
    --registry) REGISTRY="${2:-}"; shift 2 ;;
    --previous-image) PREVIOUS_IMAGE="${2:-}"; shift 2 ;;
    --json) JSON=1; shift ;;
    -h|--help)
      cat <<'EOF'
Usage:
  scripts/stage-holocron-release.sh --source-revision <40-hex> --out <dir> [--repo <path>] [--json]
EOF
      exit 0
      ;;
    *)
      echo "error: unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

if [[ -z "$SOURCE_REVISION" || -z "$OUT" ]]; then
  echo "error: --source-revision and --out are required" >&2
  exit 2
fi
if [[ ! "$SOURCE_REVISION" =~ ^[a-f0-9]{40}$ ]]; then
  echo "error: --source-revision must be 40-hex" >&2
  exit 2
fi
if [[ -z "$PREVIOUS_IMAGE" ]]; then
  PREVIOUS_IMAGE="localhost:5000/holocron-platform@sha256:e20d53470c936831bf2ed9e7b4bf6a1a509baab5fcd89eb6d7ec0c6fece23a4f"
fi

REPO="$(cd "$REPO" && pwd)"
mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd)"

# Exact SHA + clean tree BEFORE any build/push (ignore untracked node_modules only).
HEAD="$(git -C "$REPO" rev-parse HEAD)"
if [[ "$HEAD" != "$SOURCE_REVISION" ]]; then
  echo "error: source revision mismatch: HEAD ${HEAD} does not match requested ${SOURCE_REVISION}" >&2
  exit 1
fi
DIRTY="$(git -C "$REPO" status --porcelain=v1 --untracked-files=all | awk '
  {
    path=$0
    sub(/^.../, "", path)
    if (path == "node_modules" || index(path, "node_modules/") == 1) next
    print $0
  }
')"
if [[ -n "$DIRTY" ]]; then
  echo "error: source tree is dirty; commit the candidate before packaging" >&2
  printf '%s\n' "$DIRTY" >&2
  exit 1
fi

run_stage_bun() {
  local cwd="$1"
  local assume="$2"
  (
    cd "$cwd"
    export HOLO_OCI_REGISTRY="$REGISTRY"
    export HOLO_PREVIOUS_PLATFORM_IMAGE="$PREVIOUS_IMAGE"
    export SOURCE_REVISION="$SOURCE_REVISION"
    export OUT_DIR="$OUT"
    export ASSUME_CLEAN_ARCHIVE="$assume"
    bun -e '
      import { stageExactRelease } from "./packages/platform/src/deploy/production-release.ts";
      const sourceRevision = process.env.SOURCE_REVISION!;
      const outDir = process.env.OUT_DIR!;
      const registry = process.env.HOLO_OCI_REGISTRY;
      const previousImage = process.env.HOLO_PREVIOUS_PLATFORM_IMAGE;
      const assumeCleanArchive = process.env.ASSUME_CLEAN_ARCHIVE === "1";
      const manifest = stageExactRelease({
        sourceRevision,
        outDir,
        registry,
        previousImage,
        cwd: process.cwd(),
        assumeCleanArchive,
      });
      process.stdout.write(JSON.stringify({ ok: true, action: "stage-holocron-release", manifest }, null, 2) + "\n");
    '
  )
}

if docker info >/dev/null 2>&1; then
  run_stage_bun "$REPO" "0" | tee "$OUT/stage.stdout.json"
else
  REMOTE_ROOT="/tmp/CUTOVER-RELEASE-001-stage-${SOURCE_REVISION}"
  ARCHIVE="$(mktemp -t cutover-release-XXXXXX.tar)"
  cleanup() { rm -f "$ARCHIVE"; }
  trap cleanup EXIT
  # Ship only committed bytes for the exact SHA (no dirty working tree).
  git -C "$REPO" archive --format=tar "$SOURCE_REVISION" >"$ARCHIVE"
  ssh -o BatchMode=yes "$BUILD_HOST" "export PATH=/usr/local/bin:/Users/holocron/.bun/bin:\$PATH; rm -rf '$REMOTE_ROOT'; mkdir -p '$REMOTE_ROOT/src' '$REMOTE_ROOT/out'"
  scp -o BatchMode=yes -q "$ARCHIVE" "$BUILD_HOST:$REMOTE_ROOT/src.tar"
  ssh -o BatchMode=yes "$BUILD_HOST" "export PATH=/usr/local/bin:/Users/holocron/.bun/bin:\$PATH
    set -euo pipefail
    cd '$REMOTE_ROOT'
    tar -xf src.tar -C src
    cd src
    export HOLO_OCI_REGISTRY='$REGISTRY'
    export HOLO_PREVIOUS_PLATFORM_IMAGE='$PREVIOUS_IMAGE'
    export SOURCE_REVISION='$SOURCE_REVISION'
    export OUT_DIR='$REMOTE_ROOT/out'
    export ASSUME_CLEAN_ARCHIVE=1
    bun -e '
      import { stageExactRelease } from \"./packages/platform/src/deploy/production-release.ts\";
      const sourceRevision = process.env.SOURCE_REVISION!;
      const outDir = process.env.OUT_DIR!;
      const registry = process.env.HOLO_OCI_REGISTRY;
      const previousImage = process.env.HOLO_PREVIOUS_PLATFORM_IMAGE;
      const manifest = stageExactRelease({
        sourceRevision,
        outDir,
        registry,
        previousImage,
        cwd: process.cwd(),
        assumeCleanArchive: true,
      });
      process.stdout.write(JSON.stringify({ ok: true, action: \"stage-holocron-release\", manifest }, null, 2) + \"\\n\");
    ' | tee \"\$OUT_DIR/stage.stdout.json\"
  "
  scp -o BatchMode=yes -q \
    "$BUILD_HOST:$REMOTE_ROOT/out/release-manifest.json" \
    "$BUILD_HOST:$REMOTE_ROOT/out/image-lock.json" \
    "$BUILD_HOST:$REMOTE_ROOT/out/compose.yaml" \
    "$BUILD_HOST:$REMOTE_ROOT/out/pgbackrest.conf" \
    "$BUILD_HOST:$REMOTE_ROOT/out/stage.stdout.json" \
    "$OUT/"
fi

[[ -f "$OUT/release-manifest.json" ]] || { echo "error: missing release-manifest.json" >&2; exit 1; }
[[ -f "$OUT/image-lock.json" ]] || { echo "error: missing image-lock.json" >&2; exit 1; }

if [[ "$JSON" -eq 1 ]]; then
  if [[ -f "$OUT/stage.stdout.json" ]]; then
    cat "$OUT/stage.stdout.json"
  else
    python3 - <<PY
import json, pathlib
manifest=json.loads(pathlib.Path("$OUT/release-manifest.json").read_text())
print(json.dumps({"ok": True, "action": "stage-holocron-release", "manifest": manifest}, indent=2))
PY
  fi
fi
