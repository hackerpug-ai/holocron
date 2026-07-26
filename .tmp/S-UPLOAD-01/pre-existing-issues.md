# Pre-existing issues (S-UPLOAD-01)

## Full-repo `biome check .` / `pnpm lint` (AC-5 / TC-5 verify command)

The contract AC-5 verify command is:

```text
tsgo --noEmit && biome check .
```

`tsgo --noEmit` (and `pnpm typecheck`) exits **0**.

`biome check .` / `pnpm lint` exits **non-zero (1)** because of pre-existing format/lint
diagnostics **outside this task's write_allowed paths**. Observed in harvest outputs
(`.tmp/S-UPLOAD-01/ac-5-output.txt`, `lint-output.txt`, `tc-5-output.txt`):

- `.spec/orchestrate/*` (and related generated/spec paths)
- `.pi-subagents/*`
- `tests/setup/react-native.ts`
- `vitest.setup.ts`
- other out-of-scope tree paths

These diagnostics were **not introduced by S-UPLOAD-01**. Task product/test files under
write_allowed are clean.

### Honest exit codes in verification-summary.json

- **AC-5 / TC-5 `exit_code` MUST remain the real compound-command result (1)** when full-repo
  `biome check .` fails. Do **not** fake `exit_code: 0` for a failing full-repo command.
- Project-level `lint.exit_code` from harvest is likewise **1** (pre-existing).
- `typecheck.exit_code` is **0**.

### Task-scoped gate (what this task owns — proof of GREEN for in-scope work)

Documented in `AC-5-green.txt` and `AC-5-seeded-artifact.txt`:

- `tsgo --noEmit` / `pnpm typecheck` → **exit 0**
- `biome check` on S-UPLOAD-01 write_allowed paths only → **exit 0**

Files verified in-scope (write_allowed):

- `hooks/use-image-upload.ts`
- `components/improvements/ImprovementPreviewThumbnail.tsx`
- `components/improvements/ImprovementSubmitSheet.tsx`
- `app/zero/queries.ts`
- `tests/integration/uploads/**`
- `tests/components/improvements/preview-thumbnail.test.ts`

Scoped GREEN command (from `AC-5-green.txt`):

```text
=== tsgo --noEmit ===
tsgo exit: 0
=== biome check (task write_allowed paths) ===
Checked 9 files in 6ms. No fixes applied.
biome exit: 0
```

### Summary flags

After harvest, set `pre_existing_issues: true` in `verification-summary.json` to reflect that
the full-repo lint/AC-5 fail is documented here as pre-existing, not task regressions.
