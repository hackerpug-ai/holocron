/**
 * Schema constant invariants (complements live integration suite).
 * Pure shape checks — live Postgres gates live under tests/integration/.
 */

import { describe, expect, it } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { RESEARCH_SESSION_STATUS_FORBIDDEN } from '../../research/session-writer';
import {
  ANALYSIS_TRIO,
  DOMAIN_TABLE_NAMES,
  FORBIDDEN_SHELL_TABLES,
  RESEARCH_TRIO,
} from '../schema';
import {
  ZERO_PUB_EXCLUDED_COLUMN,
  ZERO_PUB_EXCLUDED_TABLES,
  ZERO_PUB_NAME,
  ZERO_PUB_TABLE_NAMES,
} from '../schema/zero-pub';

const PLATFORM_SRC = resolve(import.meta.dirname, '../..');

function rg(pattern: string, cwd: string, extraArgs: string[] = []): string {
  try {
    return execFileSync('rg', ['-n', pattern, ...extraArgs, cwd], {
      encoding: 'utf8',
    });
  } catch (err) {
    const e = err as { stdout?: string; status?: number };
    if (e.status === 1) return e.stdout ?? '';
    throw err;
  }
}

describe('schema constant invariants (schema-5)', () => {
  it('domain table catalog has ≥55 tables including merge trios', () => {
    expect(DOMAIN_TABLE_NAMES.length).toBeGreaterThanOrEqual(55);
    for (const t of ANALYSIS_TRIO) expect(DOMAIN_TABLE_NAMES).toContain(t);
    for (const t of RESEARCH_TRIO) expect(DOMAIN_TABLE_NAMES).toContain(t);
  });

  it('merge trios are exactly 3+3 and shells are forbidden', () => {
    expect(ANALYSIS_TRIO).toHaveLength(3);
    expect(RESEARCH_TRIO).toHaveLength(3);
    expect(FORBIDDEN_SHELL_TABLES).toContain('revenue_validation_sessions');
    expect(FORBIDDEN_SHELL_TABLES).toContain('deep_research_sessions');
    for (const shell of FORBIDDEN_SHELL_TABLES) {
      expect(DOMAIN_TABLE_NAMES.includes(shell as (typeof DOMAIN_TABLE_NAMES)[number])).toBe(false);
    }
  });

  it('zero_pub excludes evidence + embedding column name', () => {
    expect(ZERO_PUB_NAME).toBe('zero_pub');
    expect(ZERO_PUB_EXCLUDED_COLUMN).toBe('embedding');
    expect(ZERO_PUB_TABLE_NAMES).toContain('file_objects');
    expect(ZERO_PUB_EXCLUDED_TABLES).toContain('passages');
    expect(ZERO_PUB_EXCLUDED_TABLES).toContain('sources');
    for (const excluded of ZERO_PUB_EXCLUDED_TABLES) {
      expect((ZERO_PUB_TABLE_NAMES as readonly string[]).includes(excluded)).toBe(false);
    }
  });

  it('research_web_calls is domain-catalogued but outside RESEARCH_TRIO and zero_pub', () => {
    expect(DOMAIN_TABLE_NAMES).toContain('research_web_calls');
    expect(RESEARCH_TRIO).toHaveLength(3);
    expect((RESEARCH_TRIO as readonly string[]).includes('research_web_calls')).toBe(false);
    expect((ZERO_PUB_TABLE_NAMES as readonly string[]).includes('research_web_calls')).toBe(false);
    expect(ZERO_PUB_EXCLUDED_TABLES).toContain('research_web_calls');
  });

  it('research session status updates only live in session-writer; no forbidden spellings', () => {
    const statusHits = rg(
      'UPDATE research_sessions[\\s\\S]{0,200}?SET[\\s\\S]{0,200}?status\\s*=',
      PLATFORM_SRC,
      [
        '--multiline',
        '--glob',
        '!**/migrations/**',
        '--glob',
        '!**/seed*',
        '--glob',
        '!**/*test*',
        '--glob',
        '!**/*.test.ts',
        '--glob',
        '!**/__spike__/**',
      ]
    );
    const lines = statusHits
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .filter((l) => !/mission-research\.ts/.test(l));
    const offenders = lines.filter((l) => !/session-writer\.ts/.test(l));
    expect(offenders).toEqual([]);

    for (const forbidden of RESEARCH_SESSION_STATUS_FORBIDDEN) {
      const hits = rg(`status\\s*[:=]\\s*['"]${forbidden}['"]`, resolve(PLATFORM_SRC, 'research'), [
        '--glob',
        '*-writer.ts',
        '--glob',
        'web-call-ledger.ts',
        '--glob',
        'session-writer.ts',
      ]);
      const emitHits = hits
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .filter(
          (l) => !/FORBIDDEN|forbidden|never emit|Never emit|spellings|FORBIDDEN_STATUS/i.test(l)
        );
      expect(emitHits).toEqual([]);
    }
  });
});
