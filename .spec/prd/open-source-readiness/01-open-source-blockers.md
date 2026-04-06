# 2.1 Open-Source Blockers (P0)

Make the repository safe and legally ready to be public. This MUST be completed before any other work begins — git history rewrite affects all branches.

## Acceptance Criteria

- [ ] AC-1: All API keys previously committed to `.env` and `.env.local` are rotated and the files are purged from git history using `git filter-repo`
- [ ] AC-2: `build-1774590211242.ipa` is removed from the repo and `*.ipa` is added to `.gitignore`
- [ ] AC-3: Dead directories removed: `holocron-mcp.backup/`, `holocron-general-mcp.old/`, `.tmp/`, `.claude/worktrees/`
- [ ] AC-4: Personal files removed: `karat-interview-prep-guide.md`, `linkedin-post-research-game.md`, `exa-vs-jina-deepresearch-comparison-20260306.md`
- [ ] AC-5: `.DS_Store` files removed and pattern added to `.gitignore`
- [ ] AC-6: MIT LICENSE file added at repo root
- [ ] AC-7: Dead Supabase infrastructure removed: `supabase/` directory and `.github/workflows/deploy-supabase.yml`
- [ ] AC-8: Personal identifiers redacted from config: `owner: 'hackerpug'` in `app.config.cjs`, ASC credentials in `eas.json` moved to env vars or CI secrets
- [ ] AC-9: `EXPO_PUBLIC_OPENAI_API_KEY` renamed to non-public prefix in documentation and `.env.example`
