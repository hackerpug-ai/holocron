/**
 * D02-01 — Fail-closed integration lane (platform package).
 * Real TCP/HTTP connectivity probes for the PLATFORM_IT integration lane.
 */
import { connect as netConnect } from 'node:net';
import { beforeAll, describe, expect, it } from 'vitest';

const PLATFORM_IT = process.env.PLATFORM_IT === '1';
const DATABASE_URL = process.env.DATABASE_URL;
const FLEET_URL = process.env.FLEET_URL ?? 'http://127.0.0.1:4545';

function parsePgUrl(url: string): { host: string; port: number } {
  const u = new URL(url);
  return { host: u.hostname || '127.0.0.1', port: u.port ? Number(u.port) : 5432 };
}

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

async function probeFleet(url: string): Promise<void> {
  const base = url.replace(/\/v1\/?$/, '').replace(/\/$/, '');
  // Probe models endpoint first (OpenAI-compatible fleet), then root.
  try {
    const res = await fetch(`${base}/v1/models`, { signal: AbortSignal.timeout(2_000) });
    void res;
  } catch {
    const res = await fetch(base, { signal: AbortSignal.timeout(2_000) });
    void res;
  }
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
      await probePostgresTcp(DATABASE_URL);
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
    await probePostgresTcp(DATABASE_URL!);
  });

  it('PLATFORM_IT live gate requires real FLEET_URL', async () => {
    expect(FLEET_URL).toBeTruthy();
    await probeFleet(FLEET_URL);
  });
});
