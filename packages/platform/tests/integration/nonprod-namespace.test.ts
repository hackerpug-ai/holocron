/**
 * D02-02 nonprod namespace + seed/reset (real Postgres).
 */
import { readFile } from 'node:fs/promises';
import { describe, expect, test } from 'vitest';
import {
  countPublicRows,
  dbStatusPayload,
  provisionNonprodNamespace,
  toNonprodUrl,
} from '../../src/db/nonprod.ts';
import { getReplStatus } from '../../src/db/repl-status.ts';
import { assertSeedTargetAllowed, seedDatabase } from '../../src/db/seed.ts';

const PLATFORM_IT = process.env.PLATFORM_IT === '1';
const PROD_URL = process.env.HOLO_PROD_URL ?? 'postgres://127.0.0.1:5432/holocron';
const NONPROD_URL = process.env.DATABASE_URL?.includes('holocron_nonprod')
  ? process.env.DATABASE_URL
  : toNonprodUrl(PROD_URL);

const describeLive = PLATFORM_IT ? describe : describe.skip;

describeLive('D02-02 nonprod-namespace (live Postgres)', () => {
  test('AC-1 nonprod provisioned and isolated from prod', async () => {
    const prodBefore = await countPublicRows(PROD_URL);
    const prov = await provisionNonprodNamespace({ ownerUrl: PROD_URL });
    expect(prov.ok).toBe(true);
    const status = await dbStatusPayload(NONPROD_URL);
    expect(status.connected).toBe(true);
    expect(status.database).toBe('holocron_nonprod');
    const prodAfter = await countPublicRows(PROD_URL);
    expect(prodAfter).toBe(prodBefore);
  });

  test('AC-2 seed --reset deterministic idempotent', async () => {
    const a = await seedDatabase({ databaseUrl: NONPROD_URL, reset: true });
    const b = await seedDatabase({ databaseUrl: NONPROD_URL, reset: true });
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(a.seed_fingerprint).toBe(b.seed_fingerprint);
    expect(a.table_count).toBe(b.table_count);
    expect(a.fixture_ids).toEqual(b.fixture_ids);
  });

  test('AC-3 prod seed guard fails closed', () => {
    const prev = process.env.HOLO_ALLOW_PROD_SEED;
    delete process.env.HOLO_ALLOW_PROD_SEED;
    expect(() => assertSeedTargetAllowed(PROD_URL)).toThrow(/refusing seed/);
    if (prev !== undefined) process.env.HOLO_ALLOW_PROD_SEED = prev;
  });

  test('AC-4 nonprod zero_pub membership live', async () => {
    await provisionNonprodNamespace({ ownerUrl: PROD_URL });
    const repl = await getReplStatus({ databaseUrl: NONPROD_URL });
    expect(repl.publicationExists).toBe(true);
    expect(repl.publicationName).toBe('zero_pub');
  });
});

describe('D02-02 nonprod-namespace (always)', () => {
  test('AC-5 env contract docs mention holocron_nonprod', async () => {
    const doc = await readFile(
      new URL('../../../../docs/ci/nonprod-namespace.md', import.meta.url),
      'utf8'
    );
    expect(doc).toMatch(/holocron_nonprod/);
    expect(doc).toMatch(/DATABASE_URL/);
    expect(doc).toMatch(/test:integration/);
  });
});
