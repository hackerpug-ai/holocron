# Epic 1: Open-Source Foundation

> Epic Sequence: 1
> PRD: /Users/justinrich/Projects/holocron/.spec/prd/open-source-readiness/README.md
> Tasks: 9

## Overview

Transform the repository from a private personal project into a legally safe and professionally presented open-source portfolio. This epic removes all sensitive data, personal artifacts, and adds essential open-source infrastructure (LICENSE, proper git hygiene). This is the foundational epic — all subsequent work builds on a clean, safe codebase.

## Human Test Steps

When this epic is complete, users should be able to:

1. Clone the repository and see a LICENSE file at the root
2. Search the git history for API keys and find zero results
3. Find no binary files (.ipa, .DS_Store) in the repository
4. See no personal artifacts (interview prep, LinkedIn drafts) in the tree
5. Verify that .env.example uses non-public naming for sensitive keys
6. Confirm no dead directories (backup, old, tmp) exist in the repo

## Acceptance Criteria (from PRD)

- AC-1: All API keys previously committed to `.env` and `.env.local` are rotated and the files are purged from git history using `git filter-repo`
- AC-2: `build-1774590211242.ipa` is removed from the repo and `*.ipa` is added to `.gitignore`
- AC-3: Dead directories removed: `holocron-mcp.backup/`, `holocron-general-mcp.old/`, `.tmp/`, `.claude/worktrees/`
- AC-4: Personal files removed: `karat-interview-prep-guide.md`, `linkedin-post-research-game.md`, `exa-vs-jina-deepresearch-comparison-20260306.md`
- AC-5: `.DS_Store` files removed and pattern added to `.gitignore`
- AC-6: MIT LICENSE file added at repo root
- AC-7: Dead Supabase infrastructure removed: `supabase/` directory and `.github/workflows/deploy-supabase.yml`
- AC-8: Personal identifiers redacted from config: `owner: 'hackerpug'` in `app.config.cjs`, ASC credentials in `eas.json` moved to env vars or CI secrets
- AC-9: `EXPO_PUBLIC_OPENAI_API_KEY` renamed to non-public prefix in documentation and `.env.example`

## PRD Sections Covered

- S2.1 - Open-Source Blockers (P0)

## Dependencies

This epic MUST be completed first. Git history rewrite affects all branches and cannot be done incrementally.

## Task List

| Task ID | Title | Type | Priority | Blocked By |
|---------|-------|------|----------|------------|
| OS-001 | Rotate and purge API keys from git history | INFRA | P0 | - |
| OS-002 | Remove binary files and add to gitignore | INFRA | P0 | - |
| OS-003 | Remove dead directories | INFRA | P0 | - |
| OS-004 | Remove personal files | INFRA | P0 | - |
| OS-005 | Remove .DS_Store files and update gitignore | INFRA | P0 | - |
| OS-006 | Add MIT LICENSE file | INFRA | P0 | - |
| OS-007 | Remove dead Supabase infrastructure | INFRA | P0 | - |
| OS-008 | Redact personal identifiers from config | INFRA | P0 | - |
| OS-009 | Rename sensitive env var in documentation | INFRA | P0 | - |
