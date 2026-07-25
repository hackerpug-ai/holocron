/**
 * DEPENDENCY-S24-E2E-SUBSTRATE AC-1 — seed:e2e --reset (real CLI + Postgres).
 *
 * Seeds conversations, documents, feed items, subscriptions, research, and assimilation plans
 * matching the Zero-published Postgres surface. Refuse prod; idempotent with --reset.
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run services/platform/src/cli/__tests__/seed-e2e.test.ts
 */
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { PLATFORM_IT, runHolo } from './fixtures/harness';

const itLive = PLATFORM_IT ? it : it.skip;

const NONPROD_URL = process.env.DATABASE_URL?.includes('holocron_nonprod')
  ? process.env.DATABASE_URL
  : 'postgres://127.0.0.1:5432/holocron_nonprod';

function psqlCount(table: string): number {
  const r = spawnSync(
    'psql',
    [NONPROD_URL, '-t', '-A', '-c', `SELECT count(*)::int FROM ${table}`],
    { encoding: 'utf8', timeout: 15_000 }
  );
  if (r.status !== 0) return -1;
  const n = Number((r.stdout ?? '').trim());
  return Number.isFinite(n) ? n : -1;
}

function psqlDistinctCategories(): number {
  const r = spawnSync(
    'psql',
    [
      NONPROD_URL,
      '-t',
      '-A',
      '-c',
      `SELECT count(DISTINCT category)::int FROM documents WHERE category IS NOT NULL`,
    ],
    { encoding: 'utf8', timeout: 15_000 }
  );
  if (r.status !== 0) return -1;
  const n = Number((r.stdout ?? '').trim());
  return Number.isFinite(n) ? n : -1;
}

describe('AC-1: holo seed:e2e --reset (real CLI + Postgres)', () => {
  it('command is registered (not unknown) and help mentions seed:e2e', () => {
    const help = runHolo(['--help']);
    expect(help.combined, 'help must document seed:e2e').toMatch(/seed:e2e/);
  });

  itLive(
    'seed:e2e --reset seeds conversations, documents, feed items, and subscription content',
    () => {
      const first = runHolo(['seed:e2e', '--reset', '--json'], {
        env: { DATABASE_URL: NONPROD_URL, HOLO_ALLOW_PROD_SEED: undefined },
        timeoutMs: 120_000,
      });
      expect(first.status, `seed:e2e must exit 0: ${first.combined}`).toBe(0);
      expect(first.combined).not.toMatch(/unknown command/i);

      const body = first.stdout.includes('{')
        ? first.stdout.slice(first.stdout.indexOf('{'))
        : first.stdout;
      const parsed = JSON.parse(body) as {
        ok?: boolean;
        conversations?: number;
        documents?: number;
        feed_items?: number;
        messages?: number;
        categories?: number;
        subscription_sources?: number;
        subscription_content?: number;
        research_sessions?: number;
        research_iterations?: number;
        assimilation_sessions?: number;
        seed_fingerprint?: string;
      };
      expect(parsed.ok, first.combined).toBe(true);
      expect(
        parsed.conversations,
        'must seed 3 drawer conversations plus the reference conversation'
      ).toBe(4);
      expect(parsed.documents, 'must seed 17 documents').toBe(17);
      expect(parsed.feed_items, 'must seed 5 feed items').toBe(5);
      expect(parsed.subscription_sources, 'must seed 4 subscription sources').toBe(4);
      expect(parsed.subscription_content, 'must seed 4 researched subscription rows').toBe(4);
      expect(
        parsed.research_sessions,
        'must seed active, completed, and saved-document research'
      ).toBe(3);
      expect(parsed.research_iterations, 'must seed research progress').toBe(5);
      expect(parsed.assimilation_sessions, 'must seed 3 pending review plans').toBe(3);
      expect((parsed.messages ?? 0) >= 3, 'each conversation needs ≥1 message').toBe(true);
      expect((parsed.categories ?? 0) >= 3, 'documents must span multiple categories').toBe(true);

      // Live Postgres counts (not JSON self-report alone)
      expect(psqlCount('conversations')).toBe(4);
      expect(psqlCount('chat_messages')).toBeGreaterThanOrEqual(3);
      expect(psqlCount('documents')).toBe(17);
      expect(psqlCount('feed_items')).toBe(5);
      expect(psqlCount('subscription_sources')).toBe(4);
      expect(psqlCount('subscription_content')).toBe(4);
      expect(psqlCount('research_sessions')).toBe(3);
      expect(psqlCount('research_iterations')).toBe(5);
      expect(psqlCount('assimilation_sessions')).toBe(3);
      expect(psqlDistinctCategories()).toBeGreaterThanOrEqual(3);

      // Idempotent: second --reset yields same fingerprint + counts
      const second = runHolo(['seed:e2e', '--reset', '--json'], {
        env: { DATABASE_URL: NONPROD_URL },
        timeoutMs: 120_000,
      });
      expect(second.status, second.combined).toBe(0);
      const body2 = second.stdout.includes('{')
        ? second.stdout.slice(second.stdout.indexOf('{'))
        : second.stdout;
      const parsed2 = JSON.parse(body2) as { seed_fingerprint?: string; ok?: boolean };
      expect(parsed2.ok).toBe(true);
      expect(parsed2.seed_fingerprint).toBe(parsed.seed_fingerprint);
      expect(psqlCount('conversations')).toBe(4);
      expect(psqlCount('documents')).toBe(17);
      expect(psqlCount('feed_items')).toBe(5);
      expect(psqlCount('subscription_sources')).toBe(4);
      expect(psqlCount('subscription_content')).toBe(4);
      expect(psqlCount('research_sessions')).toBe(3);
      expect(psqlCount('research_iterations')).toBe(5);
      expect(psqlCount('assimilation_sessions')).toBe(3);
    },
    180_000
  );

  itLive('seed:e2e refuses production-like DATABASE_URL', () => {
    const r = runHolo(['seed:e2e', '--reset', '--json'], {
      env: {
        DATABASE_URL: 'postgres://127.0.0.1:5432/holocron',
        HOLO_ALLOW_PROD_SEED: undefined,
      },
      timeoutMs: 30_000,
    });
    expect(r.status, `must fail closed on prod: ${r.combined}`).not.toBe(0);
    expect(r.combined).toMatch(/refus|prod/i);
  });
});
