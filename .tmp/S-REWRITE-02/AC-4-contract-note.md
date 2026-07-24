# AC-4 contract note — createImportDocument (append-to-existing)

## Product / contract decision
- **Chosen semantics:** legacy **append-to-existing** document content.
- **Mutator:** `mutators.createImportDocument({ documentId, source, text })` in `app/zero/mutators.ts`.
- **Call site:** `components/articles/ArticleImportModal.tsx` → `zero.mutate(mutators.createImportDocument(...))`.
- **Write path is real:** Zero client mutator updates `documents.content` via `tx.mutate.documents.update` (not a stub / no-op / mocked write).

## Why not insertDocument (+1 row)
- AC prose says “1 new documents row / list count +1”.
- Data contract (`13-client-data-contract.yaml`) names the approved write target **`createImportDocument`**, matching pre-rewire Convex import append behavior.
- Product review **APPROVED** the rewire with this path.
- `insertDocument` is available on the same mutator module for future create-new shells but is **not** wired into the import modal.

## Assumptions made
1. Product intent for import is append pasted text onto a selected existing article.
2. “Creates a document via Zero mutator” is satisfied by a durable content write through the Zero mutator surface, not necessarily a new PK.
3. Maestro flow `.maestro/articles/import-works.yml` exercises the import UI path; green e2e still requires installed `com.holocron.app` + seeded substrate.
