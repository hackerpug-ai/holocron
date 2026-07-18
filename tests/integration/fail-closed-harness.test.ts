/**
 * D02-01 — Fail-closed integration lane (root).
 *
 * Real Postgres + real fleet TCP/HTTP probes only. No mocks.
 * When PLATFORM_IT=1 and either dependency is unreachable, the suite fails
 * closed (nonzero exit, zero passed tests).
 *
 *   PLATFORM_IT=1 DATABASE_URL=... FLEET_URL=... pnpm test:integration
 */
import { connect as netConnect } from 'node:net';
import { beforeAll, describe, expect, it } from 'vitest';

const PLATFORM_IT = process.env.PLATFORM_IT === '1';
const DATABASE_URL = process.env.DATABASE_URL;
const FLEET_URL = process.env.FLEET_URL ?? 'http://127.0.0.1:4545';

function parsePgUrl(url: string): { host: string; port: number } {
  const u = new URL(url);
  return {
    host: u.hostname || '127.0.0.1',
    port: u.port ? Number(u.port) : 5432,
  };
}

/** Real TCP connect to Postgres host:port — no mock client. */
function probePostgresTcp(url: string, timeoutMs = 2000): Promise<void> {
  const { host, port } = parsePgUrl(url);
  return new Promise((resolve, reject) => {
    const socket = netConnect({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`Postgres TCP timeout ${host}:${port}`));
    }, timeoutMs);
    socket.once('connect', () => {
      clearTimeout(timer);
      socket.end();
      resolve();
    });
    socket.once('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`Postgres unreachable at ${host}:${port}: ${err.message}`));
    });
  });
}

/** Real HTTP probe to the OpenAI-compatible fleet endpoint. */
async function probeFleet(url: string): Promise<void> {
  const base = url.replace(/\/v1\/?$/, '').replace(/\/$/, '');
  const res = await fetch(`${base}/v1/models`, {
    signal: AbortSignal.timeout(2_000),
  });
  if (!res.ok) {
    throw new Error(`Fleet endpoint HTTP ${res.status}`);
  }
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
    try {
      await probePostgresTcp(DATABASE_URL);
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
    await probePostgresTcp(DATABASE_URL!);
  });

  it('connects to real fleet via FLEET_URL (no mock)', async () => {
    await probeFleet(FLEET_URL);
  });
});
