#!/usr/bin/env bash
# =============================================================================
# provision-fulcrum-roles.sh — FUL-INFRA-001
# Host and serve the three Fulcrum model roles on ONE inference mini, reached
# only through its documented SSH alias (~/models/DEVICES.md):
#
#   bash services/platform/deploy/fleet/provision-fulcrum-roles.sh --node inference1
#   bash services/platform/deploy/fleet/provision-fulcrum-roles.sh --node inference2 \
#     --clear-coder-weights
#
# What it does per node (idempotent — safe to re-run):
#   1. Farms each expected basename from its HF repo (mlx-community/...) into
#      ~/models/mlx-community/<basename> when the weights are absent or
#      incomplete (resumable download via the `hf` CLI).
#   2. --clear-coder-weights: retires the coder weights (Qwen3.6-35B-A3B-
#      MLX-8bit) out of every served model root into ~/models/.retired-coder/
#      — clearing the coder is what makes the ~46 GB Fulcrum set fit a mini
#      (ADR-008 memory arithmetic). Files are MOVED, never deleted.
#   3. Rebuilds the Fulcrum serve bind: ~/models/fulcrum/ holds exactly one
#      symlink per expected basename, so oMLX serves exactly the Fulcrum set.
#   4. Restarts oMLX 0.5.x on :8003 (bind 0.0.0.0) with --model-dir pointing
#      at the Fulcrum bind and the mini memory flags from ~/start-omlx-node.sh.
#   5. Waits for readiness and verifies all three basenames are served, from
#      the node's own endpoint.
#
# NEVER touches any network setting (Wi-Fi/Tailscale/interfaces) — degradation
# in this task is produced only by stopping oMLX or restricting the model dir.
# Credentials: key auth via ~/.ssh/config aliases only; no secrets handled.
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROLES_JSON="$SCRIPT_DIR/fulcrum-roles.json"

NODE=""
CLEAR_CODER=0

usage() {
  sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
}

while [ $# -gt 0 ]; do
  case "$1" in
    --help|-h) usage ;;
    --clear-coder-weights) CLEAR_CODER=1 ;;
    --node)
      if [ $# -lt 2 ]; then
        echo "ERROR: --node requires a value" >&2
        exit 2
      fi
      NODE="$2"
      shift
      ;;
    --node=*) NODE="${1#--node=}" ;;
    *)
      echo "ERROR: unknown argument: $1" >&2
      exit 2
      ;;
  esac
  shift
done

if [ -z "$NODE" ]; then
  echo "ERROR: --node <inference1|inference2> is required" >&2
  exit 2
fi

if [ ! -f "$ROLES_JSON" ]; then
  echo "ERROR: fulcrum-roles.json not found at $ROLES_JSON" >&2
  exit 2
fi

# Role entries (basename|hf_repo) come from fulcrum-roles.json — the ONLY
# declaration of Fulcrum role expectations (ADR-008). Never hardcode a second
# vocabulary here.
ROLE_ENTRIES=()
while IFS= read -r line; do
  [ -n "$line" ] && ROLE_ENTRIES+=("$line")
done < <(python3 - "$ROLES_JSON" <<'PY'
import json, sys
with open(sys.argv[1]) as f:
    doc = json.load(f)
for role in sorted(doc["roles"]):
    entry = doc["roles"][role]
    print(f"{entry['basename']}|{entry['hf_repo']}")
PY
)
BASENAMES="${ROLE_ENTRIES[@]%%|*}"
if [ "${#ROLE_ENTRIES[@]}" -lt 3 ]; then
  echo "ERROR: expected 3 Fulcrum roles in $ROLES_JSON, found ${#ROLE_ENTRIES[@]}" >&2
  exit 2
fi

if ! ssh -o BatchMode=yes -o ConnectTimeout=10 "$NODE" 'true' 2>/dev/null; then
  echo "ERROR: ssh $NODE unreachable (use the documented SSH aliases)" >&2
  exit 1
fi

echo "== provisioning $NODE (clear-coder-weights=$CLEAR_CODER) =="
echo "   roles: $BASENAMES"

# Ship the remote provisioning payload over stdin; role entries travel as a
# base64 env var (newline-safe through the ssh command line).
FULCRUM_ROLE_ENTRIES_B64="$(printf '%s\n' "${ROLE_ENTRIES[@]}" | base64)"

ssh -o BatchMode=yes "$NODE" FULCRUM_CLEAR_CODER="$CLEAR_CODER" FULCRUM_ROLE_ENTRIES_B64="$FULCRUM_ROLE_ENTRIES_B64" zsh -s <<'REMOTE'
set -eu
export PATH="/opt/homebrew/bin:$PATH"

ROLE_ENTRIES=("${(f)$(printf %s "$FULCRUM_ROLE_ENTRIES_B64" | base64 -d)}")
BASENAMES=()
for entry in "${ROLE_ENTRIES[@]}"; do
  BASENAMES+=("${entry%%|*}")
done

echo "-- [1/5] farm expected basenames (resumable, skips complete weights) --"
for entry in "${ROLE_ENTRIES[@]}"; do
  b="${entry%%|*}"
  repo="${entry#*|}"
  dir="$HOME/models/mlx-community/$b"
  complete=0
  if [ -s "$dir/config.json" ]; then
    idx="$dir/model.safetensors.index.json"
    if [ -s "$idx" ]; then
      complete=1
      for f in $(grep -o '"model-[^"]*\.safetensors"' "$idx" | tr -d '"' | sort -u); do
        [ -s "$dir/$f" ] || complete=0
      done
    fi
  fi
  if [ "$complete" = 1 ]; then
    echo "   farm: $b complete — skip download"
  else
    echo "   farm: $b incomplete — hf download $repo (resumable)"
    if ! hf download "$repo" --local-dir "$dir" >/dev/null 2>&1; then
      echo "ERROR: hf download failed for $repo on $(hostname -s)" >&2
      exit 1
    fi
    echo "   farm: $b downloaded"
  fi
done

if [ "$FULCRUM_CLEAR_CODER" = "1" ]; then
  echo "-- [2/5] retire coder weights out of every served root --"
  for root in "$HOME/models/mlx-community" "$HOME/models/lmstudio-community"; do
    src="$root/Qwen3.6-35B-A3B-MLX-8bit"
    if [ -d "$src" ]; then
      mkdir -p "$HOME/models/.retired-coder"
      mv "$src" "$HOME/models/.retired-coder/Qwen3.6-35B-A3B-MLX-8bit"
      echo "   retired: $src -> ~/models/.retired-coder/"
    else
      echo "   retired: no coder weights at $src (already clear)"
    fi
  done
else
  echo "-- [2/5] coder weights left in place (--clear-coder-weights not passed) --"
fi

echo "-- [3/5] rebuild Fulcrum serve bind ~/models/fulcrum --"
rm -rf "$HOME/models/fulcrum"
mkdir -p "$HOME/models/fulcrum"
for b in "${BASENAMES[@]}"; do
  ln -sfn "$HOME/models/mlx-community/$b" "$HOME/models/fulcrum/$b"
done
echo "   bind entries: ${BASENAMES[*]}"

echo "-- [4/5] restart oMLX on :8003 serving the Fulcrum bind --"
pkill -x omlx-server 2>/dev/null || true
pkill -f "omlx serve" 2>/dev/null || true
for i in $(seq 1 15); do
  lsof -ti :8003 >/dev/null 2>&1 || break
  sleep 1
done
if lsof -ti :8003 >/dev/null 2>&1; then
  lsof -ti :8003 | xargs kill -9 2>/dev/null || true
  sleep 2
fi
mkdir -p "$HOME/local-llm/logs" "$HOME/models/.claude/pids" "$HOME/.omlx/cache"
nohup omlx serve \
  --model-dir "$HOME/models/fulcrum" \
  --host 0.0.0.0 \
  --port 8003 \
  --paged-ssd-cache-dir "$HOME/.omlx/cache" \
  --hot-cache-max-size 8GB \
  --memory-guard aggressive \
  --max-concurrent-requests 4 \
  > "$HOME/local-llm/logs/omlx-fulcrum-8003.log" 2>&1 &
echo $! > "$HOME/models/.claude/pids/omlx-fulcrum-8003.pid"
disown || true

echo "-- [5/5] readiness + expected-basename verification --"
ready=0
for i in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:8003/v1/models" > /tmp/fulcrum-models.json 2>/dev/null; then
    ready=1
    break
  fi
  sleep 2
done
if [ "$ready" != 1 ]; then
  echo "ERROR: oMLX :8003 not ready in 120s — see ~/local-llm/logs/omlx-fulcrum-8003.log" >&2
  exit 1
fi
for b in "${BASENAMES[@]}"; do
  grep -q "\"id\":\"$b\"" /tmp/fulcrum-models.json || {
    echo "ERROR: $b missing from :8003 /v1/models" >&2
    exit 1
  }
done
echo "PROVISION OK $(hostname -s): serving ${#BASENAMES[@]} Fulcrum basenames on :8003"
REMOTE

echo "== $NODE provisioned =="
