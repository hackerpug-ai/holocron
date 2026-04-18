# Toolchain Migration: tsgo + biome + lefthook

**Date:** 2026-04-17  
**Status:** Approved  
**Scope:** Both packages — root Expo/React Native app and `holocron-mcp` Bun MCP server

---

## Goal

Replace the current `husky` + `lint-staged` + `eslint` + `tsc` stack with:
- **lefthook** — git hook manager (replaces husky + lint-staged)
- **biome** — linter + formatter (replaces eslint; already in holocron-mcp)
- **tsgo** (`@typescript/native-preview`) — Go-based TypeScript type-checker (replaces `tsc --noEmit`)

---

## Architecture

Single git root. One `lefthook.yml` at the repo root owns all pre-commit behavior for both packages. Lefthook's `root:` key scopes commands to subdirectories. Each package retains its own `biome.json`. `tsgo` is installed in both packages.

---

## Components

### New files

**`lefthook.yml`** (repo root)

```yaml
pre-commit:
  parallel: true
  commands:
    root-lint:
      glob: "*.{ts,tsx,js,jsx,json}"
      run: pnpm biome check --write --no-errors-on-unmatched {staged_files}
    root-typecheck:
      run: pnpm tsgo --noEmit
    root-test:
      run: pnpm test
    mcp-lint:
      glob: "holocron-mcp/**/*.{ts,js,json}"
      root: holocron-mcp
      run: biome check --write --no-errors-on-unmatched {staged_files}
    mcp-typecheck:
      root: holocron-mcp
      run: bun run type-check
    mcp-test:
      root: holocron-mcp
      run: bun test
```

**`biome.json`** (repo root)

```json
{
  "$schema": "https://biomejs.dev/schemas/2.4.6/schema.json",
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "files": {
    "ignore": [
      "node_modules", ".expo", "dist", "build",
      "convex/_generated", "holocron-mcp", "scripts",
      "**/*.stories.tsx", "metro.config.cjs"
    ]
  },
  "formatter": { "indentStyle": "space", "indentWidth": 2, "lineWidth": 100 },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "correctness": {
        "useExhaustiveDependencies": "warn",
        "useHookAtTopLevel": "error",
        "noUnusedVariables": "error"
      },
      "suspicious": { "noExplicitAny": "warn" },
      "style": { "useConst": "error" }
    }
  },
  "javascript": {
    "formatter": { "quoteStyle": "single", "semicolons": "always", "trailingCommas": "es5" }
  }
}
```

### Modified files

**`package.json`** (root)
- Remove devDependencies: `husky`, `lint-staged`, `eslint`, `@eslint/js`, `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`, `eslint-plugin-react`, `eslint-plugin-react-hooks`, `eslint-plugin-react-native`, `globals`
- Add devDependencies: `lefthook`, `@biomejs/biome`, `@typescript/native-preview`
- Remove `lint-staged` config block
- Update scripts:
  - `"prepare": "lefthook install"` (was `"husky"`)
  - `"lint": "biome check ."` (was `"eslint ."`)
  - `"typecheck": "tsgo --noEmit"` (was `"tsc --noEmit"`)

**`holocron-mcp/package.json`**
- Remove devDependencies: `husky`, `lint-staged`
- Add devDependencies: `lefthook`
- Remove `lint-staged` config block
- Update scripts:
  - `"prepare": "lefthook install"` (was `"husky"`)
  - `"type-check": "tsgo --noEmit"` (was `"tsc --noEmit"`)

### Deleted files

- `.husky/pre-commit`
- `eslint.config.js`

---

## Installation commands

```bash
# Root
pnpm remove husky lint-staged eslint @eslint/js @typescript-eslint/eslint-plugin @typescript-eslint/parser eslint-plugin-react eslint-plugin-react-hooks eslint-plugin-react-native globals
pnpm add -D lefthook @biomejs/biome @typescript/native-preview
pnpm lefthook install

# holocron-mcp
cd holocron-mcp
bun remove husky lint-staged
bun add -d lefthook @typescript/native-preview
bun lefthook install
```

---

## Risks

- **tsgo alpha gaps**: tsgo (`@typescript/native-preview`) is in preview. If it fails on Expo's tsconfig options, fall back to `tsc --noEmit` for `root-typecheck` only.
- **biome missing RN rules**: `eslint-plugin-react-native` rules (e.g., no-inline-styles) are not available in biome. Current eslint config didn't enable them, so this is a no-op regression.
- **lefthook parallel mode**: Commands run in parallel by default. `root-test` and `mcp-test` may be slow on large commits; can be split into a `pre-push` hook later if needed.
