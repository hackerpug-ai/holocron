import { runPitrRestore } from '../../services/platform/src/backup/restore.ts';

const scratch = '/tmp/d05-04-diag';
const pitr = '2026-07-29T00:20:00Z';
console.log('starting restore', { scratch, pitr });
const r = await runPitrRestore({
  pitr,
  scratch,
  targetAction: 'promote',
  skipStart: true,
  statusPath: '/tmp/d05-04-diag-status.json',
});
console.log(
  JSON.stringify(
    {
      ok: r.ok,
      exitCode: r.exitCode,
      errors: r.errors,
      namedErrors: r.namedErrors,
      actualStopTimestamp: r.actualStopTimestamp,
      stderr: (r.stderr || '').slice(0, 2500),
      stdout: (r.stdout || '').slice(0, 2500),
    },
    null,
    2
  )
);
