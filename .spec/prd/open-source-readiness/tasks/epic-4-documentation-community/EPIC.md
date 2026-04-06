# Epic 4: Documentation & Community

> **Priority**: P1 (High) / P2 (Normal)
> **PRD Sections**: S2.5 (README & Documentation) + S2.7 (Community Readiness)
> **Tasks**: 11 tasks planned

## Overview

Refresh the README with accurate information, add screenshots and architecture diagrams, and create standard open-source community files.

## Human Test

1. Open the repository — README accurately describes the project
2. Check README — has screenshots/GIF showing the mobile app
3. Check README — has architecture diagram
4. Check root — `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` exist
5. Check `.github` — issue and PR templates exist

## PRD Coverage

- **S2.5 README & Documentation Refresh** (AC-27 to AC-34)
  - Update schema table to reflect actual tables
  - Fix embedding dimensions (1024, not 1536)
  - Update tech stack with actual AI providers
  - Correct setup commands
  - Add screenshots or demo GIF
  - Add architecture diagram
  - Update license section
  - Add MCP server section

- **S2.7 Community Readiness** (AC-39 to AC-43)
  - Write `CONTRIBUTING.md`
  - Add GitHub issue templates
  - Add pull request template
  - Add `CODE_OF_CONDUCT.md`
  - Pin GitHub Actions to SHAs

## Dependencies

**Blocks**: None (documentation can be done in parallel with other work)
**Blocked by**: Epic 1 (must complete git history rewrite first)

## Tasks

- [DOC-001](DOC-001.md): Update README schema table
- [DOC-002](DOC-002.md): Fix embedding dimensions in docs
- [DOC-003](DOC-003.md): Update tech stack section
- [DOC-004](DOC-004.md): Correct setup commands
- [DOC-005](DOC-005.md): Add screenshots or demo GIF
- [DOC-006](DOC-006.md): Add architecture diagram
- [DOC-007](DOC-007.md): Update license section
- [DOC-008](DOC-008.md): Add MCP server section
- [DOC-009](DOC-009.md): Write CONTRIBUTING.md
- [DOC-010](DOC-010.md): Add GitHub templates (issues, PR, CoC)
- [DOC-011](DOC-011.md): Pin GitHub Actions to SHAs

## Success Metrics

- README accurately reflects the actual codebase
- Screenshots/demo GIF present
- Architecture diagram shows data flow
- All community files present and complete
