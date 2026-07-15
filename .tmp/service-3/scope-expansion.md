# service-3 scope expansion

Sprint 01 compat-3 fleet skeleton was MISSING from main. Created real implementation:

- services/platform/src/fleet/manifest.schema.ts (Zod Fleet Role Manifest)
- services/platform/src/fleet/manifest.ts (fail-closed loader)
- services/platform/fleet/manifest.json (complete 5-role manifest)
- services/platform/src/inference/resolve-model.ts (live :4545 health probe)

No fake endpoints; unknown/unreachable roles fail closed.
