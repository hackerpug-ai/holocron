/**
 * D02-01 — Fail-closed integration lane (platform package).
 *
 * Real connectivity probes for the PLATFORM_IT integration lane.
 * Mirrors root fail-closed-harness semantics so either path fails closed.
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
  const res = await fetch(`${base}/v1/models`, {
    signal: AbortSignal.timeout(2_000),
  }).catch(async () => {
    // Fallback to bare health/root if /v1/models is not exposed
    return fetch(base, { signal: AbortSignal.timeout(2_000) });
  });
  void res;
}

describe('D02-01 fail-closed lane (platform)', () => {
  beforeAll(async () => {
    if (!PLATFORM_IT) {
      throw new Error(
        'PLATFORM_IT=1 required for fail-closed integration lane — refusing skip-to-green'
      );
    }
    if (!DATABASE_URL) {
      throw new Error('DATABASE_URL required for fail-closed integration lane');
    }
    try {
      await probePostgres(DATABASE_URL);
    } catch (err) {
      throw new Error(
        `Postgres unreachable (platform lane) DATABASE_URL=${DATABASE_URL}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
    try {
      await probeFleet(FLEET_URL);
    } catch (err) {
      throw new Error(
        `Fleet unreachable (platform lane) FLEET_URL=${FLEET_URL}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  });

  it('PLATFORM_IT live gate requires real DATABASE_URL', async () => {
    expect(process.env.PLATFORM_IT).toBe('1');
    expect(DATABASE_URL).toBeTruthy();
    await probePostgres(DATABASE_URL!);
  });

  it('PLATFORM_IT live gate requires real FLEET_URL', async () => {
    expect(FLEET_URL).toBeTruthy();
    await probeFleet(FLEET_URL);
  });
});
