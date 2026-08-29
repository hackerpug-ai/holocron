#!/usr/bin/env bash
# Bounded path rewrite for PKG-04-PLATFORM (and later sibling package moves).
# Default: services/platform → packages/platform on live install/run callers
# plus in-tree platform sources/tests that hardcode the old path.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FROM="${FROM_PATH:-services/platform}"
TO="${TO_PATH:-packages/platform}"

FILES=(
  "$ROOT/bin/holo"
  "$ROOT/package.json"
  "$ROOT/pnpm-workspace.yaml"
  "$ROOT/packages/platform/Dockerfile"
  "$ROOT/vitest.workspace.ts"
  "$ROOT/tsconfig.json"
  "$ROOT/.github/workflows/ci-e2e.yml"
  "$ROOT/.github/workflows/ci-fast.yml"
  "$ROOT/.github/workflows/ci-integration.yml"
  "$ROOT/.github/workflows/verify-no-convex-client.yml"
  "$ROOT/.github/workflows/verify-no-convex-env.yml"
  "$ROOT/.dockerignore"
)

# Launchd + nonprod provision travel with the git-mv'd platform tree.
while IFS= read -r -d '' f; do
  FILES+=("$f")
done < <(find "$ROOT/packages/platform/deploy/launchd" -type f \( -name '*.plist' -o -name 'README.md' \) -print0 2>/dev/null || true)

if [[ -f "$ROOT/packages/platform/deploy/nonprod/provision.sh" ]]; then
  FILES+=("$ROOT/packages/platform/deploy/nonprod/provision.sh")
fi

# In-tree sources/tests/config that hardcode the old path (exclude node_modules).
while IFS= read -r -d '' f; do
  FILES+=("$f")
done < <(find "$ROOT/packages/platform" \( -path '*/node_modules/*' -o -path '*/.git/*' \) -prune -o -type f \( \
  -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.jsx' -o -name '*.json' -o \
  -name '*.yaml' -o -name '*.yml' -o -name '*.md' -o -name '*.sh' -o -name '*.plist' -o \
  -name 'Dockerfile' -o -name '.dockerignore' -o -name '.gitignore' \
\) -print0 2>/dev/null || true)


# Operator/CI scripts that import or path the platform tree (skip this script).
while IFS= read -r -d '' f; do
  case "$f" in
    "$ROOT/scripts/rewrite-package-paths.sh") continue ;;
  esac
  FILES+=("$f")
done < <(find "$ROOT/scripts" -type f \( -name '*.sh' -o -name '*.ts' -o -name '*.js' -o -name '*.py' \) -print0 2>/dev/null || true)

# Unit-lane tests under tests/ (not tests/integration) that import/path the platform tree.
while IFS= read -r -d '' f; do
  FILES+=("$f")
done < <(find "$ROOT/tests" \( -path '*/integration/*' -o -path '*/node_modules/*' \) -prune -o -type f \( -name '*.ts' -o -name '*.tsx' \) -print0 2>/dev/null || true)

rewrote=0
skipped=0
missing=0

for f in "${FILES[@]}"; do
  if [[ ! -f "$f" ]]; then
    echo "skip missing: ${f#"$ROOT"/}" >&2
    missing=$((missing + 1))
    continue
  fi
  if ! grep -Fq "$FROM" "$f"; then
    skipped=$((skipped + 1))
    continue
  fi
  tmp="$(mktemp)"
  sed "s|${FROM}|${TO}|g" "$f" >"$tmp"
  mv "$tmp" "$f"
  echo "rewrote: ${f#"$ROOT"/}"
  rewrote=$((rewrote + 1))
done

# packages/* already enrolls packages/platform — drop an explicit member for
# either the old or new path so the workspace does not double-list it.
if [[ -f "$ROOT/pnpm-workspace.yaml" ]]; then
  before="$(cat "$ROOT/pnpm-workspace.yaml")"
  tmp="$(mktemp)"
  grep -Ev "^[[:space:]]*-[[:space:]]*\"(${FROM}|${TO})\"" "$ROOT/pnpm-workspace.yaml" >"$tmp" || true
  mv "$tmp" "$ROOT/pnpm-workspace.yaml"
  after="$(cat "$ROOT/pnpm-workspace.yaml")"
  if [[ "$before" != "$after" ]]; then
    echo "rewrote: pnpm-workspace.yaml (removed explicit \"$FROM\"/\"$TO\" member; packages/* covers it)"
  fi
fi

echo "rewrite done: from=$FROM to=$TO rewrote=$rewrote skipped_no_match=$skipped missing=$missing"
