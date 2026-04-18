# Toolchain Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace husky + lint-staged + eslint + tsc with lefthook + biome + tsgo across both packages.

**Architecture:** Single `lefthook.yml` at repo root orchestrates pre-commit hooks for both the root Expo app and `holocron-mcp`. Each package retains its own `biome.json`. `@typescript/native-preview` (tsgo binary) installed in both.

**Tech Stack:** lefthook, @biomejs/biome, @typescript/native-preview, pnpm (root), bun (holocron-mcp)

---

### Task 1: Install new deps and remove old deps — root package

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Remove old tooling deps**

```bash
cd /Users/justinrich/Projects/holocron
pnpm remove husky lint-staged eslint @eslint/js @typescript-eslint/eslint-plugin @typescript-eslint/parser eslint-plugin-react eslint-plugin-react-hooks eslint-plugin-react-native globals
```

Expected: packages removed, no errors.

- [ ] **Step 2: Add new tooling deps**

```bash
pnpm add -D lefthook @biomejs/biome @typescript/native-preview
```

Expected: packages installed.

- [ ] **Step 3: Update scripts and remove lint-staged config in package.json**

In `package.json`, change:
- `"prepare": "husky"` → `"prepare": "lefthook install"`
- `"lint": "eslint ."` → `"lint": "biome check ."`
- `"typecheck": "tsc --noEmit"` → `"typecheck": "tsgo --noEmit"`

Remove the entire `"lint-staged"` config block.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: swap root toolchain deps — lefthook + biome + tsgo"
```

---

### Task 2: Install new deps and remove old deps — holocron-mcp

**Files:**
- Modify: `holocron-mcp/package.json`

- [ ] **Step 1: Remove old tooling deps**

```bash
cd /Users/justinrich/Projects/holocron/holocron-mcp
bun remove husky lint-staged
```

Expected: packages removed.

- [ ] **Step 2: Add new tooling deps**

```bash
bun add -d lefthook @typescript/native-preview
```

Expected: packages installed.

- [ ] **Step 3: Update scripts and remove lint-staged config in holocron-mcp/package.json**

Change:
- `"prepare": "husky"` → `"prepare": "lefthook install"`
- `"type-check": "tsc --noEmit"` → `"type-check": "tsgo --noEmit"`

Remove the entire `"lint-staged"` config block.

- [ ] **Step 4: Commit**

```bash
cd /Users/justinrich/Projects/holocron
git add holocron-mcp/package.json holocron-mcp/bun.lock
git commit -m "chore: swap holocron-mcp toolchain deps — lefthook + tsgo"
```

---

### Task 3: Create root biome.json

**Files:**
- Create: `biome.json`

- [ ] **Step 1: Write biome.json**

Create `/Users/justinrich/Projects/holocron/biome.json`:

```json
{
  "$schema": "https://biomejs.dev/schemas/2.4.6/schema.json",
  "vcs": {
    "enabled": true,
    "clientKind": "git",
    "useIgnoreFile": true
  },
  "files": {
    "ignore": [
      "node_modules",
      ".expo",
      "dist",
      "build",
      "convex/_generated",
      "holocron-mcp",
      "scripts",
      "**/*.stories.tsx",
      "metro.config.cjs"
    ]
  },
  "formatter": {
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "correctness": {
        "useExhaustiveDependencies": "warn",
        "useHookAtTopLevel": "error",
        "noUnusedVariables": "error"
      },
      "suspicious": {
        "noExplicitAny": "warn"
      },
      "style": {
        "useConst": "error"
      }
    }
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "semicolons": "always",
      "trailingCommas": "es5"
    }
  }
}
```

- [ ] **Step 2: Verify biome runs clean (or surfaces real issues)**

```bash
cd /Users/justinrich/Projects/holocron
pnpm biome check . 2>&1 | head -50
```

Expected: either clean pass or lint errors in source files (not config errors). Fix any config errors before proceeding.

- [ ] **Step 3: Commit**

```bash
git add biome.json
git commit -m "chore: add root biome.json (replaces eslint)"
```

---

### Task 4: Create lefthook.yml

**Files:**
- Create: `lefthook.yml`

- [ ] **Step 1: Write lefthook.yml**

Create `/Users/justinrich/Projects/holocron/lefthook.yml`:

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

- [ ] **Step 2: Install the hook**

```bash
cd /Users/justinrich/Projects/holocron
pnpm lefthook install
```

Expected: `lefthook: hooks installed` (or similar). Verify `.git/hooks/pre-commit` now exists and calls lefthook.

```bash
cat .git/hooks/pre-commit
```

Expected: contains `lefthook`.

- [ ] **Step 3: Dry-run the pre-commit hook**

```bash
pnpm lefthook run pre-commit
```

Expected: all commands run. Fix any failures before proceeding (tsgo compat issues, biome rule violations in source).

- [ ] **Step 4: Commit**

```bash
git add lefthook.yml
git commit -m "chore: add lefthook.yml (replaces husky pre-commit)"
```

---

### Task 5: Delete old tooling files

**Files:**
- Delete: `.husky/pre-commit`, `.husky/` (dir if empty), `eslint.config.js`

- [ ] **Step 1: Remove old files**

```bash
cd /Users/justinrich/Projects/holocron
rm -rf .husky
rm eslint.config.js
```

- [ ] **Step 2: Verify no references to old tools remain in root scripts**

```bash
grep -r "husky\|lint-staged\|eslint" package.json
```

Expected: no matches (or only in `node_modules` context — but those are already removed from devDeps).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: remove husky, lint-staged, eslint artifacts"
```

---

### Task 6: Verify end-to-end

- [ ] **Step 1: Run all root scripts**

```bash
cd /Users/justinrich/Projects/holocron
pnpm lint
pnpm typecheck
pnpm test
```

Expected: all pass (or only pre-existing failures unrelated to toolchain).

- [ ] **Step 2: Run all holocron-mcp scripts**

```bash
cd /Users/justinrich/Projects/holocron/holocron-mcp
bun run lint
bun run type-check
bun test
```

Expected: all pass.

- [ ] **Step 3: Make a dummy staged change and run the hook**

```bash
cd /Users/justinrich/Projects/holocron
echo "// test" >> convex/schema.ts
git add convex/schema.ts
pnpm lefthook run pre-commit
git checkout convex/schema.ts
```

Expected: hook runs all commands, no crash. Revert the dummy change.

- [ ] **Step 4: Final commit if any loose changes**

```bash
git status
# If clean, nothing to do. If not:
git add -A
git commit -m "chore: toolchain migration — tsgo + biome + lefthook complete"
```
