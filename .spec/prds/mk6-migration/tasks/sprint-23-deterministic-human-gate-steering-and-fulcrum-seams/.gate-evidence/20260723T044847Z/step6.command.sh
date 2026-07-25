#!/usr/bin/env bash
# @@GATE-META step=6 cmd_sha=7ffa3ad16a305c1f4e452fb4d7d3ed696e47c99ef357adcba87ec19fd15c0007@@
# Literal command (byte-identical to gate-plan.json step.literal_cmd):
DATABASE_URL=postgres://127.0.0.1:5432/holocron bun services/platform/src/cli/holo.ts fulcrum:authorable-check
