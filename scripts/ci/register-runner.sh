#!/usr/bin/env bash
# Register a GitHub Actions self-hosted runner with Holocron labels.
# NEVER echo RUNNER_TOKEN. Credentials stay under $RUNNER_DIR (gitignored).
set -euo pipefail

REPO="${GITHUB_REPOSITORY:-hackerpug-ai/holocron-client}"
RUNNER_DIR="${RUNNER_DIR:-./actions-runner}"
RUNNER_LABELS="${RUNNER_LABELS:-self-hosted,holocron,integration,e2e}"
RUNNER_NAME="${RUNNER_NAME:-holocron-$(hostname -s)}"

if [[ -z "${RUNNER_TOKEN:-}" ]]; then
  echo "error: RUNNER_TOKEN is required (repo registration token — do not commit)" >&2
  exit 2
fi

mkdir -p "$RUNNER_DIR"
cd "$RUNNER_DIR"

if [[ ! -f ./config.sh ]]; then
  # Download latest runner for the current OS/arch (operator may pre-place the tarball).
  echo "error: actions runner package not found in $RUNNER_DIR — download from GitHub and extract first" >&2
  exit 2
fi

./config.sh --unattended \
  --url "https://github.com/${REPO}" \
  --token "${RUNNER_TOKEN}" \
  --name "${RUNNER_NAME}" \
  --labels "${RUNNER_LABELS}" \
  --work _work

echo "runner configured with labels: ${RUNNER_LABELS}"
echo "start with: cd ${RUNNER_DIR} && ./run.sh"
