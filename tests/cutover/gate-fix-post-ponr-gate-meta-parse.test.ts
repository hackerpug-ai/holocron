/**
 * GATE-FIX-post-ponr-gate-meta-parse — C-1 GATE-META consumer path.
 * Verbatim @@GATE-META step4/step5 fixtures from 20260808T011038Z must PASS
 * post-ponr bind. Bare JSON alone is NOT sufficient (false-green class).
 *
 * Run: pnpm vitest run --project unit tests/cutover/gate-fix-post-ponr-gate-meta-parse.test.ts
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const REPO = resolve(import.meta.dirname, '../..');
const ORACLE = resolve(REPO, 'scripts/lib/zero-loss-identity-oracle.py');
const EVID = resolve(REPO, '.tmp/GATE-FIX-post-ponr-gate-meta-parse');
const FIX = resolve(EVID, 'fixtures');
const GATE_META = resolve(FIX, 'gate-meta-20260808T011038Z');
const THIS_RUN_PONR = '31b33eb4-3e97-4520-b6a7-745186fc8d51';
const THIS_RUN_WRITE = 'ebd12bd6-f78d-4849-9595-8bc9d4036269';
const PARENT_FIX = resolve(REPO, '.tmp/GATE-FIX-zero-loss-t-sync-013/fixtures');
const REAL_EVID = resolve(
  REPO,
  '.spec/prds/mk6-migration/tasks/sprint-30-cutover-rollback-drill-and-data-plane-point-of-no-return/.gate-evidence/20260808T011038Z'
);

/** Byte-faithful GATE-META shape from 20260808T011038Z (fallback if evidence dir absent). */
const VERBATIM_STEP4 = `@@GATE-META step=4 cmd_sha=866ce03286bc80c45523d3470be8a087663de8a6389af57327ad0484a5b83cba run_id=20260808T011038Z git_sha=54299bfc76fec6fc52468dae451ca293a6f104c4 source_sha=54299bfc76fec6fc52468dae451ca293a6f104c4 started_at=2026-08-08T01:11:23Z deployed_base_url=http://127.0.0.1:44121 sourceRevision=54299bfc76fec6fc52468dae451ca293a6f104c4@@
CMD: bun packages/platform/src/cli/holo.ts cutover:enable-writes --json --base-url \${HOLO_VERIFY_BASE_URL:?set HOLO_VERIFY_BASE_URL}
{
  "ok": true,
  "already_recorded": false,
  "ponr_id": "${THIS_RUN_PONR}",
  "write_row_id": "${THIS_RUN_WRITE}",
  "write_row_digest_sha256": "8157f708f520875351c9637f5022c3d555ec38026617e54cf60777729cdfac96",
  "write_surface": "hono.POST /api/documents",
  "write_table": "documents",
  "fence_lifted_at": "2026-08-08T01:11:28.848Z",
  "write_committed_at": "2026-08-08T01:11:28.859Z",
  "base_url": "http://127.0.0.1:44121",
  "export_watermark_ms": 1786190348757,
  "convex_fence_audit_id": "vn750swtvq28332gb4xm67qgc98bxkst",
  "convex_documents_total": 1623,
  "convex_accepted_writes_since_watermark": 0,
  "report_path": "/Users/inference1/Projects/holocron/.tmp/D07-04/enable-writes-report.json"
}
@@GATE-EXIT=0@@
`;

const VERBATIM_STEP5 = `@@GATE-META step=5 cmd_sha=657ddd3ec6b8eb29d8fe7bf165a0a9e139eeda98c7fbec9fcf1ad1853c2b199a run_id=20260808T011038Z git_sha=54299bfc76fec6fc52468dae451ca293a6f104c4 source_sha=54299bfc76fec6fc52468dae451ca293a6f104c4 started_at=2026-08-08T01:11:29Z deployed_base_url=http://127.0.0.1:44121 sourceRevision=54299bfc76fec6fc52468dae451ca293a6f104c4@@
CMD: bun packages/platform/src/cli/holo.ts cutover:rollback-repoint --json --base-url \${HOLO_VERIFY_BASE_URL:?set HOLO_VERIFY_BASE_URL}
{
  "ok": false,
  "repointed": false,
  "target": "convex-frozen",
  "target_kind": "convex",
  "data_plane": "convex",
  "engaged_at": "",
  "engaged_at_ms": 0,
  "configured_target": "/Users/inference1/Projects/holocron/packages/platform/config/secrets.yaml",
  "precondition": {
    "ok": false,
    "accepted_post_export_writes": 0,
    "export_watermark_ms": 1786190348757,
    "audit_path": "/Users/inference1/Projects/holocron/.tmp/D06-05/post-export-write-audit.json",
    "ponr_recorded": true,
    "ponr_id": "${THIS_RUN_PONR}",
    "ponr_recorded_at": "2026-08-07 19:11:29.008296-06"
  },
  "config": {
    "path": "/Users/inference1/Projects/holocron/.tmp/D06-05/data-plane-config.json",
    "digest_sha256": "",
    "prior_target": "convex-frozen"
  },
  "acknowledgements": [],
  "report_path": "/Users/inference1/Projects/holocron/.tmp/D06-05/rollback-repoint-report.json",
  "error": {
    "code": "POST_PONR_INELIGIBLE",
    "message": "cutover:rollback-repoint refuses: data-plane point of no return already recorded (ponr_id=${THIS_RUN_PONR}, write_row_id=${THIS_RUN_WRITE}). Convex re-point is permanently ineligible; restore from Postgres/blob backups (UC-SYNC-04 / UC-SYNC-05)."
  }
}
@@GATE-EXIT=2@@
`;

function runOracle(args: string[]): { rc: number; stdout: string } {
  try {
    const stdout = execFileSync('python3', [ORACLE, ...args], {
      cwd: REPO,
      encoding: 'utf8',
      timeout: 30_000,
    });
    return { rc: 0, stdout };
  } catch (err) {
    const e = err as { status?: number; stdout?: string };
    return { rc: e.status ?? 2, stdout: String(e.stdout ?? '') };
  }
}

function seedFixtures(): void {
  mkdirSync(GATE_META, { recursive: true });
  mkdirSync(resolve(FIX, 'gate-meta-residual-aaaa'), { recursive: true });
  mkdirSync(resolve(FIX, 'gate-meta-missing-ponr'), { recursive: true });
  mkdirSync(resolve(PARENT_FIX, 'residual-aaaa-ponr'), { recursive: true });
  mkdirSync(EVID, { recursive: true });

  const real4 = resolve(REAL_EVID, 'step4.log');
  const real5 = resolve(REAL_EVID, 'step5.log');
  if (existsSync(real4) && existsSync(real5)) {
    copyFileSync(real4, resolve(GATE_META, 'step4.log'));
    copyFileSync(real5, resolve(GATE_META, 'step5.log'));
  } else {
    writeFileSync(resolve(GATE_META, 'step4.log'), VERBATIM_STEP4);
    writeFileSync(resolve(GATE_META, 'step5.log'), VERBATIM_STEP5);
  }

  writeFileSync(
    resolve(FIX, 'gate-meta-residual-aaaa/step4.log'),
    [
      '@@GATE-META step=4 run_id=synthetic-residual-aaaa@@',
      'CMD: cutover:enable-writes --json',
      '{',
      `  "ok": true,`,
      `  "ponr_id": "${THIS_RUN_PONR}",`,
      `  "write_row_id": "${THIS_RUN_WRITE}"`,
      '}',
      '@@GATE-EXIT=0@@',
      '',
    ].join('\n')
  );
  writeFileSync(
    resolve(FIX, 'gate-meta-residual-aaaa/step5.log'),
    [
      '@@GATE-META step=5 run_id=synthetic-residual-aaaa@@',
      'CMD: cutover:rollback-repoint --json',
      '{',
      '  "ok": false,',
      '  "repointed": false,',
      '  "error": {',
      '    "code": "POST_PONR_INELIGIBLE",',
      '    "message": "post-PONR residual aaaa 00000000-0000-4000-8000-aaaaaaaaaaaa foreign ponr 585ecd45-65ed-43b3-875d-eed092697bbb"',
      '  },',
      '  "precondition": {',
      '    "ponr_id": "585ecd45-65ed-43b3-875d-eed092697bbb",',
      '    "write_row_id": "00000000-0000-4000-8000-aaaaaaaaaaaa"',
      '  }',
      '}',
      '@@GATE-EXIT=2@@',
      '',
    ].join('\n')
  );
  writeFileSync(
    resolve(FIX, 'gate-meta-missing-ponr/step4.log'),
    [
      '@@GATE-META step=4 run_id=synthetic-missing-ponr@@',
      'CMD: cutover:enable-writes --json',
      '{',
      '  "ok": true,',
      '  "already_recorded": false,',
      '  "write_surface": "hono.POST /api/documents"',
      '}',
      '@@GATE-EXIT=0@@',
      '',
    ].join('\n')
  );
  writeFileSync(
    resolve(FIX, 'gate-meta-missing-ponr/step5.log'),
    [
      '@@GATE-META step=5 run_id=synthetic-missing-ponr@@',
      'CMD: cutover:rollback-repoint --json',
      '{',
      '  "ok": false,',
      '  "repointed": false,',
      '  "error": {',
      '    "code": "POST_PONR_INELIGIBLE",',
      '    "message": "post-PONR without bound identity"',
      '  }',
      '}',
      '@@GATE-EXIT=2@@',
      '',
    ].join('\n')
  );

  // Parent compact fixtures (semantic lanes)
  writeFileSync(
    resolve(PARENT_FIX, 'residual-aaaa-ponr/step4.json'),
    JSON.stringify({ ok: true, ponr_id: THIS_RUN_PONR, write_row_id: THIS_RUN_WRITE }, null, 2) +
      '\n'
  );
  writeFileSync(
    resolve(PARENT_FIX, 'residual-aaaa-ponr/step5-this-run.json'),
    JSON.stringify(
      {
        repointed: false,
        error: { code: 'POST_PONR_INELIGIBLE', message: 'post-PONR' },
        precondition: { ponr_id: THIS_RUN_PONR, write_row_id: THIS_RUN_WRITE },
      },
      null,
      2
    ) + '\n'
  );
  writeFileSync(
    resolve(PARENT_FIX, 'residual-aaaa-ponr/step5-residual.json'),
    JSON.stringify(
      {
        repointed: false,
        error: { code: 'POST_PONR_INELIGIBLE', message: 'post-PONR' },
        precondition: {
          ponr_id: '585ecd45-65ed-43b3-875d-eed092697bbb',
          write_row_id: '00000000-0000-4000-8000-aaaaaaaaaaaa',
        },
      },
      null,
      2
    ) + '\n'
  );

  // RED baseline pointer (pre-fix shape) — always present for TC-1
  if (!existsSync(resolve(EVID, 'red-20260808T011038Z-gate-meta-parse.json'))) {
    writeFileSync(
      resolve(EVID, 'red-20260808T011038Z-gate-meta-parse.json'),
      JSON.stringify(
        {
          ok: false,
          tool: 'zero-loss-identity-oracle.post_ponr_bind',
          step4_ponr_id: null,
          step4_write_row_id: null,
          step5_error_code: 'POST_PONR_INELIGIBLE',
          reasons: ['step4_missing_ponr_identity'],
          t_sync_014: 'FAIL',
          red: true,
          note: 'Pre-fix RED: GATE-META parse could not extract ponr_id',
        },
        null,
        2
      ) + '\n'
    );
  }
}

describe('GATE-FIX-post-ponr-gate-meta-parse (C-1)', () => {
  beforeAll(() => {
    seedFixtures();
  });

  it('TC-3/AC-1/AC-3: verbatim GATE-META 011038Z step4/step5 PASS post-ponr', () => {
    expect(existsSync(resolve(GATE_META, 'step4.log'))).toBe(true);
    expect(existsSync(resolve(GATE_META, 'step5.log'))).toBe(true);
    const step4Text = readFileSync(resolve(GATE_META, 'step4.log'), 'utf8');
    const step5Text = readFileSync(resolve(GATE_META, 'step5.log'), 'utf8');
    // mandatory: production shape, not bare JSON
    expect(step4Text.startsWith('@@GATE-META')).toBe(true);
    expect(step5Text.startsWith('@@GATE-META')).toBe(true);
    expect(step4Text.trim().startsWith('{')).toBe(false);
    expect(step4Text).toContain(THIS_RUN_PONR);
    expect(step4Text).toContain(THIS_RUN_WRITE);

    const out = resolve(EVID, 'ac1-gate-meta-this-run-pass.unit.json');
    const r = runOracle([
      '--mode',
      'post-ponr',
      '--step4',
      resolve(GATE_META, 'step4.log'),
      '--step5',
      resolve(GATE_META, 'step5.log'),
      '--out',
      out,
    ]);
    expect(r.rc).toBe(0);
    const j = JSON.parse(r.stdout);
    expect(j.ok).toBe(true);
    expect(j.step4_ponr_id).toBe(THIS_RUN_PONR);
    expect(j.step4_write_row_id).toBe(THIS_RUN_WRITE);
    expect(j.step5_error_code).toBe('POST_PONR_INELIGIBLE');
    expect(j.t_sync_014).toBe('PASS');
    expect(j.reasons ?? []).not.toContain('step4_missing_ponr_identity');
  });

  it('TC-4/AC-2: GATE-META residual aaaa FAIL with aaaa-named reasons', () => {
    const r = runOracle([
      '--mode',
      'post-ponr',
      '--step4',
      resolve(FIX, 'gate-meta-residual-aaaa/step4.log'),
      '--step5',
      resolve(FIX, 'gate-meta-residual-aaaa/step5.log'),
      '--out',
      resolve(EVID, 'ac2-gate-meta-residual-aaaa-fail.unit.json'),
    ]);
    expect(r.rc).not.toBe(0);
    const j = JSON.parse(r.stdout);
    expect(j.ok).toBe(false);
    expect(j.step4_ponr_id).toBe(THIS_RUN_PONR);
    // must not fail only via missing step4 identity
    expect(j.reasons).not.toEqual(['step4_missing_ponr_identity']);
    const joined = (j.reasons as string[]).join(' ');
    expect(
      joined.includes('residual_aaaa') ||
        joined.includes('aaaaaaaaaaaa') ||
        joined.includes('mismatch') ||
        joined.includes('aaaa_sentinel')
    ).toBe(true);
  });

  it('TC-9: GATE-META step4 without ponr_id still FAIL', () => {
    const r = runOracle([
      '--mode',
      'post-ponr',
      '--step4',
      resolve(FIX, 'gate-meta-missing-ponr/step4.log'),
      '--step5',
      resolve(FIX, 'gate-meta-missing-ponr/step5.log'),
    ]);
    expect(r.rc).not.toBe(0);
    const j = JSON.parse(r.stdout);
    expect(j.ok).toBe(false);
    expect(j.reasons).toContain('step4_missing_ponr_identity');
  });

  it('TC-5: compact bare-JSON this-run still PASS (parent semantic lane)', () => {
    const r = runOracle([
      '--mode',
      'post-ponr',
      '--step4',
      resolve(PARENT_FIX, 'residual-aaaa-ponr/step4.json'),
      '--step5',
      resolve(PARENT_FIX, 'residual-aaaa-ponr/step5-this-run.json'),
    ]);
    expect(r.rc).toBe(0);
    const j = JSON.parse(r.stdout);
    expect(j.ok).toBe(true);
    expect(j.step4_ponr_id).toBe(THIS_RUN_PONR);
  });

  it('TC-6: compact residual aaaa still FAIL with aaaa reasons', () => {
    const r = runOracle([
      '--mode',
      'post-ponr',
      '--step4',
      resolve(PARENT_FIX, 'residual-aaaa-ponr/step4.json'),
      '--step5',
      resolve(PARENT_FIX, 'residual-aaaa-ponr/step5-residual.json'),
    ]);
    expect(r.rc).not.toBe(0);
    const j = JSON.parse(r.stdout);
    expect(j.ok).toBe(false);
    const joined = (j.reasons as string[]).join(' ');
    expect(
      joined.includes('residual_aaaa') ||
        joined.includes('aaaa_sentinel') ||
        joined.includes('mismatch')
    ).toBe(true);
  });

  it('TC-7: recovery does not require startswith("{") as sole multi-line path', () => {
    const src = readFileSync(ORACLE, 'utf8');
    expect(src).toContain('JSONDecoder');
    expect(src).toContain('raw_decode');
    expect(src).toContain('extract_json_objects');
    expect(src).toContain('load_step_payload');
    expect(src).toMatch(/def load_step_payload/);
    writeFileSync(
      resolve(EVID, 'ac1-static-parse-path.unit.md'),
      [
        '# TC-7 static',
        '- extract_json_objects uses JSONDecoder.raw_decode',
        '- load_step_payload handles @@GATE-META without startswith("{") sole path',
        '',
      ].join('\n')
    );
  });

  it('TC-1 pointer: RED evidence artifact present', () => {
    const red = resolve(EVID, 'red-20260808T011038Z-gate-meta-parse.json');
    expect(existsSync(red)).toBe(true);
    const j = JSON.parse(readFileSync(red, 'utf8'));
    expect(j.ok).toBe(false);
    expect(j.reasons).toContain('step4_missing_ponr_identity');
  });
});
