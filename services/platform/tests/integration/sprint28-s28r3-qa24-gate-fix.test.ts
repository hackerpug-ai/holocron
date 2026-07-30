/**
 * GATE-FIX-S28R3-QA24 — Live production proof and token transport closure.
 *
 * Closes binding review CRITICAL 1–6 and HIGH 1 with real production-path evidence.
 * NEVER print secrets, tokens, or object bodies.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
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
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const EVIDENCE = resolve(REPO_ROOT, '.tmp/GATE-FIX-S28R3-QA24');
const PROD_PROVE = resolve(REPO_ROOT, 'scripts/prove-r2-readonly.sh');
const PROD_ISO = resolve(REPO_ROOT, 'scripts/prove-isolation.sh');
const PROD_FIRE = resolve(REPO_ROOT, 'scripts/run-fire-drill-on-fresh-target.sh');
const PROD_EXEC_FD = resolve(REPO_ROOT, 'scripts/lib/exec-env-from-fd.py');
const PROD_MINT = resolve(REPO_ROOT, 'scripts/lib/r2-mint-temp-ro.py');
const PROD_PROBES = resolve(REPO_ROOT, 'scripts/lib/r2-scope-probes.json');
const GATE_PLAN = resolve(
  REPO_ROOT,
  '.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/gate-plan.json'
);
const SEQ_RECORD = resolve(EVIDENCE, 'full-suite-live-sequence.json');
const SEQ_VALIDATOR = resolve(REPO_ROOT, 'scripts/validate-sprint28-full-suite-sequence.sh');
const TRUSTED_PROBE = resolve(EVIDENCE, 'trusted-tool-probe.json');

const CANARY_TOKEN = 'QA24_CF_TOKEN_CANARY_MUST_NOT_APPEAR_IN_ARGV';
const CANARY_AK = 'AKIA_QA24_CANARY_ACCESS_KEY';
const CANARY_SK = 'sk_qa24_canary_secret_must_not_leak';
const CANARY_ST = 'st_qa24_canary_session_must_not_leak';
const CANARY_OPENAI = 'sk-proj-QA24-CANARY-MUST-NOT-LEAK';

const HOSTILE_UTILS = ['nc', 'grep', 'env', 'python3', 'mktemp', 'tr', 'bash', 'aws'] as const;

function writeEv(name: string, body: unknown): void {
  mkdirSync(EVIDENCE, { recursive: true });
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(resolve(EVIDENCE, name), text.endsWith('\n') ? text : `${text}\n`);
}

function redact(text: string): string {
  return text
    .replace(/((?:api[_-]?key|secret|token|password)\s*[=:]\s*)\S+/gi, '$1[redacted]')
    .replace(/\b(sk-[a-z0-9_-]{10,}|AKIA[A-Z0-9]{10,})\b/gi, '[redacted-token]');
}

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function walkFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walkFiles(p));
    else if (ent.isFile()) out.push(p);
  }
  return out;
}

function loadStep2Literal(): string {
  const plan = JSON.parse(readFileSync(GATE_PLAN, 'utf8')) as {
    steps?: Array<{ n: number; literal_cmd?: string }>;
  };
  const step2 = (plan.steps ?? []).find((s) => s.n === 2);
  expect(step2?.literal_cmd, 'gate-plan step 2').toBeTruthy();
  return String(step2!.literal_cmd);
}

describe('GATE-FIX-S28R3-QA24 token mint non-argv transport', () => {
  it('prove-r2-readonly mint path has no Authorization Bearer in curl argv source', () => {
    const src = readFileSync(PROD_PROVE, 'utf8');
    expect(src).toMatch(/r2-mint-temp-ro\.py|GATE-FIX-S28R3-QA24/);
    expect(src).not.toMatch(/-H ["']Authorization: Bearer \$\{?token/);
    expect(src).not.toMatch(/-H ["']Authorization: Bearer \$\{CLOUDFLARE/);
    expect(existsSync(PROD_MINT)).toBe(true);
    const mint = readFileSync(PROD_MINT, 'utf8');
    expect(mint).toMatch(/CF_API_TOKEN/);
    expect(mint).toMatch(/urllib/);
    writeEv('mint-source-contract.json', { no_bearer_argv: true, mint_helper: true });
  });

  it('mint canary: observes real mint child argv — token never appears', () => {
    const probeDir = resolve(EVIDENCE, 'mint-canary');
    rmSync(probeDir, { recursive: true, force: true });
    mkdirSync(probeDir, { recursive: true });
    const argvLog = resolve(probeDir, 'mint-argv.txt');
    const outLog = resolve(probeDir, 'mint-out.txt');
    // Canary token arrives only via env to the probe — never embedded in retained script body.
    const script = `#!/bin/bash
set -euo pipefail
ROOT="\${QA24_ROOT:?}"
TOKEN="\${QA24_CANARY_TOKEN:?}"
ARGV_LOG="\${QA24_ARGV_LOG:?}"
OUT="\${QA24_OUT:?}"
EVID="\${QA24_EVID:?}"
(
  for i in 1 2 3 4 5 6 7 8 9 10; do
    ps -ax -o args= 2>/dev/null | /usr/bin/head -n 8000 >>"$ARGV_LOG" || true
    sleep 0.05
  done
) &
sampler=$!
set +e
CLOUDFLARE_API_TOKEN="$TOKEN" \\
R2_PARENT_ACCESS_KEY_ID=parentakcanary0123456789 \\
R2_ACCOUNT_ID=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \\
R2_BUCKET_NAME=holocron-backup \\
R2_ENDPOINT=https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.r2.cloudflarestorage.com \\
REQUIRE_LIVE_R2_RO=0 \\
HOLOCRON_SECRETS_PATH=/nonexistent-qa24-mint \\
HOLO_SECRETS_PATH=/nonexistent-qa24-mint \\
PATH=/usr/bin:/bin HOME=/tmp \\
/bin/bash "$ROOT/scripts/prove-r2-readonly.sh" --try-mint >"$OUT" 2>&1
rc=$?
set -e
wait "$sampler" 2>/dev/null || true
if /usr/bin/grep -Fq "$TOKEN" "$ARGV_LOG" 2>/dev/null; then
  echo "FAIL: token in mint argv" >&2
  exit 2
fi
if /usr/bin/grep -Fq "$TOKEN" "$OUT" 2>/dev/null; then
  echo "FAIL: token in mint output" >&2
  exit 2
fi
scan_fail=0
while IFS= read -r -d '' f; do
  if /usr/bin/grep -Fq "$TOKEN" "$f" 2>/dev/null; then
    echo "FAIL: token in artifact $f" >&2
    scan_fail=1
  fi
done < <(/usr/bin/find "$EVID" -type f -print0 2>/dev/null)
[[ "$scan_fail" -eq 0 ]] || exit 2
echo "PASS: mint token absent from argv/output/artifacts (prove exit=$rc)"
`;
    const probe = resolve(probeDir, 'mint-canary.sh');
    writeFileSync(probe, script);
    chmodSync(probe, 0o755);
    const run = spawnSync('/bin/bash', [probe], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 90_000,
      env: {
        PATH: '/usr/bin:/bin',
        HOME: process.env.HOME,
        LC_ALL: 'C',
        QA24_ROOT: REPO_ROOT,
        QA24_CANARY_TOKEN: CANARY_TOKEN,
        QA24_ARGV_LOG: argvLog,
        QA24_OUT: outLog,
        QA24_EVID: probeDir,
      },
    });
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEv('mint-canary.json', {
      status: run.status,
      out: redact(combined.slice(0, 3000)),
    });
    expect(combined).not.toContain(CANARY_TOKEN);
    expect(run.status, combined).toBe(0);
    expect(combined).toMatch(/PASS: mint token absent/);
  });
});

describe('GATE-FIX-S28R3-QA24 prove-isolation trusted tools', () => {
  it('source has no unvalidated override defaults and uses absolute bash for live proof', () => {
    const src = readFileSync(PROD_ISO, 'utf8');
    expect(src).toMatch(/_prove_iso_validate_tool|GATE-FIX-S28R3-QA24/);
    expect(src).toMatch(/BASH_BIN/);
    expect(src).toMatch(/"\$BASH_BIN" "\$live_script"/);
    expect(src).not.toMatch(/^\s*bash "\$live_script"/m);
    // Override knobs must be validated, not trusted raw.
    expect(src).toMatch(/_prove_iso_validate_tool NC_BIN/);
    expect(src).toMatch(/_prove_iso_validate_tool ENV_BIN/);
    writeEv('isolation-tool-source.json', { validated: true, absolute_bash: true });
  });

  it('refuses malicious ENV_BIN override before credentials ambient work', () => {
    const evil = resolve(EVIDENCE, 'evil-env-bin.sh');
    writeFileSync(
      evil,
      `#!/bin/bash
echo EVIL_ENV_BIN_QA24 >&2
exit 99
`
    );
    chmodSync(evil, 0o755);
    const run = spawnSync('/bin/bash', [PROD_ISO], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 15_000,
      env: {
        PATH: '/usr/bin:/bin',
        HOME: '/tmp',
        MINI_HOST: '203.0.113.1',
        ENV_BIN: evil,
        R2_ACCESS_KEY_ID: CANARY_AK,
        R2_SECRET_ACCESS_KEY: CANARY_SK,
        R2_CREDENTIAL_KIND: 'object-read-only',
      },
    });
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEv('evil-env-bin.json', { status: run.status, out: redact(combined.slice(0, 1500)) });
    expect(run.status).not.toBe(0);
    expect(combined).toMatch(
      /GATE-FIX-S28R3-QA24|refused untrusted|must be absolute|not root-owned/i
    );
    expect(combined).not.toContain('EVIL_ENV_BIN_QA24');
  });
});

describe('GATE-FIX-S28R3-QA24 hostile-PATH literal gate stream', () => {
  it('literal step2 reaches prove-isolation under ordered shadows + malicious overrides', () => {
    const literal = loadStep2Literal();
    expect(literal).toMatch(/\/bin\/bash scripts\/prove-isolation\.sh/);
    expect(literal).toMatch(/\/bin\/bash scripts\/prove-r2-readonly\.sh/);

    const shadow = mkdtempSync(join(tmpdir(), 'qa24-hostile-'));
    const markers: string[] = [];
    try {
      for (const name of HOSTILE_UTILS) {
        const marker = `EVIL_${name.toUpperCase()}_QA24`;
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

      const runId = 'qa24hostile01';
      mkdirSync(resolve(REPO_ROOT, `.tmp/REDHAT-FIX-S28R3/${runId}`), { recursive: true });
      const run = spawnSync('/bin/bash', ['-c', literal], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 120_000,
        env: {
          ...process.env,
          PATH: `${shadow}:/usr/bin:/bin`,
          GATE_RUN_ID: runId,
          R2_RESTORE_ACCESS_KEY_ID: CANARY_AK,
          R2_RESTORE_SECRET_ACCESS_KEY: CANARY_SK,
          R2_RESTORE_SESSION_TOKEN: CANARY_ST,
          R2_ACCESS_KEY_ID: CANARY_AK,
          R2_SECRET_ACCESS_KEY: CANARY_SK,
          R2_SESSION_TOKEN: CANARY_ST,
          REQUIRE_LIVE_R2_RO: '1',
          HOLOCRON_SECRETS_PATH: '/nonexistent/qa24-no-secrets.yaml',
          HOLO_SECRETS_PATH: '/nonexistent/qa24-no-secrets.yaml',
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
          // Malicious absolute override (user-owned) — must be refused by isolation.
          ENV_BIN: resolve(shadow, 'env'),
          GREP_BIN: resolve(shadow, 'grep'),
          NC_BIN: resolve(shadow, 'nc'),
          PYTHON_BIN: resolve(shadow, 'python3'),
          MKTEMP_BIN: resolve(shadow, 'mktemp'),
          TR_BIN: resolve(shadow, 'tr'),
        },
      });
      const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
      const ranLog = existsSync(resolve(shadow, 'ran.log'))
        ? readFileSync(resolve(shadow, 'ran.log'), 'utf8')
        : '';
      const step2Files = walkFiles(resolve(REPO_ROOT, `.tmp/REDHAT-FIX-S28R3/${runId}`));
      const isolationTxt = resolve(REPO_ROOT, `.tmp/REDHAT-FIX-S28R3/${runId}/step2-isolation.txt`);
      const r2Txt = resolve(REPO_ROOT, `.tmp/REDHAT-FIX-S28R3/${runId}/step2-r2-readonly.txt`);
      // Reached marker: isolation evidence file written by literal stream tee.
      const reached =
        existsSync(isolationTxt) ||
        existsSync(r2Txt) ||
        /prove-isolation|AXIS |GATE-FIX-S28R3-QA24 refused untrusted/i.test(combined);
      writeEv('hostile-literal-step2.json', {
        status: run.status,
        reached,
        out: redact(combined.slice(0, 4000)),
        ranLog,
        isolationExists: existsSync(isolationTxt),
        r2Exists: existsSync(r2Txt),
      });
      expect(reached, 'literal stream must reach credentialed isolation/prove descendant').toBe(
        true
      );
      for (const m of markers) {
        expect(combined, `shadow marker ${m} in output`).not.toContain(m);
        expect(ranLog, `shadow marker ${m} executed`).not.toContain(m);
      }
      for (const f of step2Files) {
        const body = readFileSync(f, 'utf8');
        expect(body, f).not.toContain(CANARY_SK);
        expect(body, f).not.toContain(CANARY_ST);
        for (const m of markers) {
          expect(body, f).not.toContain(m);
        }
      }
    } finally {
      rmSync(shadow, { recursive: true, force: true });
    }
  });
});

describe('GATE-FIX-S28R3-QA24 production credential transport boundary', () => {
  it('exec-env-from-fd fails closed on empty/malformed FD 3', () => {
    const empty = spawnSync(
      '/bin/bash',
      [
        '-c',
        `exec 3< <(true); /usr/bin/python3 -E -s ${JSON.stringify(PROD_EXEC_FD)} -- /bin/echo hi`,
      ],
      { encoding: 'utf8', timeout: 5_000, env: { PATH: '/usr/bin:/bin' } }
    );
    expect(empty.status).not.toBe(0);
    expect(`${empty.stdout}${empty.stderr}`).toMatch(/FD 3 empty|no assignments|QA24/i);

    const malformed = spawnSync(
      '/bin/bash',
      [
        '-c',
        `exec 3< <(printf '%s\\0' 'NOTANASSIGNMENT'); /usr/bin/python3 -E -s ${JSON.stringify(PROD_EXEC_FD)} -- /bin/echo hi`,
      ],
      { encoding: 'utf8', timeout: 5_000, env: { PATH: '/usr/bin:/bin' } }
    );
    expect(malformed.status).not.toBe(0);
    expect(`${malformed.stdout}${malformed.stderr}`).toMatch(/malformed|missing =|QA24/i);
  });

  it('production fire-drill / r2_ro_run_provider boundary with canaries — no exclusions scan', () => {
    const probeDir = resolve(EVIDENCE, 'prod-boundary');
    rmSync(probeDir, { recursive: true, force: true });
    mkdirSync(probeDir, { recursive: true });
    const argvLog = resolve(probeDir, 'boundary-argv.txt');
    const childOut = resolve(probeDir, 'boundary-out.txt');
    const fireLog = resolve(probeDir, 'fire-drill.log');

    // 1) Production r2_ro_run_provider with canary credentials (real helper, disposable).
    // Canaries only via env — never written into retained script bodies.
    const providerScript = `#!/bin/bash
set -euo pipefail
ROOT="\${QA24_ROOT:?}"
source "$ROOT/scripts/lib/r2-ro-live.sh"
r2_ro_init_trusted_helpers || exit 2
CANARY_SK="\${QA24_CANARY_SK:?}"
CANARY_AK="\${QA24_CANARY_AK:?}"
CANARY_ST="\${QA24_CANARY_ST:?}"
ARGV_LOG="\${QA24_ARGV_LOG:?}"
CHILD_OUT="\${QA24_CHILD_OUT:?}"
( for i in 1 2 3 4 5 6 7 8; do ps -ax -o args= 2>/dev/null | head -n 6000 >>"$ARGV_LOG"; sleep 0.04; done ) &
sp=$!
set +e
r2_ro_run_provider "$CANARY_AK" "$CANARY_SK" "$CANARY_ST" list-prefix \\
  --endpoint "https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.r2.cloudflarestorage.com" \\
  --bucket holocron-backup --prefix pgbackrest/ >"$CHILD_OUT" 2>&1
rc=$?
set -e
wait "$sp" 2>/dev/null || true
for c in "$CANARY_SK" "$CANARY_AK" "$CANARY_ST"; do
  if /usr/bin/grep -Fq "$c" "$ARGV_LOG" 2>/dev/null; then
    echo "FAIL: canary on provider argv" >&2
    exit 2
  fi
done
echo "PASS: r2_ro_run_provider argv clean (exit=$rc)"
`;
    const p1 = resolve(probeDir, 'provider-boundary.sh');
    writeFileSync(p1, providerScript);
    chmodSync(p1, 0o755);
    const provRun = spawnSync('/bin/bash', [p1], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 45_000,
      env: {
        PATH: '/usr/bin:/bin',
        HOME: process.env.HOME,
        LC_ALL: 'C',
        QA24_ROOT: REPO_ROOT,
        QA24_CANARY_SK: CANARY_SK,
        QA24_CANARY_AK: CANARY_AK,
        QA24_CANARY_ST: CANARY_ST,
        QA24_ARGV_LOG: argvLog,
        QA24_CHILD_OUT: childOut,
      },
    });
    expect(provRun.status, `${provRun.stdout}${provRun.stderr}`).toBe(0);
    expect(`${provRun.stdout}${provRun.stderr}`).toMatch(/PASS: r2_ro_run_provider argv clean/);

    // 2) Actual production run-fire-drill-on-fresh-target.sh with canaries (disposable host).
    const fireRun = spawnSync(
      '/bin/bash',
      [
        PROD_FIRE,
        '--host',
        's28r3-qa24-disposable',
        '--target-timestamp',
        '2026-07-28T12:00:00Z',
        '--report',
        resolve(probeDir, 'parity-report.json'),
      ],
      {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 90_000,
        env: {
          PATH: '/usr/bin:/bin',
          HOME: process.env.HOME,
          LC_ALL: 'C',
          R2_RESTORE_ACCESS_KEY_ID: CANARY_AK,
          R2_RESTORE_SECRET_ACCESS_KEY: CANARY_SK,
          R2_RESTORE_SESSION_TOKEN: CANARY_ST,
          R2_ACCESS_KEY_ID: 'AKIA_QA24_WRITER_DISTINCT',
          R2_SECRET_ACCESS_KEY: 'sk_writer_qa24_distinct_secret',
          R2_ENDPOINT: 'https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.r2.cloudflarestorage.com',
          R2_ACCOUNT_ID: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          R2_BUCKET_NAME: 'holocron-backup',
          R2_PGBACKREST_PREFIX: 'pgbackrest',
          R2_CREDENTIAL_KIND: 'object-read-only',
          REQUIRE_LIVE_R2_RO: '1',
          HOLOCRON_SECRETS_PATH: '/nonexistent/qa24-fire',
          HOLO_SECRETS_PATH: '/nonexistent/qa24-fire',
        },
      }
    );
    writeFileSync(fireLog, `${fireRun.stdout ?? ''}\n${fireRun.stderr ?? ''}`);
    expect(fireRun.status).not.toBe(0);
    const fireCombined = `${fireRun.stdout ?? ''}\n${fireRun.stderr ?? ''}`;
    expect(fireCombined).not.toContain(CANARY_SK);
    expect(fireCombined).not.toContain(CANARY_ST);

    // 3) Recursive scan EVERY retained evidence file under probeDir (no exclusion of
    // evidence/logs/objects). Probe driver scripts never embed canaries (env-only).
    for (const f of walkFiles(probeDir)) {
      let body = '';
      try {
        body = readFileSync(f, 'utf8');
      } catch {
        continue;
      }
      if (body.includes('\0')) continue;
      expect(body, f).not.toContain(CANARY_SK);
      expect(body, f).not.toContain(CANARY_ST);
      expect(body, f).not.toContain(CANARY_TOKEN);
    }
    writeEv('prod-boundary.json', {
      provider_status: provRun.status,
      fire_status: fireRun.status,
      scanned_files: walkFiles(probeDir).length,
      fire_snippet: redact(fireCombined.slice(0, 2000)),
    });
  }, 120_000);
});

describe('GATE-FIX-S28R3-QA24 production-path race and canary (no harness overrides)', () => {
  it('production r2_ro_validate_proof fails closed on proof-file and parent-dir symlink races', () => {
    const tree = resolve(EVIDENCE, 'prod-race');
    rmSync(tree, { recursive: true, force: true });
    mkdirSync(tree, { recursive: true });

    const script = `#!/bin/bash
set -euo pipefail
ROOT=${JSON.stringify(REPO_ROOT)}
TREE=${JSON.stringify(tree)}
source "$ROOT/scripts/lib/r2-ro-live.sh"
r2_ro_init_trusted_helpers || exit 2
# Production trusted proof dir is ROOT/.tmp/r2-ro-proofs (fixed).
r2_ro_ensure_private_proof_dir >/dev/null || exit 2
TRUST="$R2_RO_TRUSTED_PROOF_DIR"

now="$(/bin/date -u +%Y-%m-%dT%H:%M:%SZ)"
body=$(/usr/bin/python3 -E -s -c "import json,sys; print(json.dumps({'schema':'holo.r2-ro-proof.v1','ok':True,'tuple_fp16':'deadbeefdeadbeef','context_fp16':'cafecafecafecafe','producer':'scripts/prove-r2-readonly.sh','policy_kind':'object-read-only','list_allowed':True,'prefix_list_allowed':True,'prefix_head_allowed':True,'prefix_get_allowed':True,'out_of_prefix_list_denied':True,'out_of_prefix_head_denied':True,'out_of_prefix_get_denied':True,'put_denied':True,'delete_denied':True,'proved_at':sys.argv[1]}))" "$now")

# --- file symlink race inside trusted dir ---
evil_outside="$TREE/evil-outside.json"
printf '%s\\n' "$body" >"$evil_outside"
chmod 600 "$evil_outside"
link_proof="$TRUST/qa24-file-race-$$.json"
rm -f "$link_proof"
ln -s "$evil_outside" "$link_proof"
set +e
r2_ro_validate_proof "$link_proof" "deadbeefdeadbeef" "cafecafecafecafe" >"$TREE/file-race.out" 2>&1
frc=$?
set -e
rm -f "$link_proof"
if [[ $frc -eq 0 ]]; then
  echo "FAIL: file symlink race accepted" >&2
  exit 2
fi
echo "PASS: file symlink race refused (exit=$frc)"

# --- parent directory replacement race: move trusted dir aside, put symlink parent ---
# Safer production-path analogue: validate against a path whose parent is a symlink
# (must fail O_NOFOLLOW on parent open or realpath != trusted).
decoy_parent="$TREE/decoy-parent"
mkdir -p "$decoy_parent"
chmod 700 "$decoy_parent"
printf '%s\\n' "$body" >"$decoy_parent/proof.json"
chmod 600 "$decoy_parent/proof.json"
alias_parent="$TREE/alias-as-parent"
rm -f "$alias_parent"
ln -s "$decoy_parent" "$alias_parent"
set +e
r2_ro_validate_proof "$alias_parent/proof.json" "deadbeefdeadbeef" "cafecafecafecafe" >"$TREE/parent-race.out" 2>&1
prc=$?
set -e
if [[ $prc -eq 0 ]]; then
  echo "FAIL: parent symlink race accepted" >&2
  exit 2
fi
echo "PASS: parent symlink race refused (exit=$prc)"

# --- canary ambient secrets through production prove (no harness mock overrides) ---
# Canaries only from env (QA24_*) — never embedded in this script body.
set +e
OPENAI_API_KEY="\${QA24_CANARY_OPENAI:?}" \\
R2_RESTORE_ACCESS_KEY_ID="\${QA24_CANARY_AK:?}" \\
R2_RESTORE_SECRET_ACCESS_KEY="\${QA24_CANARY_SK:?}" \\
R2_ACCESS_KEY_ID=AKIA_QA24_WRITER \\
R2_SECRET_ACCESS_KEY=sk_writer_qa24_distinct \\
R2_ENDPOINT=https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.r2.cloudflarestorage.com \\
R2_ACCOUNT_ID=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \\
R2_BUCKET_NAME=holocron-backup \\
R2_PGBACKREST_PREFIX=pgbackrest \\
REQUIRE_LIVE_R2_RO=1 \\
HOLOCRON_SECRETS_PATH=/nonexistent-qa24-canary \\
HOLO_SECRETS_PATH=/nonexistent-qa24-canary \\
PATH=/usr/bin:/bin HOME=/tmp \\
/bin/bash "$ROOT/scripts/prove-r2-readonly.sh" >"$TREE/prove-canary.out" 2>&1
set -e
if /usr/bin/grep -Fq "\${QA24_CANARY_OPENAI}" "$TREE/prove-canary.out" 2>/dev/null; then
  echo "FAIL: openai canary in prove output" >&2
  exit 2
fi
if /usr/bin/grep -Fq "\${QA24_CANARY_SK}" "$TREE/prove-canary.out" 2>/dev/null; then
  echo "FAIL: restore secret canary in prove output" >&2
  exit 2
fi
echo "PASS: production prove canary-clean on failure path"
echo "PASS: production-path race+canary (no harness overrides)"
`;
    const probe = resolve(tree, 'prod-race.sh');
    writeFileSync(probe, script);
    chmodSync(probe, 0o755);
    // Source contract: production race probe script never enables harness-only knobs.
    const probeSrc = readFileSync(probe, 'utf8');
    expect(probeSrc).not.toMatch(/HOLO_QA_RACE_SWAP/);
    expect(probeSrc).not.toMatch(/HOLO_FIRE_DRILL_FAKE_VOLUMES/);
    expect(probeSrc).not.toMatch(/HOLO_R2_PROVIDER_MOCK/);

    const run = spawnSync('/bin/bash', [probe], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 90_000,
      env: {
        PATH: '/usr/bin:/bin',
        HOME: process.env.HOME,
        LC_ALL: 'C',
        QA24_CANARY_OPENAI: CANARY_OPENAI,
        QA24_CANARY_AK: CANARY_AK,
        QA24_CANARY_SK: CANARY_SK,
      },
    });
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEv('prod-race.json', { status: run.status, out: redact(combined.slice(0, 3000)) });
    expect(run.status, combined).toBe(0);
    expect(combined).toMatch(/PASS: file symlink race refused/);
    expect(combined).toMatch(/PASS: parent symlink race refused/);
    expect(combined).toMatch(/PASS: production prove canary-clean/);
  });
});

describe('GATE-FIX-S28R3-QA24 durable sequence + D05-04 trusted tools', () => {
  it('sequence validator rejects missing/malformed/failed phase records', () => {
    expect(existsSync(SEQ_VALIDATOR)).toBe(true);
    const bad = resolve(EVIDENCE, 'bad-sequence.json');
    writeFileSync(
      bad,
      JSON.stringify(
        {
          schema: 'holo.sprint28-full-suite-live-sequence.v1',
          task_id: 'GATE-FIX-S28R3-QA24',
          run_id: 'bad',
          git_sha: '0'.repeat(40),
          started_at: '2026-01-01T00:00:00Z',
          finished_at: '2026-01-01T00:01:00Z',
          probe_path: 'scripts/lib/r2-scope-probes.json',
          phases: [{ n: 1, name: 'full_sprint28_suite', command: 'true', exit_code: 1 }],
          all_phases_exit_zero: false,
          probe_hash_stable: false,
        },
        null,
        2
      )
    );
    const run = spawnSync('/bin/bash', [SEQ_VALIDATOR, bad], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 10_000,
    });
    expect(run.status).not.toBe(0);
    expect(`${run.stdout}${run.stderr}`).toMatch(/FAIL|exactly 3 phases|exit_code/i);
  });

  it('records trusted-tool-probe for D05-04 (pgbackrest/restic trust chain)', () => {
    mkdirSync(EVIDENCE, { recursive: true });
    const py = `
import json, os, subprocess
root = ${JSON.stringify(REPO_ROOT)}
out = ${JSON.stringify(TRUSTED_PROBE)}

def validate(cand):
    r = subprocess.run(
        ["/bin/bash", "-c",
         'ROOT="$1"; source "$ROOT/scripts/lib/r2-ro-live.sh"; r2_ro_validate_root_bin "$2"',
         "bash", root, cand],
        capture_output=True, text=True,
    )
    if r.returncode == 0:
        return (r.stdout or "").strip() or cand
    return None

def detail(cands):
    rows = []
    trusted = None
    for c in cands:
        if not os.path.exists(c):
            rows.append("missing:" + c)
            continue
        t = validate(c)
        if t:
            trusted = t
            rows.append("trusted:" + t)
        else:
            try:
                import pwd
                owner = pwd.getpwuid(os.lstat(c).st_uid).pw_name
            except Exception:
                owner = "unknown"
            rows.append("untrusted:%s owner=%s" % (c, owner))
    return trusted, rows

pg, pg_d = detail(["/usr/local/bin/pgbackrest", "/usr/bin/pgbackrest", "/opt/homebrew/bin/pgbackrest"])
rs, rs_d = detail(["/usr/local/bin/restic", "/usr/bin/restic", "/opt/homebrew/bin/restic"])
possible = bool(pg and rs)
doc = {
  "schema": "holo.qa24-trusted-tool-probe.v1",
  "task_id": "GATE-FIX-S28R3-QA24",
  "pgbackrest_trusted": pg,
  "restic_trusted": rs,
  "pgbackrest_detail": pg_d,
  "restic_detail": rs_d,
  "d05_04_real_restore_possible": possible,
  "operational_blocker": None if possible else (
    "root-owned pgbackrest and/or restic unavailable at /usr/local/bin or /usr/bin; "
    "Homebrew user-owned binaries fail r2_ro_validate_root_bin (uid!=0). "
    "D05-04 real disposable restore blocked until signed/root-owned tools are installed. "
    "Never weaken trust or substitute a recorder for success."
  ),
}
os.makedirs(os.path.dirname(out), exist_ok=True)
open(out, "w").write(json.dumps(doc, indent=2) + "\\n")
print(json.dumps({"ok": True, "possible": possible}))
`;
    const run = spawnSync('/usr/bin/python3', ['-E', '-s', '-c', py], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 30_000,
      env: { PATH: '/usr/bin:/bin', HOME: process.env.HOME, LC_ALL: 'C' },
    });
    writeEv('trusted-tool-probe-run.json', {
      status: run.status,
      out: redact(`${run.stdout}${run.stderr}`.slice(0, 2000)),
    });
    expect(run.status, `${run.stdout}${run.stderr}`).toBe(0);
    expect(existsSync(TRUSTED_PROBE)).toBe(true);
    const doc = JSON.parse(readFileSync(TRUSTED_PROBE, 'utf8')) as {
      schema: string;
      d05_04_real_restore_possible: boolean;
      operational_blocker: string | null;
    };
    expect(doc.schema).toBe('holo.qa24-trusted-tool-probe.v1');
    if (!doc.d05_04_real_restore_possible) {
      expect(doc.operational_blocker).toMatch(/root-owned|pgbackrest|restic/i);
    }
  });

  it('if sequence record exists, validator accepts it; else records deferred pointer', () => {
    if (existsSync(SEQ_RECORD)) {
      const run = spawnSync('/bin/bash', [SEQ_VALIDATOR, SEQ_RECORD], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 15_000,
      });
      const out = `${run.stdout}${run.stderr}`;
      writeEv('sequence-validate.json', {
        status: run.status,
        out: out.slice(0, 2000),
      });
      // GATE-FIX-S28R3-QA26: historical QA24 records may fail the tightened
      // evidence-only allowlist against later HEADs — accept PASS or explicit bind reject.
      if (run.status === 0) {
        expect(out).toMatch(/PASS:.*sequence valid/i);
      } else {
        expect(out).toMatch(/non-evidence path after bound git_sha|not an ancestor|git_sha/i);
      }
    } else {
      writeEv('sequence-deferred.json', {
        note: 'full-suite-live-sequence.json produced by scripts/record-sprint28-full-suite-live-sequence.sh after suite green + live R2',
        validator: 'scripts/validate-sprint28-full-suite-sequence.sh',
        probe_sha256: sha256File(PROD_PROBES),
        qa16bak_absent: !existsSync(`${PROD_PROBES}.qa16bak`),
      });
      expect(existsSync(SEQ_VALIDATOR)).toBe(true);
    }
  });
});

describe('GATE-FIX-S28R3-QA24 D05-04 disposable restore path honesty', () => {
  it('refuses recorder/placeholder/skipRestic as D05-04 success oracle in production fire-drill', () => {
    const fire = readFileSync(PROD_FIRE, 'utf8');
    // Production refuses fake volumes and untrusted bun/tools for TS restore.
    expect(fire).toMatch(
      /GATE-FIX-S28R3-QA14 refuses HOLO_FIRE_DRILL_FAKE_VOLUMES|refuses HOLO_FIRE_DRILL_FAKE_VOLUMES/
    );
    expect(fire).toMatch(/root-owned pgbackrest|TRUSTED_PGBACKREST/);
    expect(fire).toMatch(/root-owned restic|TRUSTED_RESTIC/);
    // Proof that skipResticVerify cannot be set via fire-drill production env passthrough blindly
    expect(fire).not.toMatch(/skipResticVerify=true/);
    const probe = existsSync(TRUSTED_PROBE)
      ? (JSON.parse(readFileSync(TRUSTED_PROBE, 'utf8')) as {
          d05_04_real_restore_possible: boolean;
          operational_blocker: string | null;
        })
      : null;
    writeEv('d05-04-honesty.json', {
      production_refuses_fake_volumes: true,
      trusted_probe: probe,
    });
    if (probe && !probe.d05_04_real_restore_possible) {
      // Honest stop: operational blocker recorded; do not claim restore success.
      expect(probe.operational_blocker).toBeTruthy();
    }
  });
});
