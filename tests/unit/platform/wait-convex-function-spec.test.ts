import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(import.meta.dirname, '../../..');
const WAIT_SCRIPT = resolve(REPO_ROOT, 'scripts/wait-convex-function-spec.sh');
const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('wait-convex-function-spec', () => {
  it('retries a transient partial catalog and returns only after every identifier appears', () => {
    const root = mkdtempSync(resolve(tmpdir(), 'holo-convex-spec-'));
    tempRoots.push(root);
    const counter = resolve(root, 'attempts');
    const fakePnpm = resolve(root, 'pnpm');
    writeFileSync(
      fakePnpm,
      `#!/usr/bin/env bash
set -euo pipefail
count=0
[[ -f "$FAKE_CONVEX_SPEC_COUNTER" ]] && count="$(<"$FAKE_CONVEX_SPEC_COUNTER")"
count=$((count + 1))
printf '%s' "$count" >"$FAKE_CONVEX_SPEC_COUNTER"
if [[ "$count" -eq 1 ]]; then
  printf '%s' '{"functions":[{"identifier": "module.js:first"}]}'
else
  printf '%s' '{"functions":[{"identifier": "module.js:first"},{"identifier": "module.js:last"}]}'
fi
`,
      'utf8'
    );
    chmodSync(fakePnpm, 0o755);

    const result = spawnSync('bash', [WAIT_SCRIPT, 'module.js:first', 'module.js:last'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${root}${delimiter}${process.env.PATH ?? ''}`,
        FAKE_CONVEX_SPEC_COUNTER: counter,
        CONVEX_FUNCTION_SPEC_TIMEOUT_SECONDS: '5',
        CONVEX_FUNCTION_SPEC_POLL_SECONDS: '1',
      },
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('"identifier": "module.js:first"');
    expect(result.stdout).toContain('"identifier": "module.js:last"');
    expect(readFileSync(counter, 'utf8')).toBe('2');
  });
});
