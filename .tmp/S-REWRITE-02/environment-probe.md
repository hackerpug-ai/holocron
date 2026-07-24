# S-REWRITE-02 environment probe (remediation)

## Simulator / Maestro
- iPhone 17 (C79BF38C-D353-46A2-A1ED-CCA6D68E1B04) **Booted**
- `maestro` at `/opt/homebrew/bin/maestro`
- Flows: `.maestro/articles/*.yml` with **`appId: com.holocron.app`** (matches `app.config.cjs` bundleIdentifier / package)
- **Installed app:** `com.holocron.app` **is present** on the booted simulator (Expo build under CoreSimulator Containers)
- Prior wrong appId `com.anonymous.holocron` is incorrect for this project

## Implication for Maestro ACs (AC-1..AC-5 / TC-1..TC-5)
Maestro **requires**:
1. Installed app bundle `com.holocron.app` (present)
2. Metro bundler serving JS
3. Zero-cache + platform Hono
4. `holo seed:e2e --reset` (12 documents)

In this sandbox:
- Launch of `com.holocron.app` **completes**, then UI oracles fail (`articles-route` not visible — Metro/seed substrate missing)
- Exit codes remain **non-zero** (typically 1)
- **Do not fake green exits** — record actual Maestro failure output under `.tmp/S-REWRITE-02/ac-*-output.txt`

Static / integration GREEN (not a substitute for Maestro substrate):
- `tests/integration/s-rewrite-02-documents-cluster.test.ts` (6 tests)
- `holo verify:no-convex-client` on documents-cluster roots (AC-6)

## AC-4 contract note
`createImportDocument` is an **append-to-existing** Zero mutator (updates `documents.content` for a selected `documentId`). It does not insert a new row. Product APPROVED with this legacy semantics; `insertDocument` exists but is unused by `ArticleImportModal`.
