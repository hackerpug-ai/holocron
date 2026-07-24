/**
 * S-REWRITE-01 — Chat + conversations cluster rewired off convex/react onto Zero/Hono.
 *
 * Static + file-level contracts (always run). Behavioral Maestro ACs are
 * exercised separately via `.maestro/chat/*.yml` when a simulator is available.
 *
 * Negative control: against the pre-rewire start (convex/react still present),
 * AC-6 assertions MUST fail. After GREEN, they pass.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

const CLUSTER_ROOTS = [
  join(REPO_ROOT, 'app', '(drawer)', 'chat'),
  join(REPO_ROOT, 'components', 'chat'),
  join(REPO_ROOT, 'hooks', 'use-chat-history.ts'),
  join(REPO_ROOT, 'hooks', 'use-agent-activity.ts'),
  join(REPO_ROOT, 'app', '(drawer)', '_layout.tsx'),
  join(REPO_ROOT, 'components', 'agent', 'ToolApprovalCard.tsx'),
] as const;

const QUERIES_PATH = join(REPO_ROOT, 'app', 'zero', 'queries.ts');
const SCHEMA_PATH = join(REPO_ROOT, 'app', 'zero', 'schema.ts');

const CONVEX_REACT_IMPORT = /from\s+['"]convex\/react['"]/;
const CONVEX_API_IMPORT = /from\s+['"]@\/convex\/_generated\/api['"]/;

function listSourceFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const st = statSync(root);
  if (st.isFile()) return [root];
  const out: string[] = [];
  for (const name of readdirSync(root)) {
    const p = join(root, name);
    const s = statSync(p);
    if (s.isDirectory()) {
      // skip stories and tests inside components
      if (name === '__tests__' || name === 'node_modules') continue;
      out.push(...listSourceFiles(p));
    } else if (
      /\.(ts|tsx)$/.test(name) &&
      !name.endsWith('.stories.tsx') &&
      !name.endsWith('.test.ts') &&
      !name.endsWith('.test.tsx')
    ) {
      out.push(p);
    }
  }
  return out;
}

function clusterSourceFiles(): string[] {
  return CLUSTER_ROOTS.flatMap(listSourceFiles);
}

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('S-REWRITE-01 chat cluster Zero/Hono rewire', () => {
  describe('AC-6 — zero convex/react imports in the chat cluster [PRIMARY]', () => {
    it("cluster roots contain zero `from 'convex/react'` imports", () => {
      const hits: string[] = [];
      for (const file of clusterSourceFiles()) {
        const src = read(file);
        if (CONVEX_REACT_IMPORT.test(src)) {
          hits.push(file.replace(REPO_ROOT + '/', ''));
        }
      }
      expect(hits, `convex/react imports remain in:\n${hits.join('\n')}`).toEqual([]);
    });

    it('cluster hooks/screens do not import @/convex/_generated/api', () => {
      const roots = [
        join(REPO_ROOT, 'hooks', 'use-chat-history.ts'),
        join(REPO_ROOT, 'hooks', 'use-agent-activity.ts'),
        join(REPO_ROOT, 'app', '(drawer)', '_layout.tsx'),
        join(REPO_ROOT, 'app', '(drawer)', 'chat', '[conversationId].tsx'),
        join(REPO_ROOT, 'components', 'chat', 'ChatPickerSheet.tsx'),
        join(REPO_ROOT, 'components', 'chat', 'MessageBubble.tsx'),
        join(REPO_ROOT, 'components', 'agent', 'ToolApprovalCard.tsx'),
      ];
      const hits: string[] = [];
      for (const file of roots) {
        if (!existsSync(file)) continue;
        if (CONVEX_API_IMPORT.test(read(file))) {
          hits.push(file.replace(REPO_ROOT + '/', ''));
        }
      }
      expect(hits, `convex api imports remain in:\n${hits.join('\n')}`).toEqual([]);
    });

    it('cluster hooks import from app/zero/queries (>=1 Zero import)', () => {
      const history = read(join(REPO_ROOT, 'hooks', 'use-chat-history.ts'));
      const agent = read(join(REPO_ROOT, 'hooks', 'use-agent-activity.ts'));
      const combined = history + '\n' + agent;
      expect(
        combined,
        'use-chat-history / use-agent-activity must import from app/zero/queries'
      ).toMatch(
        /from\s+['"]@?\/?.*zero\/queries['"]|from\s+['"]\.\.\/app\/zero\/queries['"]|from\s+['"]@\/app\/zero\/queries['"]/
      );
    });
  });

  describe('Zero seam — queries required by chat contract', () => {
    it('exports conversationsByOwner builder query', () => {
      const src = read(QUERIES_PATH);
      expect(src).toMatch(/export\s+(?:const|function)\s+conversationsByOwner\b/);
      expect(src).toMatch(/builder\.conversations\b/);
    });

    it('exports conversationById builder query', () => {
      const src = read(QUERIES_PATH);
      expect(src).toMatch(/export\s+(?:const|function)\s+conversationById\b/);
    });

    it('exports chatMessagesByConversation builder query', () => {
      const src = read(QUERIES_PATH);
      expect(src).toMatch(/export\s+(?:const|function)\s+chatMessagesByConversation\b/);
    });

    it('exports conversationsBySearchTerm builder query', () => {
      const src = read(QUERIES_PATH);
      expect(src).toMatch(/export\s+(?:const|function)\s+conversationsBySearchTerm\b/);
    });

    it('exports toolCallById builder query', () => {
      const src = read(QUERIES_PATH);
      expect(src).toMatch(/export\s+(?:const|function)\s+toolCallById\b/);
    });

    it('exports deepResearchSessionById builder query', () => {
      const src = read(QUERIES_PATH);
      expect(src).toMatch(/export\s+(?:const|function)\s+deepResearchSessionById\b/);
    });

    it('exports agentActivityByConversation builder query', () => {
      const src = read(QUERIES_PATH);
      expect(src).toMatch(/export\s+(?:const|function)\s+agentActivityBy(?:Conversation|Owner)\b/);
    });

    it('schema publishes conversations + chat_messages (+ cluster tables)', () => {
      const src = read(SCHEMA_PATH);
      expect(src).toMatch(/table\(\s*['"]conversations['"]/);
      expect(src).toMatch(/table\(\s*['"]chat_messages['"]/);
      expect(src).toMatch(/table\(\s*['"]tool_calls['"]/);
      expect(src).toMatch(/table\(\s*['"]agent_plans['"]/);
      expect(src).toMatch(/table\(\s*['"]research_sessions['"]/);
    });
  });

  describe('AC-1/AC-3 wiring — drawer + history bind to Zero useQuery', () => {
    it('drawer layout imports useQuery from @rocicorp/zero/react (not convex)', () => {
      const src = read(join(REPO_ROOT, 'app', '(drawer)', '_layout.tsx'));
      expect(src).toMatch(/from\s+['"]@rocicorp\/zero\/react['"]/);
      expect(src).not.toMatch(CONVEX_REACT_IMPORT);
      expect(src).toMatch(/conversationsByOwner/);
    });

    it('use-chat-history uses chatMessagesByConversation', () => {
      const src = read(join(REPO_ROOT, 'hooks', 'use-chat-history.ts'));
      expect(src).toMatch(/chatMessagesByConversation/);
      expect(src).toMatch(/from\s+['"]@rocicorp\/zero\/react['"]/);
      expect(src).not.toMatch(CONVEX_REACT_IMPORT);
    });

    it('chat screen send path posts to Hono /api/chat-runs (no useAction)', () => {
      const src = read(join(REPO_ROOT, 'app', '(drawer)', 'chat', '[conversationId].tsx'));
      expect(src).toMatch(/\/api\/chat-runs/);
      expect(src).not.toMatch(/\buseAction\b/);
      expect(src).not.toMatch(CONVEX_REACT_IMPORT);
    });

    it('chat screen cancel path posts to Hono /api/chat-runs/:id/cancel', () => {
      const src = read(join(REPO_ROOT, 'app', '(drawer)', 'chat', '[conversationId].tsx'));
      expect(src).toMatch(/\/api\/chat-runs\/.*cancel|chat-runs\/\$\{.*\}\/cancel/);
      expect(src).not.toMatch(/api\.chat\.agentMutations\.cancelAgent/);
    });

    it('drawer rename uses Zero mutator (mutate.conversations.update)', () => {
      const src = read(join(REPO_ROOT, 'app', '(drawer)', '_layout.tsx'));
      expect(src).toMatch(/mutate\.conversations\.update|updateConversation/);
      expect(src).not.toMatch(/api\.conversations\.mutations\.update/);
    });
  });

  describe('Maestro flow files present for behavioral ACs', () => {
    const flows = [
      'drawer-loads-seeded.yml',
      'rename-reflects.yml',
      'thread-loads.yml',
      'send-streams.yml',
      'cancel-works.yml',
    ];
    for (const flow of flows) {
      it(`.maestro/chat/${flow} exists`, () => {
        expect(existsSync(join(REPO_ROOT, '.maestro', 'chat', flow))).toBe(true);
      });
    }
  });
});
