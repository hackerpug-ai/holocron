# Pre-existing issues (S-UPLOAD-01)

## Full-repo `biome check .`

`pnpm lint` / `biome check .` exits non-zero due to pre-existing format/lint diagnostics
outside this task's write_allowed paths (e.g. `.spec/orchestrate/*`, `.pi-subagents/*`,
`tests/setup/react-native.ts`, `vitest.setup.ts`). These were not introduced by S-UPLOAD-01.

## Task-scoped gate (what this task owns)

- `tsgo --noEmit` (via `pnpm typecheck`) → exit 0
- `biome check` on write_allowed paths for S-UPLOAD-01 → exit 0

Files verified in-scope:
- hooks/use-image-upload.ts
- components/improvements/ImprovementPreviewThumbnail.tsx
- components/improvements/ImprovementSubmitSheet.tsx
- app/zero/queries.ts
- tests/integration/uploads/**
- tests/components/improvements/preview-thumbnail.test.ts
