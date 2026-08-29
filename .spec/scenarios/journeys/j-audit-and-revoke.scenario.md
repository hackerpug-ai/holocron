---
service: holocron-web
feature: J-AUDIT-AND-REVOKE
covers_ucs: ["UC-SHARE-02", "UC-LIB-02", "UC-SHARE-03", "UC-READ-05"]
priority: P0
type: happy_path
tier: visible
test_tier: e2e
persona: operator
---

# Enumerate everything public under my name, pull one back, and put it back without breaking its link

The security-adjacent question asked in a hurry: what is public right now. The operator applies the shared chip and the rendered list must equal the database's own answer - that equality, not a hardcoded count, is what makes 'answerable by scanning' true rather than decorative. Chips for category, research type and status each hold universally over every rendered row, they combine with a query, and one action clears them all. He unshares one document, reads the stated propagation bound at the moment he does it, watches the row flip with no reload, and confirms from a fresh anonymous context that the link is a 404 withdrawn page with cache headers intact. Then he re-shares it - and the share token must be byte-identical to the one it had before, because a revocation that mints a new token on re-share silently kills every link already in circulation. The 60-second edge SLA itself is deliberately NOT asserted here; per the landmine ledger it belongs to the nightly tunnel lane, and the blocking lane runs with no CDN so revocation is immediate.

## Steps and assertions

1. **Open the Library and apply the 'shared' chip**
   - asserts: Rendered row count equals SELECT count(*) FROM documents WHERE is_public = true read live from Postgres; every rendered row's data-share-state === 'shared'

2. **Read share state off the rows without opening anything**
   - asserts: For EVERY rendered row, data-share-state matches that document's is_public value in Postgres (universal quantifier over the rendered set)

3. **Apply a category chip and a research-type chip together**
   - asserts: Every rendered row's data-category equals the first chip's value and data-research-type the second; the result-count badge equals the number of rendered rows

4. **Combine the chips with a search query**
   - asserts: The badge changes and still equals the rendered row count; every row still satisfies both chip predicates

5. **Clear all filters in one action**
   - asserts: Active-chip count is 0; rendered row count equals the unfiltered count captured at load

6. **Unshare one document from its row, capturing its share_token first**
   - asserts: is_public false in Postgres; revocation-bound visible during the same interaction, text contains '60'; the row flips to unshared while a window sentinel set before the toggle survives (no reload occurred)

7. **Re-apply the shared chip**
   - asserts: Rendered row count is exactly one less than step 1, and equals the live Postgres count

8. **From a fresh empty-storageState context, request the revoked /d/<token>**
   - asserts: status 404; withdrawn present; zero sign-in affordances; both cache headers present with exact expected strings

9. **Re-share the same document from its Library row**
   - asserts: documents.share_token is BYTE-IDENTICAL to the token captured before revocation; the same /d/<token> URL now returns 200 and its h1 equals documents.title

## Lifecycle

**Turns green when.** UC-SHARE-03 lands. It needs UC-SHARE-02 (row state + shared filter) and UC-LIB-02 (chips) first; those are earlier legs of the same sprint.

**Expected red until.** The SHARE sprint. RED through READ, SHELL and LIB - fails at the shared chip until UC-SHARE-02 exists. The withdrawn-page leg is green from sprint 1 but the journey cannot be, because there is no operator-side way to revoke until SHARE lands.
