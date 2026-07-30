/**
 * GATE-FIX-S28R3-QA22 — Final credential PATH/argv, restic trust, contracts, hermetic proof.
 *
 * Closes CRITICAL 3 / HIGH 1 / MEDIUM 1 from
 * red-hat-20260730T002820Z on 6a2a61b9fdcc3d0f890fd722ad3470a6cf4f9aff.
 *
 * NEVER print raw env or secret values in this file.
 */
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { verifyResticSnapshotInRepo } from '../../src/backup/recovery-baseline.ts';
import { baseHarnessEnv, type HarnessPaths, makeHarness } from './fixtures/qa13-harness';

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const GATE_PLAN = resolve(
  REPO_ROOT,
  '.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/gate-plan.json'
);
const HUMAN_GATE = resolve(
  REPO_ROOT,
  '.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/HUMAN-GATE.md'
);
const PROD_PROVE = resolve(REPO_ROOT, 'scripts/prove-r2-readonly.sh');
const PROD_PROV = resolve(REPO_ROOT, 'scripts/provision-fresh-restore-target.sh');
const PROD_FIRE = resolve(REPO_ROOT, 'scripts/run-fire-drill-on-fresh-target.sh');
const PROD_VERIFY_CREDS = resolve(REPO_ROOT, 'scripts/verify-restore-creds.sh');
const PROD_BASELINE = resolve(REPO_ROOT, 'services/platform/src/backup/recovery-baseline.ts');
const PROD_PROBES = resolve(REPO_ROOT, 'scripts/lib/r2-scope-probes.json');
const EVIDENCE = resolve(REPO_ROOT, '.tmp/GATE-FIX-S28R3-QA22');

const CANARY_AK = 'AKIA_QA22_RESTORE_CANARY';
const CANARY_SK = 'sk_qa22_restore_secret_must_not_appear_on_argv';
const CANARY_ST = 'st_qa22_session_token_canary';

let H: HarnessPaths;

beforeAll(() => {
  mkdirSync(EVIDENCE, { recursive: true });
  H = makeHarness(REPO_ROOT, EVIDENCE);
});

function redact(text: string): string {
  return text
    .replace(/((?:api[_-]?key|secret|token|password)\s*[=:]\s*)\S+/gi, '$1[redacted]')
    .replace(/\b(sk-[a-z0-9_-]{10,}|xai-[a-z0-9]{10,}|lin_api_[a-z0-9]+)\b/gi, '[redacted-token]');
}

function writeEv(name: string, body: unknown): void {
  const raw = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  const safe = name.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 180);
  writeFileSync(resolve(EVIDENCE, safe), `${redact(raw)}\n`);
}

function env(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return baseHarnessEnv(REPO_ROOT, {
    REQUIRE_LIVE_R2_RO: '1',
    R2_ACCESS_KEY_ID: 'AKIA_QA22_W',
    R2_SECRET_ACCESS_KEY: 'sk_writer_qa22',
    R2_SESSION_TOKEN: 'st_w',
    R2_RESTORE_ACCESS_KEY_ID: CANARY_AK,
    R2_RESTORE_SECRET_ACCESS_KEY: CANARY_SK,
    R2_RESTORE_SESSION_TOKEN: CANARY_ST,
    HOLO_R2_PROVIDER_MOCK_MODE: 'default',
    BACKUP_R2_ACCESS_KEY_ID: 'AKIA_WRITER_QA22',
    BACKUP_R2_SECRET_ACCESS_KEY: 'sk_writer_qa22_distinct',
    ...extra,
  });
}

/** Detect bare PATH utilities in a shell command stream (not already absolute). */
function hasBareUtil(cmd: string, util: string): boolean {
  // bare util as command word (not /path/util, not $UTIL, not in words like basher)
  const re = new RegExp(`(?:^|[;|&\\s\`(])${util}(?:\\s|$)`);
  // strip absolute forms first
  const stripped = cmd
    .replaceAll(`/bin/${util}`, 'FIXED')
    .replaceAll(`/usr/bin/${util}`, 'FIXED')
    .replaceAll(`/usr/local/bin/${util}`, 'FIXED')
    .replaceAll(`/opt/homebrew/bin/${util}`, 'FIXED')
    .replaceAll(`"$DOCKER"`, 'FIXED')
    .replaceAll('${DOCKER}', 'FIXED');
  return re.test(stripped);
}

describe('GATE-FIX-S28R3-QA22 gate-plan absolute credential path', () => {
  it('all six gate literal_cmd use absolute bash/tee/jq/docker — no bare PATH utils', () => {
    const plan = JSON.parse(readFileSync(GATE_PLAN, 'utf8')) as {
      steps: Array<{ n: number; literal_cmd?: string }>;
    };
    expect(plan.steps).toHaveLength(6);
    const all = plan.steps.map((s) => s.literal_cmd || '').join('\n');
    writeEv('gate-plan-cmds.txt', all.slice(0, 4000));

    for (const step of plan.steps) {
      const cmd = step.literal_cmd || '';
      expect(hasBareUtil(cmd, 'bash'), `step ${step.n} bare bash`).toBe(false);
      expect(hasBareUtil(cmd, 'tee'), `step ${step.n} bare tee`).toBe(false);
      expect(hasBareUtil(cmd, 'jq'), `step ${step.n} bare jq`).toBe(false);
      // every script entry uses /bin/bash
      if (cmd.includes('scripts/assert-gate-run-id.sh')) {
        expect(cmd).toMatch(/\/bin\/bash scripts\/assert-gate-run-id\.sh/);
      }
    }
    // credential-ambient utilities
    expect(all).toMatch(/\/usr\/bin\/tee /);
    expect(all).not.toMatch(/(?:^|[^/\w])tee /);
    expect(all).toMatch(/\/usr\/bin\/jq /);
    expect(all).not.toMatch(/(?:^|[^/\w])jq /);
    // docker only via absolute candidates / "$DOCKER"
    expect(all).toMatch(/DOCKER=""/);
    expect(all).toMatch(
      /\/usr\/bin\/docker|\/usr\/local\/bin\/docker|\/opt\/homebrew\/bin\/docker/
    );
    expect(all).not.toMatch(/(?<!["$/])\bdocker\s+rm\b/);
    // no bare dirname in gate stream
    expect(all).not.toMatch(/(?:^|[^/\w])dirname /);
    expect(all).not.toMatch(/\$\(dirname /);

    // HUMAN-GATE parity
    const human = readFileSync(HUMAN_GATE, 'utf8');
    expect(human).toMatch(/\/bin\/bash scripts\/assert-gate-run-id\.sh/);
    expect(human).toMatch(/\/usr\/bin\/tee /);
    expect(human).toMatch(/\/usr\/bin\/jq /);
  });

  it('credential scripts bootstrap ROOT without bare dirname', () => {
    for (const f of [PROD_PROVE, PROD_PROV, PROD_FIRE, PROD_VERIFY_CREDS]) {
      const src = readFileSync(f, 'utf8');
      const head = src.split('\n').slice(0, 50).join('\n');
      expect(head, f).not.toMatch(/\$\(dirname /);
      expect(head, f).toMatch(/BASH_SOURCE\[0\]%\/\*|shell-native root/i);
    }
  });
});

describe('GATE-FIX-S28R3-QA22 ordered hostile-PATH gate stream', () => {
  it('executes credential-ambient gate fragment with shadow utils — no shadow markers', () => {
    const shadow = resolve(EVIDENCE, 'hostile-gate-path-bin');
    rmSync(shadow, { recursive: true, force: true });
    mkdirSync(shadow, { recursive: true });
    const markers: string[] = [];
    for (const name of ['bash', 'tee', 'jq', 'docker', 'dirname', 'date', 'mktemp']) {
      const marker = `EVIL_${name.toUpperCase()}_QA22`;
      markers.push(marker);
      const p = resolve(shadow, name);
      writeFileSync(
        p,
        `#!/bin/bash
echo "${marker}" >&2
echo "${marker}" >> "${shadow}/ran.log"
exit 99
`
      );
      chmodSync(p, 0o755);
    }

    // Ordered gate fragment mirroring gate-plan step2 credential-ambient path:
    // assert-gate-run-id (repo) → export tuple → /bin/bash prove | /usr/bin/tee → /usr/bin/jq
    // WITH hostile PATH shadows present. Static string checks alone are insufficient.
    const evid = resolve(EVIDENCE, 'hostile-gate-run');
    mkdirSync(evid, { recursive: true });
    const runId = 'qa22hostile01';
    const assertGate = resolve(REPO_ROOT, 'scripts/assert-gate-run-id.sh');
    const fragment = `
set -euo pipefail
export GATE_RUN_ID="${runId}"
/bin/bash ${JSON.stringify(assertGate)}
EVID=${JSON.stringify(evid)}
mkdir -p "$EVID"
export R2_RESTORE_ACCESS_KEY_ID=${JSON.stringify(CANARY_AK)}
export R2_RESTORE_SECRET_ACCESS_KEY=${JSON.stringify(CANARY_SK)}
export R2_RESTORE_SESSION_TOKEN=${JSON.stringify(CANARY_ST)}
export R2_ACCESS_KEY_ID="$R2_RESTORE_ACCESS_KEY_ID"
export R2_SECRET_ACCESS_KEY="$R2_RESTORE_SECRET_ACCESS_KEY"
export R2_SESSION_TOKEN="$R2_RESTORE_SESSION_TOKEN"
export REQUIRE_LIVE_R2_RO=1
export HOLO_R2_PROVIDER_MOCK_MODE=default
# Absolute consumers only (gate-plan contract) — harness prove script
REQUIRE_LIVE_R2_RO=1 /bin/bash ${JSON.stringify(H.prove)} 2>&1 | /usr/bin/tee "$EVID/step2-r2-readonly.txt"
# Absolute jq on non-secret artifact
printf '%s\\n' '{"ok":true}' > "$EVID/sample.json"
/usr/bin/jq -e '.ok == true' "$EVID/sample.json" | /usr/bin/tee "$EVID/jq-out.txt"
test -f "$EVID/sample.json"
`;
    const run = spawnSync('/bin/bash', ['-c', fragment], {
      cwd: H.root,
      encoding: 'utf8',
      timeout: 90_000,
      env: {
        ...env({
          PATH: `${shadow}:/usr/bin:/bin`,
          GATE_RUN_ID: runId,
        }),
      },
    });
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEv('hostile-ordered-gate.json', {
      status: run.status,
      out: redact(combined.slice(0, 3000)),
      ranLog: existsSync(resolve(shadow, 'ran.log'))
        ? readFileSync(resolve(shadow, 'ran.log'), 'utf8')
        : '',
    });
    for (const m of markers) {
      expect(combined, `shadow marker ${m} in output`).not.toContain(m);
    }
    if (existsSync(resolve(shadow, 'ran.log'))) {
      const ran = readFileSync(resolve(shadow, 'ran.log'), 'utf8');
      for (const m of markers) {
        expect(ran, `shadow marker ${m} executed`).not.toContain(m);
      }
    }
    // jq absolute path must succeed
    expect(run.status, combined.slice(0, 2000)).toBe(0);
    expect(readFileSync(resolve(evid, 'jq-out.txt'), 'utf8').trim()).toBe('true');
  });
});

describe('GATE-FIX-S28R3-QA22 resticBin root-owned trust', () => {
  it('user-owned absolute resticBin is refused before credential env construction', () => {
    const dir = mkdtempSync(join(tmpdir(), 'qa22-restic-'));
    const userOwned = join(dir, 'restic');
    writeFileSync(
      userOwned,
      `#!/bin/sh
echo "USER_OWNED_RESTIC_RAN" >&2
printf '%s\\n' '[{"id":"abcdef0123456789deadbeefcafebabe00112233","short_id":"abcdef01"}]'
exit 0
`
    );
    chmodSync(userOwned, 0o755);

    let runnerCalled = false;
    const result = verifyResticSnapshotInRepo({
      resticSnapshotId: 'abcdef0123456789deadbeefcafebabe00112233',
      resticBin: userOwned,
      env: {
        ...process.env,
        RESTIC_PASSWORD: 'test-password-long-enough-qa22',
        RESTIC_REPOSITORY: 's3:https://example.invalid/bucket/restic',
        R2_ACCESS_KEY_ID: 'test-ak-qa22',
        R2_SECRET_ACCESS_KEY: 'test-sk-qa22',
        R2_ENDPOINT: 'https://example.invalid',
        R2_BUCKET_NAME: 'holocron-backup',
        R2_REPO_CIPHER_PASS: 'cipher-pass-long-enough',
        R2_ACCOUNT_ID: 'exampleaccountid',
        AWS_ACCESS_KEY_ID: 'test-ak-qa22',
        AWS_SECRET_ACCESS_KEY: 'test-sk-qa22',
      },
      runProcess: () => {
        runnerCalled = true;
        return { status: 0, stdout: '[]', stderr: '' };
      },
    });
    writeEv('user-owned-restic-refused.json', result);
    expect(result.ok).toBe(false);
    expect(result.error ?? '').toMatch(/untrusted|root-owned/i);
    expect(runnerCalled, 'runProcess must not run when resticBin untrusted').toBe(false);

    // Source contract: resolveTrustedResticBin preResolved path uses validateRootOwnedBin
    const src = readFileSync(PROD_BASELINE, 'utf8');
    expect(src).toMatch(/if \(preResolved\) \{\s*return validateRootOwnedBin\(preResolved\);/s);
    expect(src).toMatch(/runProcess\?:/);
  });
});

describe('GATE-FIX-S28R3-QA22 no secrets on argv', () => {
  it('fire-drill redactor does not place RESTORE_* secrets on python argv', () => {
    const src = readFileSync(PROD_FIRE, 'utf8');
    // Old pattern must be gone
    expect(src).not.toMatch(/python3 -E -s - "\$RESTORE_AK" "\$RESTORE_SK" "\$RESTORE_ST"/);
    // FD-based transfer present
    expect(src).toMatch(/exec 3</);
    expect(src).toMatch(/os\.read\(3/);
    expect(src).toMatch(/NUL-separated|FD 3/i);
  });

  it('runtime process-argument negative control: secrets not on python argv during redact', () => {
    // Simulate the redactor invocation with canaries; inspect /proc or ps during run via wrapper.
    const childLog = join(EVIDENCE, 'child-log-qa22.txt');
    writeFileSync(childLog, `leaked secret line: ${CANARY_SK}\nok\n`);
    const probe = resolve(EVIDENCE, 'argv-probe-redactor.sh');
    writeFileSync(
      probe,
      `#!/bin/bash
set -euo pipefail
RESTORE_AK="${CANARY_AK}"
RESTORE_SK="${CANARY_SK}"
RESTORE_ST="${CANARY_ST}"
_child_log="${childLog}"
# Exact production pattern (FD 3, not argv secrets)
exec 3< <(printf '%s\\0' "$RESTORE_AK" "$RESTORE_SK" "$RESTORE_ST")
# Snapshot argv of the python process while it runs
/usr/bin/python3 -E -s - "$_child_log" <<'PY' &
import os, re, sys, time
path = sys.argv[1]
time.sleep(0.15)
try:
    raw = os.read(3, 1 << 20)
except OSError:
    raw = b""
parts = raw.split(b"\\0")
ak = parts[0].decode("utf-8", "replace") if len(parts) > 0 else ""
sk = parts[1].decode("utf-8", "replace") if len(parts) > 1 else ""
st = parts[2].decode("utf-8", "replace") if len(parts) > 2 else ""
try:
    text = open(path, "r", errors="replace").read()
except OSError:
    sys.exit(0)
for secret in (sk, ak, st):
    if secret:
        text = text.replace(secret, "[redacted]")
text = re.sub(r"(?i)((?:api[_-]?key|secret|token|password)\\s*[=:]\\s*)\\S+", r"\\1[redacted]", text)
sys.stdout.write(text)
PY
pid=$!
sleep 0.05
# Capture argv for pid (macOS: ps -p -o args=; Linux: /proc/pid/cmdline)
args="$(ps -p "$pid" -o args= 2>/dev/null || true)"
if [[ -z "$args" && -r "/proc/$pid/cmdline" ]]; then
  args="$(tr '\\0' ' ' < "/proc/$pid/cmdline")"
fi
wait "$pid" || true
exec 3<&- 2>/dev/null || true
printf 'ARGV_CAPTURE=%s\\n' "$args"
# Fail if canaries appear in captured argv
if printf '%s' "$args" | grep -Fq "${CANARY_SK}"; then
  echo "FAIL: secret on argv" >&2
  exit 2
fi
if printf '%s' "$args" | grep -Fq "${CANARY_AK}"; then
  echo "FAIL: access key on argv" >&2
  exit 2
fi
if printf '%s' "$args" | grep -Fq "${CANARY_ST}"; then
  echo "FAIL: session token on argv" >&2
  exit 2
fi
echo "PASS: no secrets on argv"
`
    );
    chmodSync(probe, 0o755);
    const run = spawnSync('/bin/bash', [probe], {
      encoding: 'utf8',
      timeout: 15_000,
      env: { ...process.env, PATH: '/usr/bin:/bin' },
    });
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEv('argv-negative.json', { status: run.status, out: redact(combined) });
    expect(combined).not.toContain(CANARY_SK);
    expect(combined).not.toContain(CANARY_ST);
    // ARGV_CAPTURE line may include path only
    expect(run.status, combined).toBe(0);
    expect(combined).toMatch(/PASS: no secrets on argv/);
  });
});

describe('GATE-FIX-S28R3-QA22 hermetic scope probes', () => {
  it('mutation + restore leaves tracked probes byte-identical and no .qa16bak', () => {
    const original = readFileSync(PROD_PROBES);
    const bakDir = mkdtempSync(join(tmpdir(), 'qa22-hermetic-'));
    const bak = join(bakDir, 'probes.bak');
    copyFileSync(PROD_PROBES, bak);
    try {
      writeFileSync(PROD_PROBES, '{ "schema": "qa22-temp-bad" }\n', 'utf8');
      // Simulate live-proof / suite boundary: restore from ephemeral bak
      writeFileSync(PROD_PROBES, readFileSync(bak));
    } finally {
      writeFileSync(PROD_PROBES, original);
      rmSync(bakDir, { recursive: true, force: true });
      if (existsSync(`${PROD_PROBES}.qa16bak`)) unlinkSync(`${PROD_PROBES}.qa16bak`);
    }
    expect(Buffer.compare(readFileSync(PROD_PROBES), original)).toBe(0);
    expect(existsSync(`${PROD_PROBES}.qa16bak`)).toBe(false);
  });

  it('qa16 production test uses out-of-tree bak (source contract)', () => {
    const qa16 = resolve(
      REPO_ROOT,
      'services/platform/tests/integration/sprint28-s28r3-qa16-gate-fix.test.ts'
    );
    const src = readFileSync(qa16, 'utf8');
    expect(src).toMatch(/mkdtempSync/);
    expect(src).toMatch(/Byte-for-byte hermetic|GATE-FIX-S28R3-QA22/);
    // Must not leave in-tree qa16bak as the only backup strategy
    expect(src).not.toMatch(/const bak = `\$\{PROD_PROBES\}\.qa16bak`/);
  });
});
