import { agents, IMPLEMENTER_TARGET, REVIEWER_TARGET } from './.rogueone/agents';

/**
 * The installed RogueOne host re-validates this default export with its own
 * defineRogueoneConfig implementation. Keeping the project file dependency-free
 * avoids a non-portable file:../rogueone package edge in fresh task worktrees.
 */
function defineRogueoneConfig<T>(config: T): T {
  return config;
}

export default defineRogueoneConfig({
  defaults: {
    ...IMPLEMENTER_TARGET,
  },

  agents,

  principals: {
    implementer: {
      handle: 'mastra-implementer',
      git_name: 'Justin Rich',
      git_email: 'justin@hackerpug.com',
    },
    reviewer: {
      handle: 'mastra-reviewer',
      git_name: 'Justin Rich (review)',
      git_email: 'justin+review@hackerpug.com',
    },
    maintainer: {
      handle: 'integrator',
      git_name: 'Justin Rich (maintain)',
      git_email: 'justin+main@hackerpug.com',
    },
  },

  roles: {
    implementer: {
      persistSession: true,
      byLanguage: {
        typescript: { ...IMPLEMENTER_TARGET },
        python: { ...IMPLEMENTER_TARGET },
      },
    },
    reviewer: {
      persistSession: false,
      ...REVIEWER_TARGET,
    },
  },

  credentials: {
    source: 'env',
    allow: [
      'ANTHROPIC_API_KEY',
      'BACKUP_R2_ACCESS_KEY_ID',
      'BACKUP_R2_SECRET_ACCESS_API_TOKEN',
      'BACKUP_R2_SECRET_ACCESS_KEY',
      'CLOUDFLARE_API_TOKEN',
      'DATABASE_URL',
      'DEEPGRAM_API_KEY',
      'DEEPSEEK_API_KEY',
      'ELEVENLABS_API_KEY',
      'EXPO_PUBLIC_RN_API_KEY',
      'EXPO_TOKEN',
      'FLEET_KEY',
      'HOLO_KEY_CONTROL',
      'HOLO_KEY_MCP',
      'HOLO_KEY_RN',
      'MASTRA_API_KEY',
      'OPENROUTER_API_KEY',
      'R2_ACCESS_KEY_ID',
      'R2_ACCOUNT_ID',
      'R2_BUCKET_NAME',
      'R2_CREDENTIAL_POLICY',
      'R2_ENDPOINT',
      'R2_PGBACKREST_PREFIX',
      'R2_REPO_CIPHER_PASS',
      'R2_RESTIC_PREFIX',
      'R2_RESTORE_ACCESS_KEY_ID',
      'R2_RESTORE_SECRET_ACCESS_KEY',
      'R2_RESTORE_SESSION_TOKEN',
      'R2_SCOPE_PROBE_IN_KEY',
      'R2_SCOPE_PROBE_OUT_KEY',
      'R2_SECRET_ACCESS_KEY',
      'RESTIC_PASSWORD',
      'TAILSCALE_AUTH_KEY',
      'YOUTUBE_API_KEY',
      'ZAI_API_KEY',
      'ZERO_ADMIN_PASSWORD',
    ],
  },

  holdout: { storeRoot: '~/.rogueone/holdout' },

  verifications: ['pnpm lint', 'pnpm typecheck', 'pnpm test:unit', 'pnpm test:lanes'],
  // --no-color keeps vitest's "Tests N ... (M)" summary machine-readable: the
  // loop gate parses that line to enforce min_tests, and ANSI escapes (emitted
  // when TERM is inherited as xterm-256color) break the parse. Purely cosmetic.
  test_command: 'pnpm exec vitest run --no-color',

  dispatch: {
    maxRetries: 1,
    timeoutMs: 1_800_000,
    brainRootAllowlist: ['/Users/justinrich/Projects/brain', '/Users/justinrich/Projects/holocron'],
  },

  loop: {
    dispatchTimeoutMs: 1_800_000,
    worktreeTeardown: 'on-land',
    sessionPolicy: 'fresh',
    scratchFile: '.rogueone-scratch.md',
    requireAgentCommit: true,
  },

  verify: {
    timeoutMs: 1_800_000,
  },

  governance: {
    maxMergeReviewCycles: 2,
    maxRemediationCycles: 2,
    maxVerdictParseRetries: 2,
  },

  concurrency: 1,

  providers: {
    [IMPLEMENTER_TARGET.provider]: { maxInFlight: 1 },
    [REVIEWER_TARGET.provider]: { maxInFlight: 1 },
  },

  reviewers: [
    {
      lens: 'product',
      packet: { content: 'specs', report: 'informed' },
      sticky: 'hold',
    },
    {
      lens: 'technical',
      packet: { content: 'diff', report: 'blind' },
    },
  ],

  observability: {
    project_id: 'holocron',
    agent_intel: {
      ensure_global_sessions: true,
    },
  },
});
