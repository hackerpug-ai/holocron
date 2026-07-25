# Pre-existing issues (not introduced by S-REACTIVE-02)

- `pnpm lint` reports 68 errors / 664 warnings repo-wide (biome format on unrelated fixtures/services). Changed files only: 1 pre-existing warning (`citation.url!` non-null assertion in DeepResearchDetailView).
- `pnpm test:unit` in this worktree fails 2 narration suites due to vitest-native `@fs` resolution against symlinked node_modules; primary repo `pnpm test:unit` is green (965 passed).
- Mission progress via `mission_runs` remains out of scope (excluded from zero_pub).
