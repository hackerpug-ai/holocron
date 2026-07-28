/**
 * REDHAT-FIX-S27-18 / R-3 — kill induction honesty (no mid-archive / production_catch theatre).
 */
import { describe, expect, it } from 'vitest';
import { induceBackupFailure } from '../../src/backup/alerting';
import { killRealPgbackrestProcess } from '../../src/backup/wal-archive';

const live = process.env.PLATFORM_IT === '1';
const d = live ? describe : describe.skip;

d('REDHAT-FIX-S27-18 kill induction honesty', () => {
  it('AC-1/AC-2: staged shell kill is real_process_killed, not mid_archive, production_catch false', async () => {
    const evidence = killRealPgbackrestProcess({ waitMs: 80 });
    expect(evidence.real_process_killed).toBe(true);
    expect(evidence.mid_archive).toBe(false);
    expect(evidence.kill_kind === 'staged_shell' || evidence.kill_kind === 'direct_binary').toBe(
      true
    );
    expect(evidence.kill_kind).not.toBe('mid_archive');

    const result = await induceBackupFailure('kill_wal_behind', 'wal_archive');
    expect(result.induction.path).toBe('production_truth');
    expect(result.induction.real_process_killed).toBe(true);
    expect(result.induction.production_catch).toBe(false);
    expect(result.induction.mid_archive).toBe(false);
    expect(result.heartbeat.status).toBe('failed');
  }, 60_000);

  it('AC-4: negative control — mid_archive not claimed for sleep/info shell spawn_args', () => {
    const evidence = killRealPgbackrestProcess({ waitMs: 50 });
    const args = evidence.spawn_args.join(' ');
    // staged path uses help/info/sleep — must not claim mid_archive
    if (/help|info|sleep/.test(args) || evidence.kill_kind === 'staged_shell') {
      expect(evidence.mid_archive).toBe(false);
    }
  });
});
