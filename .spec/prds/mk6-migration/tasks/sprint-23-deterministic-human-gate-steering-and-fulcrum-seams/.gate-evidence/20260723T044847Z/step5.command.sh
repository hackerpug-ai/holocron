#!/usr/bin/env bash
# @@GATE-META step=5 cmd_sha=dc02415d6cc30607f4cc450093643dbe3c7862e78fbb5f1bc382ac97f048f377@@
# Literal command (byte-identical to gate-plan.json step.literal_cmd):
DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod bun services/platform/src/cli/holo.ts mission:cycle 019f8d2e-00db-7eda-8ef3-51ee6cd81018 --json
