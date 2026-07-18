/**
 * D02-03 runner status fail-closed tests (bun:test).
 */
import { describe, expect, test } from 'bun:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkRunnerStatus, REQUIRED_RUNNER_LABELS } from '../../src/ci/runner-status.ts';

describe('D02-03 runner-status', () => {
  test('AC-2 offline / missing status fails closed', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'runner-status-'));
    const file = join(dir, 'offline.json');
    writeFileSync(
      file,
      JSON.stringify({
        online: false,
        runners: [{ name: 'x', status: 'offline', labels: [...REQUIRED_RUNNER_LABELS] }],
      })
    );
    const prev = process.env.HOLO_RUNNER_STATUS_FILE;
    process.env.HOLO_RUNNER_STATUS_FILE = file;
    delete process.env.GITHUB_TOKEN;
    delete process.env.GH_TOKEN;
    try {
      const r = await checkRunnerStatus({ statusFile: file });
      expect(r.ok).toBe(false);
      expect(r.online).toBe(false);
      expect(r.errors.length).toBeGreaterThan(0);
    } finally {
      if (prev === undefined) delete process.env.HOLO_RUNNER_STATUS_FILE;
      else process.env.HOLO_RUNNER_STATUS_FILE = prev;
    }
  });

  test('AC-1 online runner with required labels passes', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'runner-status-'));
    const file = join(dir, 'online.json');
    writeFileSync(
      file,
      JSON.stringify({
        online: true,
        runners: [
          {
            name: 'mini-1',
            status: 'online',
            labels: ['self-hosted', 'holocron', 'integration', 'e2e'],
          },
        ],
      })
    );
    const r = await checkRunnerStatus({ statusFile: file });
    expect(r.ok).toBe(true);
    expect(r.matching_runners.length).toBe(1);
  });

  test("AC-5 fail-closed without required labels", async () => {
    const dir = mkdtempSync(join(tmpdir(), 'runner-status-'));
    const file = join(dir, 'missing-labels.json');
    writeFileSync(
      file,
      JSON.stringify({
        online: true,
        runners: [{ name: 'bare', status: 'online', labels: ['self-hosted'] }],
      })
    );
    const r = await checkRunnerStatus({ statusFile: file });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/required labels/);
  });
});
