/**
 * UNIT_TEST_JUSTIFIED: source audit that the seed-complete worker is gone.
 * Zero I/O — reads shipped kickoff.ts so holocron.local cannot return silently.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const DIR = dirname(fileURLToPath(import.meta.url));

describe('kickoff seed-worker source audit', () => {
  it('does not ship a holocron.local seed-complete worker', () => {
    const src = readFileSync(join(DIR, 'kickoff.ts'), 'utf8');
    expect(src).not.toMatch(/holocron\.local/);
    expect(src).not.toMatch(/runBackgroundResearch/);
    expect(src).not.toMatch(/kickoff-seed/);
    expect(src).toMatch(/getResearchMastra/);
    expect(src).toMatch(/startAsync/);
  });
});
