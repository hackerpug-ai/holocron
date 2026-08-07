/**
 * REDHAT-FIX-RH-S30-03 unit: loadPostExportWriteAudit is fail-closed
 * (never synthesizes empty success from a missing file).
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  countAcceptedPostExportWrites,
  loadPostExportWriteAudit,
  writePostExportWriteAudit,
} from '../../../services/platform/src/cutover/post-export-write-audit.ts';

const TMP = resolve(process.cwd(), '.tmp/REDHAT-FIX-RH-S30-03/unit');

describe('RH-S30-03 loadPostExportWriteAudit fail-closed', () => {
  afterEach(() => {
    try {
      rmSync(TMP, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it('missing file does not synthesize empty audit (failClosed default)', () => {
    mkdirSync(TMP, { recursive: true });
    const missing = resolve(TMP, 'no-such-audit.json');
    const loaded = loadPostExportWriteAudit({
      cwd: process.cwd(),
      auditPath: missing,
      watermarkPath: resolve(TMP, 'also-missing-wm.json'),
    });
    expect(loaded.audit).toBeNull();
    expect(loaded.path).toBeNull();
  });

  it('unreadable/corrupt file returns null audit (fail closed)', () => {
    mkdirSync(TMP, { recursive: true });
    const path = resolve(TMP, 'corrupt.json');
    writeFileSync(path, '{not-json', 'utf8');
    const loaded = loadPostExportWriteAudit({
      cwd: process.cwd(),
      auditPath: path,
    });
    expect(loaded.audit).toBeNull();
    expect(loaded.path).toBe(path);
  });

  it('valid file loads accepted writes', () => {
    mkdirSync(TMP, { recursive: true });
    const path = resolve(TMP, 'audit.json');
    writePostExportWriteAudit(
      {
        export_watermark_ms: 1000,
        accepted_writes: [{ committed_at_ms: 2000, surface: 'hono.POST /api/documents', id: 'x' }],
      },
      path
    );
    const loaded = loadPostExportWriteAudit({ cwd: process.cwd(), auditPath: path });
    expect(loaded.audit).not.toBeNull();
    expect(countAcceptedPostExportWrites(loaded.audit!)).toBe(1);
  });
});
