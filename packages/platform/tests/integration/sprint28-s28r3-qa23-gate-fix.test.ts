/**
 * GATE-FIX-S28R3-QA23 — Real credential transport and hermetic gate closure.
 *
 * Closes CRITICAL 4 / HIGH 1 / LOW 1 from
 * red-hat-20260730T010953Z on 928f66b02119596df60b82d6ac21820918c98b86.
 *
 * NEVER print raw env or secret values in this file.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { baseHarnessEnv } from './fixtures/qa13-harness';

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const GATE_PLAN = resolve(
  REPO_ROOT,
  '.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/gate-plan.json'
);
const PROD_PROVE = resolve(REPO_ROOT, 'scripts/prove-r2-readonly.sh');
const PROD_ISO = resolve(REPO_ROOT, 'scripts/prove-isolation.sh');
const PROD_FIRE = resolve(REPO_ROOT, 'scripts/run-fire-drill-on-fresh-target.sh');
const PROD_PROV = resolve(REPO_ROOT, 'scripts/provision-fresh-restore-target.sh');
const PROD_LIVE = resolve(REPO_ROOT, 'scripts/lib/r2-ro-live.sh');
const PROD_EXEC_FD = resolve(REPO_ROOT, 'scripts/lib/exec-env-from-fd.py');
const PROD_PROBES = resolve(REPO_ROOT, 'scripts/lib/r2-scope-probes.json');
const PROD_BASE_BACKUP = resolve(REPO_ROOT, 'packages/platform/src/backup/base-backup.ts');
const PROD_R2_PROV = resolve(REPO_ROOT, 'packages/platform/src/backup/r2-provision.ts');
const PROD_FIRE_SH = resolve(REPO_ROOT, 'scripts/fire-drill.sh');
const EVIDENCE = resolve(REPO_ROOT, '.tmp/GATE-FIX-S28R3-QA23');

const CANARY_AK = 'AKIA_QA23_RESTORE_CANARY_KEY';
const CANARY_SK = 'sk_qa23_restore_secret_must_not_appear_on_argv_9f3a';
const CANARY_ST = 'st_qa23_session_token_canary_7b2c';

const HOSTILE_UTILS = [
  'bash',
  'tee',
  'jq',
  'docker',
  'dirname',
  'date',
  'mktemp',
  'bun',
  'grep',
  'env',
  'nc',
  'python3',
  'mkdir',
  'find',
  'cat',
  'wc',
  'tr',
  'uuidgen',
] as const;

beforeAll(() => {
  mkdirSync(EVIDENCE, { recursive: true });
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

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function env(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return baseHarnessEnv(REPO_ROOT, {
    REQUIRE_LIVE_R2_RO: '1',
    R2_ACCESS_KEY_ID: 'AKIA_QA23_W',
    R2_SECRET_ACCESS_KEY: 'sk_writer_qa23',
    R2_SESSION_TOKEN: 'st_w',
    R2_RESTORE_ACCESS_KEY_ID: CANARY_AK,
    R2_RESTORE_SECRET_ACCESS_KEY: CANARY_SK,
    R2_RESTORE_SESSION_TOKEN: CANARY_ST,
    HOLO_R2_PROVIDER_MOCK_MODE: 'default',
    BACKUP_R2_ACCESS_KEY_ID: 'AKIA_WRITER_QA23',
    BACKUP_R2_SECRET_ACCESS_KEY: 'sk_writer_qa23_distinct',
    ...extra,
  });
}

function hasBareUtil(cmd: string, util: string): boolean {
  const re = new RegExp(`(?:^|[;|&\\s\`(])${util}(?:\\s|$)`);
  const stripped = cmd
    .replaceAll(`/bin/${util}`, 'FIXED')
    .replaceAll(`/usr/bin/${util}`, 'FIXED')
    .replaceAll(`/usr/local/bin/${util}`, 'FIXED')
    .replaceAll(`/opt/homebrew/bin/${util}`, 'FIXED')
    .replaceAll(`"$DOCKER"`, 'FIXED')
    .replaceAll('${DOCKER}', 'FIXED')
    .replaceAll(`"$NC_BIN"`, 'FIXED')
    .replaceAll(`"$GREP_BIN"`, 'FIXED')
    .replaceAll(`"$ENV_BIN"`, 'FIXED')
    .replaceAll(`"$PYTHON_BIN"`, 'FIXED')
    .replaceAll(`"$MKTEMP_BIN"`, 'FIXED')
    .replaceAll(`"$TR_BIN"`, 'FIXED')
    .replaceAll(`"$DOCKER_BIN"`, 'FIXED');
  return re.test(stripped);
}

function walkFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = resolve(dir, name);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) walkFiles(p, out);
    else out.push(p);
  }
  return out;
}

describe('GATE-FIX-S28R3-QA23 absolute executables on credential stream', () => {
  it('gate-plan six literal_cmd have no bare bun/grep/mkdir/find/cat/env', () => {
    const plan = JSON.parse(readFileSync(GATE_PLAN, 'utf8')) as {
      steps: Array<{ n: number; literal_cmd?: string }>;
    };
    expect(plan.steps).toHaveLength(6);
    const all = plan.steps.map((s) => s.literal_cmd || '').join('\n');
    writeEv('gate-plan-absolute.txt', all.slice(0, 5000));
    for (const util of ['bun', 'grep', 'mkdir', 'find', 'cat', 'wc', 'tr', 'bash', 'tee', 'jq']) {
      expect(hasBareUtil(all, util), `bare ${util} in gate-plan`).toBe(false);
    }
    expect(all).toMatch(/\/usr\/local\/bin\/bun |\/usr\/bin\/bun /);
    expect(all).toMatch(/\/usr\/bin\/grep /);
    expect(all).toMatch(/\/bin\/mkdir /);
  });

  it('credential child scripts bind absolute grep/nc/env/python3/docker (source contract)', () => {
    const prove = readFileSync(PROD_PROVE, 'utf8');
    expect(prove).toMatch(/\/usr\/bin\/grep/);
    expect(prove).not.toMatch(/\|\s+grep\s+-/);

    const iso = readFileSync(PROD_ISO, 'utf8');
    // GATE-FIX-S28R3-QA24: overrides validated via _prove_iso_validate_tool (not raw env defaults).
    expect(iso).toMatch(/_prove_iso_validate_tool/);
    expect(iso).toMatch(/_prove_iso_validate_tool NC_BIN/);
    expect(iso).toMatch(/_prove_iso_validate_tool GREP_BIN/);
    expect(iso).toMatch(/_prove_iso_validate_tool ENV_BIN/);
    expect(iso).toMatch(/_prove_iso_validate_tool PYTHON_BIN/);
    expect(iso).toMatch(/BASH_BIN=/);
    expect(iso).toMatch(/"\$BASH_BIN" "\$live_script"/);
    expect(iso).toMatch(/"\$NC_BIN"/);
    expect(iso).toMatch(/"\$GREP_BIN"/);
    expect(iso).toMatch(/"\$ENV_BIN"/);
    expect(iso).toMatch(/"\$PYTHON_BIN"/);
    // no bare `nc -z` or bare `python3 -` or bare bash live proof
    expect(iso).not.toMatch(/(?:^|[\s;|&])nc -z/m);
    expect(iso).not.toMatch(/(?:^|[\s;|&])python3 -/m);
    expect(iso).not.toMatch(/^\s*bash "\$live_script"/m);
    expect(iso).not.toMatch(/done < <\(env \|/);

    const fire = readFileSync(PROD_FIRE, 'utf8');
    expect(fire).toMatch(/exec-env-from-fd\.py/);
    expect(fire).not.toMatch(/\/usr\/bin\/env -i "\$\{CHILD_ENV_ARGS\[@\]\}"/);
    // GATE-FIX-S28R3-QA23 cycle2: absolute docker/grep — never PATH/command -v
    expect(fire).toMatch(/DOCKER_BIN=""/);
    expect(fire).toMatch(
      /\/usr\/bin\/docker \/usr\/local\/bin\/docker \/opt\/homebrew\/bin\/docker/
    );
    expect(fire).toMatch(/GREP_BIN="\$\{GREP_BIN:-\/usr\/bin\/grep\}"/);
    expect(fire).toMatch(/"\$DOCKER_BIN"/);
    expect(fire).toMatch(/"\$GREP_BIN"/);
    expect(fire).not.toMatch(/command -v docker/);
    expect(fire).not.toMatch(/(?:^|[\s;|&`])docker (volume|inspect|rm|compose|exec|logs|info)\b/m);
    expect(fire).not.toMatch(/\|\s*grep\s+-/);

    const live = readFileSync(PROD_LIVE, 'utf8');
    expect(live).toMatch(/exec-env-from-fd\.py/);
    expect(live).not.toMatch(/"\$env_bin" -i "\$\{pairs\[@\]\}"/);
    // Fingerprint fields must not ride provider argv
    expect(live).toMatch(/fp16 --from-fd3/);
    expect(live).not.toMatch(/"\$provider" fp16 "\$@"/);
    expect(live).not.toMatch(/\$provider" fp16 "\$@/);

    const prov = readFileSync(PROD_PROV, 'utf8');
    expect(prov).toMatch(/--env-file/);
    expect(prov).not.toMatch(/docker exec \\\s*\n\s*-e "R2_SECRET_ACCESS_KEY=/);
    expect(prov).toMatch(/DOCKER_BIN=""/);
    expect(prov).toMatch(
      /\/usr\/bin\/docker \/usr\/local\/bin\/docker \/opt\/homebrew\/bin\/docker/
    );
    expect(prov).toMatch(/"\$DOCKER_BIN"/);
    expect(prov).not.toMatch(/command -v docker/);
    expect(prov).not.toMatch(/(?:^|[\s;|&`])docker (volume|inspect|rm|compose|exec|logs|info)\b/m);

    const fireSh = readFileSync(PROD_FIRE_SH, 'utf8');
    expect(fireSh).toMatch(/\/usr\/local\/bin\/bun|root-owned bun/);
    expect(fireSh).not.toMatch(/^exec bun /m);

    const provider = readFileSync(resolve(REPO_ROOT, 'scripts/lib/r2_s3_provider.py'), 'utf8');
    expect(provider).toMatch(/--from-fd3/);
    expect(provider).toMatch(/os\.read\(3/);
  });

  it('base-backup.ts and r2-provision.ts use validateRootOwnedBin; no bare PATH pgbackrest', () => {
    const bb = readFileSync(PROD_BASE_BACKUP, 'utf8');
    expect(bb).toMatch(/validateRootOwnedBin/);
    expect(bb).toMatch(/resolveTrustedPgbackrestBin/);
    expect(bb).toMatch(/PATH: '\/usr\/bin:\/bin'/);
    expect(bb).not.toMatch(/PATH: env\.PATH \?\? '\/opt\/homebrew/);
    expect(bb).not.toMatch(/run\(\s*'pgbackrest'/);

    const r2 = readFileSync(PROD_R2_PROV, 'utf8');
    expect(r2).toMatch(/validateRootOwnedBin/);
    expect(r2).toMatch(/resolveTrustedPgbackrestBin/);
    expect(r2).toMatch(/PATH: '\/usr\/bin:\/bin'/);
    expect(r2).not.toMatch(/run\('which',\s*\['pgbackrest'\]/);
    expect(r2).not.toMatch(/\/opt\/homebrew\/bin\/pgbackrest/);
    expect(r2).not.toMatch(/run\(\s*'pgbackrest'/);
  });
});

describe('GATE-FIX-S28R3-QA23 ordered hostile-PATH on literal gate stream', () => {
  it('runs gate-plan step2 literal_cmd under ordered hostile PATH — no shadow markers', () => {
    const plan = JSON.parse(readFileSync(GATE_PLAN, 'utf8')) as {
      steps: Array<{ n: number; literal_cmd?: string }>;
    };
    const step2 = plan.steps.find((s) => s.n === 2);
    expect(step2?.literal_cmd).toBeTruthy();
    const literal = step2!.literal_cmd!;

    const shadow = resolve(EVIDENCE, 'hostile-literal-path-bin');
    rmSync(shadow, { recursive: true, force: true });
    mkdirSync(shadow, { recursive: true });
    const markers: string[] = [];
    for (const name of HOSTILE_UTILS) {
      const marker = `EVIL_${name.toUpperCase()}_QA23`;
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

    // Execute the *literal* step2 command (authoritative stream) under hostile PATH.
    // Mock harness prove is NOT accepted as the oracle — this is gate-plan text.
    // Without live R2 keys the stream fails closed after absolute-tool work; shadow markers
    // must still be absent (absolute paths only).
    const runId = 'qa23hostile01';
    const evidRoot = resolve(EVIDENCE, 'literal-step2-run');
    mkdirSync(evidRoot, { recursive: true });
    const run = spawnSync('/bin/bash', ['-c', literal], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 120_000,
      env: {
        ...process.env,
        PATH: `${shadow}:/usr/bin:/bin`,
        GATE_RUN_ID: runId,
        // Canaries present (credential ambient) — not live Cloudflare keys.
        R2_RESTORE_ACCESS_KEY_ID: CANARY_AK,
        R2_RESTORE_SECRET_ACCESS_KEY: CANARY_SK,
        R2_RESTORE_SESSION_TOKEN: CANARY_ST,
        R2_ACCESS_KEY_ID: CANARY_AK,
        R2_SECRET_ACCESS_KEY: CANARY_SK,
        R2_SESSION_TOKEN: CANARY_ST,
        REQUIRE_LIVE_R2_RO: '1',
        HOLOCRON_SECRETS_PATH: '/nonexistent/qa23-no-secrets.yaml',
        HOLO_SECRETS_PATH: '/nonexistent/qa23-no-secrets.yaml',
        MINI_HOST: '203.0.113.1',
        MINI_IPV4: '203.0.113.1',
        MINI_IPV6: '2001:db8::1',
        MINI_TAILNET_IP: '203.0.113.2',
        MINI_LAN_IP: '203.0.113.3',
        MINI_DNS_ALIASES: 'mini.invalid',
        MINI_SOCKET_DEFAULTS: '0',
        MINI_UNIX_SOCKETS: '/tmp/.s.PGSQL.5432-gate-absent',
        TARGET_ATTESTED_IDENTITY: 'target-vm-uuid-gate',
        MINI_ATTESTED_IDENTITY: 'mini-hw-uuid-gate',
        REQUIRE_ATTESTED_IDENTITY: '1',
        NC_TIMEOUT_SEC: '1',
      },
    });
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    const ranLog = existsSync(resolve(shadow, 'ran.log'))
      ? readFileSync(resolve(shadow, 'ran.log'), 'utf8')
      : '';
    writeEv('hostile-literal-step2.json', {
      status: run.status,
      out: redact(combined.slice(0, 4000)),
      ranLog,
    });
    for (const m of markers) {
      expect(combined, `shadow marker ${m} in output`).not.toContain(m);
      expect(ranLog, `shadow marker ${m} executed`).not.toContain(m);
    }
    // Must not leak canaries into gate evidence files under step2 path
    const step2Files = walkFiles(resolve(REPO_ROOT, `.tmp/REDHAT-FIX-S28R3/${runId}`));
    for (const f of step2Files) {
      const body = readFileSync(f, 'utf8');
      expect(body, f).not.toContain(CANARY_SK);
      expect(body, f).not.toContain(CANARY_ST);
    }
  }, 150_000);
});

describe('GATE-FIX-S28R3-QA23 production credential transport boundary', () => {
  it('r2_ro_exec_isolated production path: canaries never appear on launcher argv', () => {
    expect(existsSync(PROD_EXEC_FD)).toBe(true);
    const probeDir = resolve(EVIDENCE, 'transport-boundary');
    rmSync(probeDir, { recursive: true, force: true });
    mkdirSync(probeDir, { recursive: true });
    const argvLog = resolve(probeDir, 'launcher-argv.txt');
    const childOut = resolve(probeDir, 'child-out.txt');

    // Production path: sealed-from-env (key names only on argv); canaries never on ps args.
    // Observer: while the isolated command sleeps briefly, capture process argv via ps.
    const script = `#!/bin/bash
set -euo pipefail
ROOT=${JSON.stringify(REPO_ROOT)}
source "$ROOT/scripts/lib/r2-ro-live.sh"
r2_ro_init_trusted_helpers || true
CANARY_SK=${JSON.stringify(CANARY_SK)}
CANARY_AK=${JSON.stringify(CANARY_AK)}
CANARY_ST=${JSON.stringify(CANARY_ST)}
ARGV_LOG=${JSON.stringify(argvLog)}
CHILD_OUT=${JSON.stringify(childOut)}
# GATE-FIX-S28R3-QA25: export canaries then pass KEY NAMES only (never KEY=secret on argv).
export PATH=/usr/bin:/bin HOME=/tmp LC_ALL=C AWS_DEFAULT_REGION=auto
export AWS_ACCESS_KEY_ID="$CANARY_AK"
export AWS_SECRET_ACCESS_KEY="$CANARY_SK"
export AWS_SESSION_TOKEN="$CANARY_ST"
r2_ro_exec_isolated_from_env \\
  PATH HOME LC_ALL \\
  AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN AWS_DEFAULT_REGION \\
  -- \\
  /bin/bash -c 'sleep 0.25; /bin/echo CHILD_OK; /usr/bin/env | /usr/bin/grep -E "^(PATH|HOME|LC_ALL|AWS_DEFAULT_REGION)=" || true' \\
  >"$CHILD_OUT" 2>&1 &
child=$!
sleep 0.05
# Capture process list args (macOS + Linux)
ps -ax -o args= 2>/dev/null | /usr/bin/head -n 5000 >"$ARGV_LOG" || true
wait "$child" || true
# Fail closed if canaries appear in captured argv dump
if /usr/bin/grep -Fq "$CANARY_SK" "$ARGV_LOG"; then
  echo "FAIL: secret on argv" >&2
  exit 2
fi
if /usr/bin/grep -Fq "$CANARY_AK" "$ARGV_LOG"; then
  echo "FAIL: access key on argv" >&2
  exit 2
fi
if /usr/bin/grep -Fq "$CANARY_ST" "$ARGV_LOG"; then
  echo "FAIL: session token on argv" >&2
  exit 2
fi
# Child should have run
/usr/bin/grep -q CHILD_OK "$CHILD_OUT"
# Child stdout must not print secret values (env filter only non-secret keys)
if /usr/bin/grep -Fq "$CANARY_SK" "$CHILD_OUT"; then
  echo "FAIL: secret in child output" >&2
  exit 2
fi
echo "PASS: production transport boundary secret-free argv"
`;
    const probe = resolve(probeDir, 'transport-probe.sh');
    writeFileSync(probe, script);
    chmodSync(probe, 0o755);
    const run = spawnSync('/bin/bash', [probe], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 30_000,
      env: { PATH: '/usr/bin:/bin', HOME: process.env.HOME, LC_ALL: 'C' },
    });
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEv('transport-boundary.json', {
      status: run.status,
      out: redact(combined.slice(0, 3000)),
      argvSample: existsSync(argvLog) ? redact(readFileSync(argvLog, 'utf8').slice(0, 2000)) : '',
      childOut: existsSync(childOut) ? redact(readFileSync(childOut, 'utf8').slice(0, 1000)) : '',
    });
    expect(combined).not.toContain(CANARY_SK);
    expect(combined).not.toContain(CANARY_ST);
    expect(run.status, combined).toBe(0);
    expect(combined).toMatch(/PASS: production transport boundary/);
    // Source: sealed-from-env path present; credential KEY=val refused on legacy form.
    const live = readFileSync(PROD_LIVE, 'utf8');
    expect(live).toMatch(/r2_ro_exec_isolated_from_env/);
    expect(live).toMatch(/seal-env-to-file/);
  });

  it('fingerprint path: r2_ro_tuple_fp16 canaries never appear on python argv', () => {
    const probeDir = resolve(EVIDENCE, 'transport-boundary');
    mkdirSync(probeDir, { recursive: true });
    const argvLog = resolve(probeDir, 'fp16-argv.txt');
    const fpOut = resolve(probeDir, 'fp16-out.txt');
    const script = `#!/bin/bash
set -euo pipefail
ROOT=${JSON.stringify(REPO_ROOT)}
source "$ROOT/scripts/lib/r2-ro-live.sh"
r2_ro_init_trusted_helpers || true
CANARY_SK=${JSON.stringify(CANARY_SK)}
CANARY_AK=${JSON.stringify(CANARY_AK)}
CANARY_ST=${JSON.stringify(CANARY_ST)}
ARGV_LOG=${JSON.stringify(argvLog)}
FP_OUT=${JSON.stringify(fpOut)}
# Run fingerprint in background with a tiny delay so ps can sample the python cmdline.
(
  # Slow the provider slightly via python -c wrapper is not allowed — instead
  # sample while calling production r2_ro_tuple_fp16 (fast). Capture via /bin/ps
  # during a loop that invokes many times with a sleep helper on FD sample side.
  for _i in 1 2 3 4 5 6 7 8 9 10; do
    r2_ro_tuple_fp16 "$CANARY_AK" "$CANARY_SK" "$CANARY_ST" >>"$FP_OUT" 2>/dev/null || true
    printf '\\n' >>"$FP_OUT"
  done
) &
child=$!
# Concurrent ps sampling while fingerprints run
for _j in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
  ps -ax -o args= 2>/dev/null | /usr/bin/head -n 8000 >>"$ARGV_LOG" || true
  sleep 0.02
done
wait "$child" || true
# Fail closed if canaries appear in captured argv dump
if /usr/bin/grep -Fq "$CANARY_SK" "$ARGV_LOG"; then
  echo "FAIL: secret on fingerprint argv" >&2
  exit 2
fi
if /usr/bin/grep -Fq "$CANARY_AK" "$ARGV_LOG"; then
  echo "FAIL: access key on fingerprint argv" >&2
  exit 2
fi
if /usr/bin/grep -Fq "$CANARY_ST" "$ARGV_LOG"; then
  echo "FAIL: session token on fingerprint argv" >&2
  exit 2
fi
# Fingerprint must still produce 16-hex (functional)
if ! /usr/bin/grep -E '^[0-9a-f]{16}$' "$FP_OUT" >/dev/null; then
  echo "FAIL: fp16 did not produce 16-hex" >&2
  /bin/cat "$FP_OUT" >&2 || true
  exit 2
fi
# Cross-check: FD-3 path matches positional hash of same fields
expected="$(/usr/bin/python3 -E -s -c 'import hashlib,sys; print(hashlib.sha256((sys.argv[1]+"\\0"+sys.argv[2]+"\\0"+sys.argv[3]).encode()).hexdigest()[:16], end="")' "$CANARY_AK" "$CANARY_SK" "$CANARY_ST")"
got="$(/usr/bin/head -1 "$FP_OUT" | /usr/bin/tr -d '\\n')"
if [[ "$got" != "$expected" ]]; then
  echo "FAIL: fp16 mismatch got=$got expected=$expected" >&2
  exit 2
fi
echo "PASS: fingerprint path secret-free argv"
`;
    const probe = resolve(probeDir, 'fp16-probe.sh');
    writeFileSync(probe, script);
    chmodSync(probe, 0o755);
    const run = spawnSync('/bin/bash', [probe], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 30_000,
      env: { PATH: '/usr/bin:/bin', HOME: process.env.HOME, LC_ALL: 'C' },
    });
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEv('fp16-boundary.json', {
      status: run.status,
      out: redact(combined.slice(0, 3000)),
      argvSample: existsSync(argvLog) ? redact(readFileSync(argvLog, 'utf8').slice(0, 2000)) : '',
      fpOut: existsSync(fpOut) ? redact(readFileSync(fpOut, 'utf8').slice(0, 500)) : '',
    });
    expect(combined).not.toContain(CANARY_SK);
    expect(combined).not.toContain(CANARY_ST);
    expect(run.status, combined).toBe(0);
    expect(combined).toMatch(/PASS: fingerprint path secret-free argv/);
  });

  it('fire-drill production child launch path: dynamic canary (shared exec-env-from-fd)', () => {
    // Source contract — GATE-FIX-S28R3-QA25 sealed-from-env (no KEY=secret process-sub).
    const src = readFileSync(PROD_FIRE, 'utf8');
    expect(src).toMatch(/exec-env-from-fd\.py|r2_ro_exec_isolated_from_env/);
    expect(src).toMatch(/r2_ro_exec_isolated_from_env/);
    expect(src).toMatch(/CHILD_ENV_KEYS/);
    expect(src).not.toMatch(/\/usr\/bin\/env -i "\$\{CHILD_ENV_ARGS\[@\]\}"/);
    expect(src).not.toMatch(/printf '%s\\0' "\$RESTORE_AK"/);
    expect(src).toMatch(/r2_ro_open_fd3_from_env_values|HOLO_REDACT_/);

    // Dynamic canary: replay the exact production launch pattern used by fire-drill
    // (FD 3 KEY=VAL pairs → exec-env-from-fd.py → absolute child), with canary secrets.
    const probeDir = resolve(EVIDENCE, 'transport-boundary');
    mkdirSync(probeDir, { recursive: true });
    const argvLog = resolve(probeDir, 'fire-drill-launch-argv.txt');
    const childOut = resolve(probeDir, 'fire-drill-launch-child.txt');
    const evidenceScan = resolve(probeDir, 'fire-drill-launch-artifacts');
    rmSync(evidenceScan, { recursive: true, force: true });
    mkdirSync(evidenceScan, { recursive: true });
    const script = `#!/bin/bash
set -euo pipefail
ROOT=${JSON.stringify(REPO_ROOT)}
CANARY_SK=${JSON.stringify(CANARY_SK)}
CANARY_AK=${JSON.stringify(CANARY_AK)}
CANARY_ST=${JSON.stringify(CANARY_ST)}
ARGV_LOG=${JSON.stringify(argvLog)}
CHILD_OUT=${JSON.stringify(childOut)}
EVID=${JSON.stringify(evidenceScan)}
source "$ROOT/scripts/lib/r2-ro-live.sh"
r2_ro_init_trusted_helpers || true
# GATE-FIX-S28R3-QA25 production pattern: export values, seal by key names only.
export PATH=/usr/bin:/bin HOME=/tmp LC_ALL=C
export R2_ACCESS_KEY_ID="$CANARY_AK"
export R2_SECRET_ACCESS_KEY="$CANARY_SK"
export R2_RESTORE_ACCESS_KEY_ID="$CANARY_AK"
export R2_RESTORE_SECRET_ACCESS_KEY="$CANARY_SK"
export R2_SESSION_TOKEN="$CANARY_ST"
export R2_RESTORE_SESSION_TOKEN="$CANARY_ST"
_child_log="$(/usr/bin/mktemp "$EVID/holo-fire-drill-child.XXXXXX")"
set +e
r2_ro_exec_isolated_from_env \\
  PATH HOME LC_ALL \\
  R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY \\
  R2_RESTORE_ACCESS_KEY_ID R2_RESTORE_SECRET_ACCESS_KEY \\
  R2_SESSION_TOKEN R2_RESTORE_SESSION_TOKEN \\
  -- \\
  /bin/bash -c 'sleep 0.3; /bin/echo FIRE_CHILD_OK; /usr/bin/env | /usr/bin/grep -E "^(PATH|HOME|LC_ALL)=" || true' \\
  >"$_child_log" 2>&1 &
child=$!
sleep 0.05
ps -ax -o args= 2>/dev/null | /usr/bin/head -n 8000 >"$ARGV_LOG" || true
wait "$child" || true
# Redact via sealed env values (key names only on sealer argv)
export HOLO_REDACT_AK="$CANARY_AK" HOLO_REDACT_SK="$CANARY_SK" HOLO_REDACT_ST="$CANARY_ST"
export HOLO_REDACT_DATA_AK="$CANARY_AK" HOLO_REDACT_DATA_SK="$CANARY_SK" HOLO_REDACT_DATA_ST="$CANARY_ST"
r2_ro_open_fd3_from_env_values HOLO_REDACT_AK HOLO_REDACT_SK HOLO_REDACT_ST \\
  HOLO_REDACT_DATA_AK HOLO_REDACT_DATA_SK HOLO_REDACT_DATA_ST
/usr/bin/python3 -E -s - "$_child_log" <<'PY' >"$CHILD_OUT"
import os, re, sys
path = sys.argv[1]
try:
    raw = os.read(3, 1 << 20)
except OSError:
    raw = b""
parts = raw.split(b"\\0")
if parts and parts[-1] == b"":
    parts = parts[:-1]
secrets = [p.decode("utf-8", "replace") for p in parts if p]
try:
    text = open(path, "r", errors="replace").read()
except OSError:
    sys.exit(0)
for secret in sorted((s for s in secrets if s), key=len, reverse=True):
    text = text.replace(secret, "[redacted]")
sys.stdout.write(text)
PY
exec 3<&- 2>/dev/null || true
/bin/cp "$_child_log" "$EVID/raw-child-log.txt" 2>/dev/null || true
# Fail if canaries on launcher argv
if /usr/bin/grep -Fq "$CANARY_SK" "$ARGV_LOG"; then
  echo "FAIL: secret on fire-drill launch argv" >&2
  exit 2
fi
if /usr/bin/grep -Fq "$CANARY_AK" "$ARGV_LOG"; then
  echo "FAIL: access key on fire-drill launch argv" >&2
  exit 2
fi
if /usr/bin/grep -Fq "$CANARY_ST" "$ARGV_LOG"; then
  echo "FAIL: session token on fire-drill launch argv" >&2
  exit 2
fi
/usr/bin/grep -q FIRE_CHILD_OK "$CHILD_OUT"
scan_fail=0
while IFS= read -r -d '' f; do
  case "$f" in
    */raw-child-log.txt|*/holo-fire-drill-child.*) continue ;;
  esac
  if /usr/bin/grep -Fq "$CANARY_SK" "$f" 2>/dev/null; then
    echo "FAIL: secret in evidence artifact $f" >&2
    scan_fail=1
  fi
  if /usr/bin/grep -Fq "$CANARY_ST" "$f" 2>/dev/null; then
    echo "FAIL: session token in evidence artifact $f" >&2
    scan_fail=1
  fi
done < <(/usr/bin/find "$EVID" -type f -print0 2>/dev/null)
for f in "$CHILD_OUT" "$ARGV_LOG"; do
  if /usr/bin/grep -Fq "$CANARY_SK" "$f" 2>/dev/null; then
    echo "FAIL: secret in $f" >&2
    scan_fail=1
  fi
done
[[ "$scan_fail" -eq 0 ]] || exit 2
echo "PASS: fire-drill launch path secret-free argv + evidence clean"
`;
    const probe = resolve(probeDir, 'fire-drill-launch-probe.sh');
    writeFileSync(probe, script);
    chmodSync(probe, 0o755);
    const run = spawnSync('/bin/bash', [probe], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 30_000,
      env: { PATH: '/usr/bin:/bin', HOME: process.env.HOME, LC_ALL: 'C' },
    });
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEv('fire-drill-launch-boundary.json', {
      status: run.status,
      out: redact(combined.slice(0, 3000)),
      argvSample: existsSync(argvLog) ? redact(readFileSync(argvLog, 'utf8').slice(0, 2000)) : '',
      childOut: existsSync(childOut) ? redact(readFileSync(childOut, 'utf8').slice(0, 1000)) : '',
    });
    // Recursive scan of transport-boundary evidence for canaries
    for (const f of walkFiles(probeDir)) {
      if (f.endsWith('.sh') || f.includes('raw-child-log') || f.includes('holo-fire-drill-child')) {
        continue;
      }
      const body = readFileSync(f, 'utf8');
      // Skip binary-ish; only text evidence
      if (body.includes('\0')) continue;
      expect(body, f).not.toContain(CANARY_SK);
      expect(body, f).not.toContain(CANARY_ST);
    }
    expect(combined).not.toContain(CANARY_SK);
    expect(combined).not.toContain(CANARY_ST);
    expect(run.status, combined).toBe(0);
    expect(combined).toMatch(/PASS: fire-drill launch path/);
  });

  it('exec-env-from-fd.py rejects non-absolute command and never needs secrets on argv', () => {
    const run = spawnSync('/usr/bin/python3', ['-E', '-s', PROD_EXEC_FD, '--', 'relative-cmd'], {
      encoding: 'utf8',
      timeout: 5_000,
      env: { PATH: '/usr/bin:/bin', HOME: '/tmp', LC_ALL: 'C' },
    });
    expect(run.status).not.toBe(0);
    expect(`${run.stdout}${run.stderr}`).toMatch(/absolute path/i);

    // Positive: absolute /bin/echo with env from FD 3 (non-secret)
    const pos = spawnSync(
      '/bin/bash',
      [
        '-c',
        `exec 3< <(printf '%s\\0' 'PATH=/usr/bin:/bin' 'HOME=/tmp' 'LC_ALL=C' 'MARK=ok'); /usr/bin/python3 -E -s ${JSON.stringify(PROD_EXEC_FD)} -- /usr/bin/env`,
      ],
      { encoding: 'utf8', timeout: 5_000, env: { PATH: '/usr/bin:/bin' } }
    );
    expect(pos.status).toBe(0);
    expect(pos.stdout).toMatch(/MARK=ok/);
    expect(pos.stdout).not.toContain(CANARY_SK);
  });
});

describe('GATE-FIX-S28R3-QA23 hermetic probes and sequence evidence', () => {
  it('QA16/QA22/QA23 never write tracked r2-scope-probes.json (source contract)', () => {
    for (const name of [
      'sprint28-s28r3-qa16-gate-fix.test.ts',
      'sprint28-s28r3-qa22-gate-fix.test.ts',
      'sprint28-s28r3-qa23-gate-fix.test.ts',
    ]) {
      const src = readFileSync(
        resolve(REPO_ROOT, 'packages/platform/tests/integration', name),
        'utf8'
      );
      // Must never mutate the tracked probes path (PROD_PROBES write banned).
      expect(src, name).not.toMatch(/writeFileSync\(\s*PROD_PROBES\s*,/);
      expect(src, name).not.toMatch(/writeFileSync\(\s*['"]scripts\/lib\/r2-scope-probes\.json/);
      expect(src, name).toMatch(/mkdtempSync|isolated/);
    }
  });

  it('records hermetic probe hash before/after focused suite phases (no .qa16bak)', () => {
    const before = sha256File(PROD_PROBES);
    expect(existsSync(`${PROD_PROBES}.qa16bak`)).toBe(false);

    // Phase: focused QA23-related self-check — run prove under isolated tree only
    const tree = mkdtempSync(join(tmpdir(), 'qa23-hermetic-'));
    try {
      mkdirSync(join(tree, 'scripts', 'lib'), { recursive: true });
      copyFileSync(PROD_PROVE, join(tree, 'scripts', 'prove-r2-readonly.sh'));
      copyFileSync(PROD_LIVE, join(tree, 'scripts', 'lib', 'r2-ro-live.sh'));
      copyFileSync(
        resolve(REPO_ROOT, 'scripts/lib/r2_s3_provider.py'),
        join(tree, 'scripts', 'lib', 'r2_s3_provider.py')
      );
      copyFileSync(PROD_EXEC_FD, join(tree, 'scripts', 'lib', 'exec-env-from-fd.py'));
      copyFileSync(PROD_PROBES, join(tree, 'scripts', 'lib', 'r2-scope-probes.json'));
      const run = spawnSync('/bin/bash', [join(tree, 'scripts', 'prove-r2-readonly.sh')], {
        cwd: tree,
        encoding: 'utf8',
        timeout: 30_000,
        env: env({}),
      });
      // Fake canary creds → non-zero; must not touch tracked probes
      expect(run.status).not.toBe(0);
    } finally {
      rmSync(tree, { recursive: true, force: true });
    }

    const after = sha256File(PROD_PROBES);
    expect(after).toBe(before);
    expect(existsSync(`${PROD_PROBES}.qa16bak`)).toBe(false);

    const sequence = {
      schema: 'holo.qa23-hermetic-sequence.v1',
      probe_path: 'scripts/lib/r2-scope-probes.json',
      probe_sha256_before: before,
      probe_sha256_after_isolated_prove: after,
      qa16bak_absent: true,
      note: 'Full Sprint-28 suite + live R2 phases recorded separately in hermetic-sequence.json when credentials available.',
    };
    writeEv('hermetic-probe-phase.json', sequence);
    writeFileSync(
      resolve(EVIDENCE, 'hermetic-sequence-partial.json'),
      `${JSON.stringify(sequence, null, 2)}\n`
    );
  });
});
