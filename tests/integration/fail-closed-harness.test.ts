/**
 * D02-01 — Fail-closed integration lane (root).
 *
 * Real Postgres + real fleet probes only. No mocks.
 * When PLATFORM_IT=1 and either dependency is unreachable, the suite fails
 * closed (nonzero exit, zero passed tests).
 *
 *   PLATFORM_IT=1 DATABASE_URL=... FLEET_URL=... pnpm test:integration
 */
import postgres from 'postgres';
import { beforeAll, describe, expect, it } from 'vitest';

const PLATFORM_IT = process.env.PLATFORM_IT === '1';
const DATABASE_URL = process.env.DATABASE_URL;
const FLEET_URL = process.env.FLEET_URL ?? 'http://127.0.0.1:4545';

async function probePostgres(url: string): Promise<void> {
  const sql = postgres(url, {
    max: 1,
    connect_timeout: 2,
    idle_timeout: 1,
    max_lifetime: 5,
  });
  try {
    await sql`select 1 as ok`;
  } finally {
    await sql.end({ timeout: 1 }).catch(() => undefined);
  }
}

async function probeFleet(url: string): Promise<void> {
  const base = url.replace(/\/v1\/?$/, '').replace(/\/$/, '');
  // Prefer /health; any TCP-accepted HTTP response proves reachability.
  // Connection refused / timeout must throw (fail closed).
  const res = await fetch(`${base}/health`, {
    signal: AbortSignal.timeout(2_000),
  });
  // Even 404 means the endpoint is reachable; only network errors throw.
  void res;
}

describe('D02-01 fail-closed harness (root)', () => {
  beforeAll(async () => {
    if (!PLATFORM_IT) {
      throw new Error(
        'PLATFORM_IT=1 required for fail-closed integration lane — refusing skip-to-green'
      );
    }
    if (!DATABASE_URL) {
      throw new Error('DATABASE_URL required for fail-closed integration lane');
    }
    // Fail closed if either dependency is down (before any test can pass).
    try {
      await probePostgres(DATABASE_URL);
    } catch (err) {
      throw new Error(
        `Postgres unreachable at DATABASE_URL=${DATABASE_URL}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
    try {
      await probeFleet(FLEET_URL);
    } catch (err) {
      throw new Error(
        `Fleet unreachable at FLEET_URL=${FLEET_URL}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  });

  it('connects to real Postgres via DATABASE_URL (no mock)', async () => {
    expect(DATABASE_URL).toBeTruthy();
    await probePostgres(DATABASE_URL!);
  });

  it('connects to real fleet via FLEET_URL (no mock)', async () => {
    await probeFleet(FLEET_URL);
  });
});
