#!/usr/bin/env bash
# Fail if any workflow uses floating tags without SHA pins.
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
bad=0
while IFS= read -r line; do
  file="${line%%:*}"; rest="${line#*:}"
  if echo "$rest" | rg -q 'uses:\s*[^@]+@(main|master|latest|v[0-9]+(\.[0-9]+)?)(\s|$)'; then
    # allow only if full sha present (40 hex) before comment
    if ! echo "$rest" | rg -q 'uses:\s*[^@]+@[0-9a-f]{40}'; then
      echo "FLOATING_TAG $file:$rest"
      bad=1
    fi
  fi
done < <(rg -n "uses:" "$root/.github/workflows" || true)
exit $bad
