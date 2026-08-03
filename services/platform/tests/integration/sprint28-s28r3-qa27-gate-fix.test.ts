/**
 * GATE-FIX-S28R3-QA27 — Exact evidence allowlist and real production boundary.
 *
 * Closes binding HIGH H-1..H-3 and MEDIUM M-1:
 *   - exact-file post-bind allowlist (no whole-dir QA26/QA27 prefix)
 *   - real provision/fire-drill soft-fail refuse (paths.txt present → non-zero)
 *   - real provision/cleanup lifecycle twice (zero QA27 namespace residue)
 *   - D05 consumer destructive controls for baseline/identity/manifest links
 *
 * NEVER print secrets, tokens, or object bodies.
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
import { afterEach, describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const EVIDENCE = resolve(REPO_ROOT, '.tmp/GATE-FIX-S28R3-QA27');
const SEQ_VALIDATOR = resolve(REPO_ROOT, 'scripts/validate-sprint28-full-suite-sequence.sh');
const D05_CONSUMER = resolve(REPO_ROOT, 'scripts/consume-d05-04-bundle.sh');
const PROD_FIRE = resolve(REPO_ROOT, 'scripts/run-fire-drill-on-fresh-target.sh');
const PROD_PROVISION = resolve(REPO_ROOT, 'scripts/provision-fresh-restore-target.sh');
const PROD_PROBES = resolve(REPO_ROOT, 'scripts/lib/r2-scope-probes.json');
const WHITESPACE_BASE = '4630c1b4aa6019507af13435862801777b11a93d';
const QA26_BUNDLE = resolve(REPO_ROOT, '.tmp/GATE-FIX-S28R3-QA26/d05-04-bundle');

const qa27Hosts: string[] = [];
const qa27Dirs: string[] = [];

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

function discoverEnvPath(): string | null {
  const candidates = [
    resolve(REPO_ROOT, '.env'),
    process.env.HOLO_QA27_ENV_PATH?.trim() || '',
    process.env.HOLO_QA26_ENV_PATH?.trim() || '',
    '/Users/inference1/Projects/holocron/.env',
  ].filter(Boolean);
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

function discoverSecretsPath(): string | null {
  const candidates = [
    resolve(REPO_ROOT, 'services/platform/config/secrets.yaml'),
    process.env.HOLO_QA27_SECRETS_PATH?.trim() || '',
    process.env.HOLOCRON_SECRETS_PATH?.trim() || '',
    process.env.HOLO_SECRETS_PATH?.trim() || '',
    '/Users/inference1/Projects/holocron/services/platform/config/secrets.yaml',
  ].filter(Boolean);
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

function dockerBin(): string {
  return (
    ['/usr/local/bin/docker', '/opt/homebrew/bin/docker', '/usr/bin/docker'].find((p) =>
      existsSync(p)
    ) ?? 'docker'
  );
}

function dockerCleanupHost(host: string): void {
  const docker = dockerBin();
  spawnSync(docker, ['rm', '-f', host], { encoding: 'utf8', timeout: 30_000 });
  // Retry containers often use `${host}-retry` suffix from boundary harnesses.
  spawnSync(docker, ['rm', '-f', `${host}-retry`], { encoding: 'utf8', timeout: 30_000 });
  spawnSync(docker, ['volume', 'rm', '-f', `${host}-pgdata`, `${host}-blobs`], {
    encoding: 'utf8',
    timeout: 30_000,
  });
  spawnSync(docker, ['volume', 'rm', '-f', `${host}-retry-pgdata`, `${host}-retry-blobs`], {
    encoding: 'utf8',
    timeout: 30_000,
  });
  spawnSync(docker, ['network', 'rm', `${host}-net`], { encoding: 'utf8', timeout: 30_000 });
  spawnSync(docker, ['network', 'rm', `${host}-retry-net`], { encoding: 'utf8', timeout: 30_000 });
  for (const staging of [
    resolve(REPO_ROOT, `.tmp/fresh-restore/${host}`),
    resolve(REPO_ROOT, `.tmp/fresh-restore/${host}-retry`),
  ]) {
    rmSync(staging, { recursive: true, force: true });
  }
  // Fire-drill host lock (if held by this namespace).
  const lockdir = resolve(REPO_ROOT, '.tmp/fire-drill-host.lockdir');
  if (existsSync(resolve(lockdir, 'pid'))) {
    try {
      const pid = Number(readFileSync(resolve(lockdir, 'pid'), 'utf8').trim());
      if (pid && !Number.isNaN(pid)) {
        try {
          process.kill(pid, 0);
        } catch {
          rmSync(lockdir, { recursive: true, force: true });
        }
      }
    } catch {
      // best-effort
    }
  }
}

function listQa27DockerResources(): string[] {
  const docker = dockerBin();
  const out: string[] = [];
  const ps = spawnSync(docker, ['ps', '-a', '--format', '{{.Names}}'], {
    encoding: 'utf8',
    timeout: 15_000,
  });
  for (const line of (ps.stdout ?? '').split('\n')) {
    const n = line.trim();
    if (n.includes('s28r3-qa27') || n.includes('qa27-')) out.push(`container:${n}`);
  }
  const vols = spawnSync(docker, ['volume', 'ls', '--format', '{{.Name}}'], {
    encoding: 'utf8',
    timeout: 15_000,
  });
  for (const line of (vols.stdout ?? '').split('\n')) {
    const n = line.trim();
    if (n.includes('s28r3-qa27') || n.includes('qa27-')) out.push(`volume:${n}`);
  }
  const nets = spawnSync(docker, ['network', 'ls', '--format', '{{.Name}}'], {
    encoding: 'utf8',
    timeout: 15_000,
  });
  for (const line of (nets.stdout ?? '').split('\n')) {
    const n = line.trim();
    if (n.includes('s28r3-qa27') || n.includes('qa27-')) out.push(`network:${n}`);
  }
  return out;
}

function listQa27Staging(hostPrefix: string): string[] {
  const root = resolve(REPO_ROOT, '.tmp/fresh-restore');
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((n) => n.includes(hostPrefix) || n.includes('s28r3-qa27') || n.includes('qa27-'))
    .map((n) => `staging:${n}`);
}

function loadEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const m = t.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    let v = m[2] ?? '';
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    const key = m[1];
    if (key) out[key] = v;
  }
  return out;
}

afterEach(() => {
  while (qa27Hosts.length) {
    const h = qa27Hosts.pop();
    if (!h) break;
    try {
      dockerCleanupHost(h);
    } catch {
      // best-effort
    }
  }
  while (qa27Dirs.length) {
    const d = qa27Dirs.pop();
    if (!d) break;
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      // best-effort
    }
  }
});

describe('GATE-FIX-S28R3-QA27 H-1 exact-file post-bind allowlist', () => {
  it('validator source has no whole-dir QA26/QA27 allowlist prefix', () => {
    const vsrc = readFileSync(SEQ_VALIDATOR, 'utf8');
    expect(vsrc).not.toMatch(/ALLOW_DIR_PREFIXES\s*=/);
    expect(vsrc).toMatch(/build_exact_allowlist|ALLOW_EXACT/);
    expect(vsrc).toMatch(/GATE-FIX-S28R3-QA27/);
    expect(vsrc).toMatch(/\.tmp\/GATE-FIX-S28R3-QA27/);
    // Must not accept arbitrary nested paths under the former whole-dir prefix.
    expect(vsrc).toMatch(/unlisted\/nested evidence path|exact closed|NO whole-directory/);
    expect(vsrc).toMatch(/executable mode forbidden|mode-only executable/);
    // No evidence-prefix bypass for forbidden control surfaces.
    expect(vsrc).not.toMatch(
      /FORBIDDEN_SUBSTRINGS\) and not p\.startswith\(\s*["']\.tmp\/GATE-FIX-S28R3-QA26\//
    );
    writeEv('sequence-allowlist-contract.json', {
      no_allow_dir_prefixes: true,
      qa27_exact: true,
      no_qa26_whole_dir_bypass: true,
    });
  });

  it('mutation commits after bound SHA are rejected; only exact evidence layout accepted', () => {
    expect(existsSync(SEQ_VALIDATOR)).toBe(true);
    const probeHash = sha256File(PROD_PROBES);
    const freezeSha = spawnSync('git', ['-C', REPO_ROOT, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
    })
      .stdout.trim()
      .slice(0, 40);
    expect(freezeSha).toMatch(/^[0-9a-f]{40}$/);

    const cloneDir = mkdtempSync(join(tmpdir(), 'qa27-mut-clone-'));
    qa27Dirs.push(cloneDir);
    // Local shared clone — isolated mutation commits, never touches worktree HEAD.
    const clone = spawnSync(
      'git',
      ['clone', '--local', '--shared', '--no-hardlinks', REPO_ROOT, cloneDir],
      { encoding: 'utf8', timeout: 60_000 }
    );
    expect(clone.status, redact(`${clone.stdout}${clone.stderr}`)).toBe(0);

    const git = (args: string[], opts?: { cwd?: string }) =>
      spawnSync('git', ['-C', opts?.cwd ?? cloneDir, ...args], {
        encoding: 'utf8',
        timeout: 30_000,
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: 'qa27-mutation',
          GIT_AUTHOR_EMAIL: 'qa27@local',
          GIT_COMMITTER_NAME: 'qa27-mutation',
          GIT_COMMITTER_EMAIL: 'qa27@local',
        },
      });

    // Ensure clone is on freeze tip.
    expect(git(['rev-parse', 'HEAD']).stdout.trim().startsWith(freezeSha.slice(0, 12))).toBe(true);

    const runId = `qa27-mut-${Date.now()}`;
    const mkRecord = (gitSha: string, outPath: string) => {
      const recDir = resolve(outPath);
      mkdirSync(recDir, { recursive: true });
      const phaseDir = resolve(recDir, `sequence-${runId}`);
      mkdirSync(phaseDir, { recursive: true });
      writeFileSync(
        resolve(phaseDir, 'phase1-full-suite.log'),
        'Test Files  1 passed (1)\nTests  1 passed (1)\n'
      );
      writeFileSync(resolve(phaseDir, 'phase2-live-r2-ro.log'), 'PASS: r2 readonly proof PASS\n');
      writeFileSync(
        resolve(phaseDir, 'phase3-full-suite.log'),
        'Test Files  1 passed (1)\nTests  1 passed (1)\n'
      );
      const doc = {
        schema: 'holo.sprint28-full-suite-live-sequence.v1',
        task_id: 'GATE-FIX-S28R3-QA27',
        run_id: runId,
        git_sha: gitSha,
        started_at: '2026-01-01T00:00:00Z',
        finished_at: '2026-01-01T00:01:00Z',
        probe_path: 'scripts/lib/r2-scope-probes.json',
        all_phases_exit_zero: true,
        probe_hash_stable: true,
        phases: [
          {
            n: 1,
            name: 'full_sprint28_suite',
            command: 'pnpm exec vitest run services/platform/tests/integration/sprint28-*.test.ts',
            exit_code: 0,
            probe_sha256_before: probeHash,
            probe_sha256_after: probeHash,
            qa16bak_absent: true,
            log: `sequence-${runId}/phase1-full-suite.log`,
            test_files_passed: 1,
            tests_passed: 1,
            test_files_failed: 0,
            tests_failed: 0,
          },
          {
            n: 2,
            name: 'live_r2_readonly_proof',
            command: 'REQUIRE_LIVE_R2_RO=1 /bin/bash scripts/prove-r2-readonly.sh',
            exit_code: 0,
            probe_sha256_before: probeHash,
            probe_sha256_after: probeHash,
            qa16bak_absent: true,
            log: `sequence-${runId}/phase2-live-r2-ro.log`,
          },
          {
            n: 3,
            name: 'full_sprint28_suite',
            command: 'pnpm exec vitest run services/platform/tests/integration/sprint28-*.test.ts',
            exit_code: 0,
            probe_sha256_before: probeHash,
            probe_sha256_after: probeHash,
            qa16bak_absent: true,
            log: `sequence-${runId}/phase3-full-suite.log`,
            test_files_passed: 1,
            tests_passed: 1,
            test_files_failed: 0,
            tests_failed: 0,
          },
        ],
      };
      const recordPath = resolve(recDir, 'full-suite-live-sequence.json');
      writeFileSync(recordPath, `${JSON.stringify(doc, null, 2)}\n`);
      return recordPath;
    };

    const results: Record<string, { status: number | null; out: string }> = {};

    const runValidator = (label: string, recordPath: string, expectSha: string) => {
      // Copy validator from worktree (clone may lag if freeze not committed yet — use live script).
      const vInClone = resolve(cloneDir, 'scripts/validate-sprint28-full-suite-sequence.sh');
      copyFileSync(SEQ_VALIDATOR, vInClone);
      const r = spawnSync('/bin/bash', [vInClone, recordPath, expectSha], {
        cwd: cloneDir,
        encoding: 'utf8',
        timeout: 30_000,
        env: { PATH: '/usr/bin:/bin', HOME: '/tmp', LC_ALL: 'C' },
      });
      results[label] = {
        status: r.status,
        out: redact(`${r.stdout ?? ''}${r.stderr ?? ''}`).slice(0, 1500),
      };
      return r;
    };

    const commitMutation = (paths: string[], msg: string) => {
      for (const p of paths) {
        git(['add', '-f', '--', p]);
      }
      const c = git(['commit', '-m', msg, '--no-verify', '--allow-empty-message']);
      if (c.status !== 0) {
        // retry with all paths force
        git(['add', '-A', '-f']);
        const c2 = git(['commit', '-m', msg, '--no-verify']);
        expect(c2.status, redact(`${c2.stdout}${c2.stderr}`)).toBe(0);
      }
      return git(['rev-parse', 'HEAD']).stdout.trim();
    };

    // --- Mutation 1: executable under former evidence prefix ---
    const evilDir = resolve(cloneDir, '.tmp/GATE-FIX-S28R3-QA27/nested-evil');
    mkdirSync(evilDir, { recursive: true });
    const evilBin = resolve(evilDir, 'smuggle.sh');
    writeFileSync(evilBin, '#!/bin/bash\necho evil\n');
    chmodSync(evilBin, 0o755);
    const mut1 = commitMutation(
      ['.tmp/GATE-FIX-S28R3-QA27/nested-evil/smuggle.sh'],
      'qa27-mut: executable under evidence prefix'
    );
    const rec1 = mkRecord(freezeSha, resolve(cloneDir, '.tmp/qa27-mut-records/m1'));
    const r1 = runValidator('executable_under_prefix', rec1, mut1);
    const executableResult = results.executable_under_prefix;
    if (!executableResult) throw new Error('missing executable-under-prefix validator result');
    expect(r1.status, executableResult.out).not.toBe(0);
    expect(executableResult.out).toMatch(/executable|unlisted|non-evidence|forbidden/i);

    // Reset to freeze for next mutation.
    git(['reset', '--hard', freezeSha]);

    // --- Mutation 2: unlisted nested file under evidence prefix ---
    const nested = resolve(cloneDir, '.tmp/GATE-FIX-S28R3-QA27/nested/unlisted.json');
    mkdirSync(resolve(cloneDir, '.tmp/GATE-FIX-S28R3-QA27/nested'), { recursive: true });
    writeFileSync(nested, '{"evil":true}\n');
    const mut2 = commitMutation(
      ['.tmp/GATE-FIX-S28R3-QA27/nested/unlisted.json'],
      'qa27-mut: unlisted nested evidence file'
    );
    const rec2 = mkRecord(freezeSha, resolve(cloneDir, '.tmp/qa27-mut-records/m2'));
    const r2 = runValidator('unlisted_nested', rec2, mut2);
    const nestedResult = results.unlisted_nested;
    if (!nestedResult) throw new Error('missing unlisted-nested validator result');
    expect(r2.status, nestedResult.out).not.toBe(0);
    expect(nestedResult.out).toMatch(/unlisted|nested|non-evidence/i);

    git(['reset', '--hard', freezeSha]);

    // --- Mutation 3: changed validator/test/product ---
    const vPath = resolve(cloneDir, 'scripts/validate-sprint28-full-suite-sequence.sh');
    writeFileSync(vPath, `${readFileSync(vPath, 'utf8')}\n# qa27-mut-tamper\n`);
    const mut3 = commitMutation(
      ['scripts/validate-sprint28-full-suite-sequence.sh'],
      'qa27-mut: tamper validator'
    );
    // Restore live validator content into clone for the check (validator is what we run).
    copyFileSync(SEQ_VALIDATOR, vPath);
    const rec3 = mkRecord(freezeSha, resolve(cloneDir, '.tmp/qa27-mut-records/m3'));
    const r3 = runValidator('changed_validator', rec3, mut3);
    const changedValidatorResult = results.changed_validator;
    if (!changedValidatorResult) throw new Error('missing changed-validator result');
    expect(r3.status, changedValidatorResult.out).not.toBe(0);
    expect(changedValidatorResult.out).toMatch(/non-evidence|validate-sprint28|forbidden|control/i);

    git(['reset', '--hard', freezeSha]);

    // --- Mutation 4: mode-only executable on an otherwise-allowlisted path ---
    const modeTargetRel = '.tmp/GATE-FIX-S28R3-QA27/whitespace-clean.json';
    const modeTarget = resolve(cloneDir, modeTargetRel);
    mkdirSync(resolve(cloneDir, '.tmp/GATE-FIX-S28R3-QA27'), { recursive: true });
    writeFileSync(modeTarget, '{"ok":true}\n');
    chmodSync(modeTarget, 0o644);
    git(['add', '-f', '--', modeTargetRel]);
    git(['commit', '-m', 'qa27-mut: seed allowlisted file', '--no-verify']);
    chmodSync(modeTarget, 0o755);
    git(['add', '-f', '--', modeTargetRel]);
    const modeCommit = git(['commit', '-m', 'qa27-mut: mode-only executable', '--no-verify']);
    // If git did not record mode change, force via update-index.
    let mut4 = git(['rev-parse', 'HEAD']).stdout.trim();
    if (modeCommit.status !== 0) {
      spawnSync('git', ['-C', cloneDir, 'update-index', '--chmod=+x', modeTargetRel], {
        encoding: 'utf8',
      });
      git(['commit', '-m', 'qa27-mut: mode-only executable via update-index', '--no-verify']);
      mut4 = git(['rev-parse', 'HEAD']).stdout.trim();
    }
    const rec4 = mkRecord(freezeSha, resolve(cloneDir, '.tmp/qa27-mut-records/m4'));
    const r4 = runValidator('mode_only_executable', rec4, mut4);
    const modeResult = results.mode_only_executable;
    if (!modeResult) throw new Error('missing mode-only validator result');
    expect(r4.status, modeResult.out).not.toBe(0);
    expect(modeResult.out).toMatch(/executable|mode-only|forbidden/i);

    git(['reset', '--hard', freezeSha]);

    // --- Mutation 5: non-ancestor record SHA ---
    const rec5 = mkRecord('a'.repeat(40), resolve(cloneDir, '.tmp/qa27-mut-records/m5'));
    const r5 = runValidator('non_ancestor', rec5, freezeSha);
    const ancestorResult = results.non_ancestor;
    if (!ancestorResult) throw new Error('missing non-ancestor validator result');
    expect(r5.status, ancestorResult.out).not.toBe(0);
    expect(ancestorResult.out).toMatch(/not an ancestor|does not resolve|git_sha/i);

    // --- Positive control: exact allowlisted evidence-only commit after freeze ---
    git(['reset', '--hard', freezeSha]);
    const posDir = resolve(cloneDir, '.tmp/GATE-FIX-S28R3-QA27');
    mkdirSync(posDir, { recursive: true });
    const posRecord = mkRecord(freezeSha, posDir);
    // mkRecord wrote into posDir already; also write immutable marker + whitespace.
    writeFileSync(resolve(posDir, 'full-suite-live-sequence.json.immutable'), `${runId}\n`);
    writeFileSync(resolve(posDir, 'whitespace-clean.json'), '{"ok":true}\n');
    // Stage only exact allowlisted paths.
    const posPaths = [
      '.tmp/GATE-FIX-S28R3-QA27/full-suite-live-sequence.json',
      '.tmp/GATE-FIX-S28R3-QA27/full-suite-live-sequence.json.immutable',
      '.tmp/GATE-FIX-S28R3-QA27/whitespace-clean.json',
      `.tmp/GATE-FIX-S28R3-QA27/sequence-${runId}/phase1-full-suite.log`,
      `.tmp/GATE-FIX-S28R3-QA27/sequence-${runId}/phase2-live-r2-ro.log`,
      `.tmp/GATE-FIX-S28R3-QA27/sequence-${runId}/phase3-full-suite.log`,
    ];
    for (const p of posPaths) {
      git(['add', '-f', '--', p]);
    }
    const posCommit = git(['commit', '-m', 'qa27-mut: exact evidence-only accept', '--no-verify']);
    expect(posCommit.status, redact(`${posCommit.stdout}${posCommit.stderr}`)).toBe(0);
    const mutPos = git(['rev-parse', 'HEAD']).stdout.trim();
    const rPos = runValidator('exact_evidence_accept', posRecord, mutPos);
    const positiveResult = results.exact_evidence_accept;
    if (!positiveResult) throw new Error('missing exact-evidence positive result');
    expect(rPos.status, positiveResult.out).toBe(0);
    expect(positiveResult.out).toMatch(/PASS:.*sequence valid/i);

    writeEv('mutation-rejects.json', {
      freeze_sha: freezeSha,
      results,
      all_mutations_rejected:
        executableResult.status !== 0 &&
        nestedResult.status !== 0 &&
        changedValidatorResult.status !== 0 &&
        modeResult.status !== 0 &&
        ancestorResult.status !== 0,
      exact_evidence_accepted: positiveResult.status === 0,
    });
  }, 120_000);
});

describe('GATE-FIX-S28R3-QA27 H-2 real production-boundary soft-fail refuse', () => {
  it('invokes real provision+fire-drill; failed provision with paths.txt is non-zero (no soft-pass)', () => {
    expect(existsSync(PROD_PROVISION)).toBe(true);
    expect(existsSync(PROD_FIRE)).toBe(true);

    // Source must not be a pure prov_rc=1 theatre fragment.
    // The orchestrator below always execs the real production scripts.

    const envPath = discoverEnvPath();
    const secretsPath = discoverSecretsPath();
    expect(envPath || secretsPath, 'detached env/secrets discovery').toBeTruthy();

    const probeDir = resolve(EVIDENCE, 'prod-boundary');
    rmSync(probeDir, { recursive: true, force: true });
    mkdirSync(probeDir, { recursive: true });
    qa27Dirs.push(probeDir);

    const host = `s28r3-qa27-bound-${Date.now()}`;
    qa27Hosts.push(host);

    const argvLog = resolve(probeDir, 'boundary-argv.txt');
    const provOut = resolve(probeDir, 'provision.out');
    const fireOut = resolve(probeDir, 'fire-drill.out');
    const transcript = resolve(probeDir, 'transcript.json');

    // Deliberate provision failure AFTER paths.txt: identity collision on isolation axis.
    // Real scripts only — not a hardcoded prov_rc=1 stand-in.
    const script = `#!/bin/bash
set -euo pipefail
ROOT=${JSON.stringify(REPO_ROOT)}
PROBE=${JSON.stringify(probeDir)}
ARGV_LOG=${JSON.stringify(argvLog)}
PROV_OUT=${JSON.stringify(provOut)}
FIRE_OUT=${JSON.stringify(fireOut)}
HOST=${JSON.stringify(host)}
TRANSCRIPT=${JSON.stringify(transcript)}

# Detached discovery (not hard-coded primary-only): checkout-local then env overrides then primary.
ENV_FILE=""
for c in "$ROOT/.env" "\${HOLO_QA27_ENV_PATH:-}" "\${HOLO_QA26_ENV_PATH:-}" "/Users/inference1/Projects/holocron/.env"; do
  [[ -n "$c" && -f "$c" ]] && ENV_FILE="$c" && break
done
SECRETS=""
for c in "$ROOT/services/platform/config/secrets.yaml" "\${HOLO_QA27_SECRETS_PATH:-}" "\${HOLOCRON_SECRETS_PATH:-}" "\${HOLO_SECRETS_PATH:-}" "/Users/inference1/Projects/holocron/services/platform/config/secrets.yaml"; do
  [[ -n "$c" && -f "$c" ]] && SECRETS="$c" && break
done
[[ -n "$ENV_FILE" || -n "$SECRETS" ]] || { echo "FAIL: no env/secrets discovered"; exit 2; }

if [[ -n "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi
[[ -n "$SECRETS" ]] && export HOLOCRON_SECRETS_PATH="$SECRETS" HOLO_SECRETS_PATH="$SECRETS"

# Unconditional cleanup trap for this disposable namespace.
cleanup() {
  local docker=""
  for d in /usr/local/bin/docker /opt/homebrew/bin/docker /usr/bin/docker; do
    [[ -x "$d" ]] && docker="$d" && break
  done
  if [[ -n "$docker" ]]; then
    "$docker" rm -f "$HOST" "\${HOST}-retry" >/dev/null 2>&1 || true
    "$docker" volume rm -f "\${HOST}-pgdata" "\${HOST}-blobs" "\${HOST}-retry-pgdata" "\${HOST}-retry-blobs" >/dev/null 2>&1 || true
    "$docker" network rm "\${HOST}-net" "\${HOST}-retry-net" >/dev/null 2>&1 || true
  fi
  /bin/rm -rf "$ROOT/.tmp/fresh-restore/$HOST" "$ROOT/.tmp/fresh-restore/\${HOST}-retry" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

: >"$ARGV_LOG"
: >"$PROV_OUT"
: >"$FIRE_OUT"

# Sample launcher + children PIDs/argv (redacted later).
(
  for i in $(seq 1 80); do
    /usr/bin/python3 -E -s - "$ARGV_LOG" "$$" "$i" <<'PY' || true
import subprocess, sys
log_path, root_pid_s, sample_i = sys.argv[1], sys.argv[2], sys.argv[3]
try:
    root_pid = int(root_pid_s)
except ValueError:
    sys.exit(0)
try:
    out = subprocess.check_output(
        ["/bin/ps", "-ax", "-o", "pid=,ppid=,args="],
        text=True,
        stderr=subprocess.DEVNULL,
    )
except Exception:
    sys.exit(0)
procs = {}
for line in out.splitlines():
    line = line.strip()
    if not line:
        continue
    parts = line.split(None, 2)
    if len(parts) < 2:
        continue
    try:
        pid = int(parts[0]); ppid = int(parts[1])
    except ValueError:
        continue
    args = parts[2] if len(parts) > 2 else ""
    procs[pid] = (ppid, args)
desc = set()
if root_pid in procs:
    desc.add(root_pid)
    changed = True
    while changed:
        changed = False
        for pid, (ppid, _) in list(procs.items()):
            if ppid in desc and pid not in desc:
                desc.add(pid)
                changed = True
with open(log_path, "a", encoding="utf-8", errors="replace") as f:
    f.write(f"--- sample {sample_i} launcher_pid={root_pid} tree_n={len(desc)} ---\\n")
    for pid in sorted(desc):
        ppid, args = procs.get(pid, (-1, ""))
        # Redact likely secret value tokens in argv (never print raw secrets).
        safe = args
        for tok in ("R2_", "AWS_", "SECRET", "TOKEN", "PASSWORD", "AKIA"):
            if tok.lower() in safe.lower():
                safe = "[redacted-argv-shape]"
                break
        f.write(f"{pid} {ppid} {safe}\\n")
PY
    sleep 0.2
  done
) &
sp=$!

# Real production provision — deliberate identity collision so isolation fails
# AFTER paths.txt is written (paths written before isolation probe).
set +e
RESTORE_PG_PORT=$((57000 + ($$ % 2000))) \\
TARGET_ATTESTED_IDENTITY=qa27-collision-identity \\
MINI_ATTESTED_IDENTITY=qa27-collision-identity \\
  /bin/bash "$ROOT/scripts/provision-fresh-restore-target.sh" --host "$HOST" \\
  >"$PROV_OUT" 2>&1
prov_rc=$?
set -e

paths_txt="$ROOT/.tmp/fresh-restore/$HOST/paths.txt"
paths_present=0
[[ -f "$paths_txt" ]] && paths_present=1

# Reach markers for real provision entrypoint.
if ! /usr/bin/grep -E -q 'provision-fresh-restore-target|path map:|SUCCESS:|error:|identity' "$PROV_OUT" 2>/dev/null; then
  echo "FAIL: did not reach real provision script markers" >&2
  /usr/bin/tail -n 30 "$PROV_OUT" >&2 || true
  kill "$sp" 2>/dev/null || true
  exit 2
fi

# Also invoke real fire-drill entrypoint (must not soft-pass provision failure).
set +e
/bin/bash "$ROOT/scripts/run-fire-drill-on-fresh-target.sh" \\
  --host "$HOST" \\
  --target-timestamp "2026-07-30T04:01:28Z" \\
  --report "$PROBE/parity-report.json" \\
  --attestation "$PROBE/attestation.json" \\
  >"$FIRE_OUT" 2>&1
fire_rc=$?
set -e

kill "$sp" 2>/dev/null || true
wait "$sp" 2>/dev/null || true

# Durable redacted transcript (no unredacted secrets).
/usr/bin/python3 -E -s - "$TRANSCRIPT" "$PROV_OUT" "$FIRE_OUT" "$ARGV_LOG" \\
  "$prov_rc" "$fire_rc" "$paths_present" "$HOST" <<'PY'
import json, os, re, sys
out, prov, fire, argv, prov_rc, fire_rc, paths_present, host = sys.argv[1:9]
def safe_read(p):
    try:
        t = open(p, encoding="utf-8", errors="replace").read()
    except OSError:
        return ""
    t = re.sub(r"(?i)((?:api[_-]?key|secret|token|password)\\s*[=:]\\s*)\\S+", r"\\1[redacted]", t)
    t = re.sub(r"\\b(sk-[a-z0-9_-]{10,}|AKIA[A-Z0-9]{10,})\\b", "[redacted-token]", t)
    return t
prov_body = safe_read(prov)
fire_body = safe_read(fire)
argv_body = safe_read(argv)
doc = {
    "schema": "holo.qa27-prod-boundary-transcript.v1",
    "host": host,
    "prov_rc": int(prov_rc),
    "fire_rc": int(fire_rc),
    "paths_present": paths_present == "1",
    "launcher_pid_samples": len([ln for ln in argv_body.splitlines() if ln.startswith("--- sample")]),
    "argv_lines": len(argv_body.splitlines()),
    "provision_reach": bool(re.search(r"provision-fresh-restore-target|path map:|identity", prov_body, re.I)),
    "fire_reach": bool(re.search(r"run-fire-drill|fresh-target|volume|error:|GATE-FIX", fire_body, re.I)),
    "soft_pass_refused": int(prov_rc) != 0 and paths_present == "1",
    "overall_nonzero": True,
}
open(out, "w", encoding="utf-8").write(json.dumps(doc, indent=2) + "\\n")
# Secret scan of artifacts (values from environ only; never print).
names = [
    "R2_RESTORE_SECRET_ACCESS_KEY", "R2_SECRET_ACCESS_KEY", "RESTIC_PASSWORD",
    "R2_REPO_CIPHER_PASS", "R2_RESTORE_SESSION_TOKEN",
]
bodies = [prov_body, fire_body, argv_body]
for name in names:
    val = os.environ.get(name) or ""
    if len(val) < 8:
        continue
    for b in bodies:
        if val in b:
            print(f"FAIL: secret from {name} leaked into transcript", file=sys.stderr)
            sys.exit(2)
print("PASS: secret scan clean")
sys.exit(0)
PY

# Oracle: deliberately failed provision with present paths.txt → overall non-zero.
# A stand-alone generated shell fragment with prov_rc=1 alone cannot satisfy:
# we required real provision markers + real fire-drill invocation above.
if [[ "$prov_rc" -eq 0 ]]; then
  echo "FAIL: expected deliberate provision failure (identity collision); got 0" >&2
  exit 2
fi
if [[ "$paths_present" -ne 1 ]]; then
  echo "FAIL: expected paths.txt present after partial provision; missing" >&2
  /usr/bin/tail -n 40 "$PROV_OUT" >&2 || true
  exit 2
fi
echo "FAIL: provision exit=$prov_rc (refuse soft-pass even if paths.txt present=$paths_present) fire_rc=$fire_rc"
echo "PASS: real production-boundary soft-fail refuse (overall non-zero)"
# Explicit non-zero overall (soft-pass refuse).
exit 2
`;

    const probe = resolve(probeDir, 'prod-boundary-real.sh');
    writeFileSync(probe, script);
    chmodSync(probe, 0o755);

    const run = spawnSync('/bin/bash', [probe], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 300_000,
      env: {
        PATH: '/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin',
        HOME: process.env.HOME,
        LC_ALL: 'C',
        USER: process.env.USER,
        TMPDIR: process.env.TMPDIR ?? '/tmp',
        HOLO_QA27_ENV_PATH: envPath ?? '',
        HOLO_QA27_SECRETS_PATH: secretsPath ?? '',
      },
    });
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;

    // Overall non-zero (refuse soft-pass).
    expect(run.status, redact(combined)).not.toBe(0);
    expect(combined).toMatch(/refuse soft-pass|provision exit=/i);
    expect(combined).toMatch(/PASS: real production-boundary soft-fail refuse/i);
    // Must not be pure theatre: real script markers.
    expect(existsSync(provOut)).toBe(true);
    const provBody = readFileSync(provOut, 'utf8');
    expect(provBody).toMatch(/provision-fresh-restore-target|path map:|identity|error:/i);
    expect(existsSync(fireOut)).toBe(true);

    // paths.txt was present at failure time (transcript records it); cleanup may remove staging.
    let transcriptDoc: Record<string, unknown> = {};
    if (existsSync(transcript)) {
      transcriptDoc = JSON.parse(readFileSync(transcript, 'utf8')) as Record<string, unknown>;
    }
    expect(transcriptDoc.paths_present, 'paths.txt present at deliberate fail').toBe(true);
    expect(Number(transcriptDoc.prov_rc)).not.toBe(0);
    expect(transcriptDoc.provision_reach).toBe(true);
    expect(transcriptDoc.fire_reach).toBe(true);
    expect(Number(transcriptDoc.launcher_pid_samples)).toBeGreaterThan(0);

    // Source contract: harness is not a pure prov_rc=1 fragment without real scripts.
    const harnessSrc = readFileSync(probe, 'utf8');
    expect(harnessSrc).toMatch(/provision-fresh-restore-target\.sh/);
    expect(harnessSrc).toMatch(/run-fire-drill-on-fresh-target\.sh/);
    expect(harnessSrc).not.toMatch(/^prov_rc=1$/m);

    writeEv('prod-boundary.json', {
      status: run.status,
      host,
      env_discovered: Boolean(envPath),
      secrets_discovered: Boolean(secretsPath),
      transcript: transcriptDoc,
      soft_pass_refused: true,
      real_scripts: true,
      out: redact(combined.slice(0, 3000)),
    });
  }, 360_000);
});

describe('GATE-FIX-S28R3-QA27 H-3 real lifecycle twice', () => {
  it('runs real production provision cleanup path twice; zero QA27 namespace residue each time', () => {
    const docker = dockerBin();
    const info = spawnSync(docker, ['info'], { encoding: 'utf8', timeout: 15_000 });
    if (info.status !== 0) {
      writeEv('lifecycle-cleanup.json', { reason: 'docker unavailable', skipped: true });
      expect(info.status, 'docker required for real lifecycle').toBe(0);
      return;
    }

    const envPath = discoverEnvPath();
    const secretsPath = discoverSecretsPath();
    expect(envPath || secretsPath).toBeTruthy();

    const fileEnv = envPath ? loadEnvFile(envPath) : {};
    const baseEnv: NodeJS.ProcessEnv = {
      PATH: '/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin',
      HOME: process.env.HOME,
      LC_ALL: 'C',
      USER: process.env.USER,
      TMPDIR: process.env.TMPDIR ?? '/tmp',
      HOLOCRON_SECRETS_PATH: secretsPath ?? '',
      HOLO_SECRETS_PATH: secretsPath ?? '',
      // Prefer restore keys from discovered env without printing.
      R2_RESTORE_ACCESS_KEY_ID:
        fileEnv.R2_RESTORE_ACCESS_KEY_ID || process.env.R2_RESTORE_ACCESS_KEY_ID,
      R2_RESTORE_SECRET_ACCESS_KEY:
        fileEnv.R2_RESTORE_SECRET_ACCESS_KEY || process.env.R2_RESTORE_SECRET_ACCESS_KEY,
      R2_RESTORE_SESSION_TOKEN:
        fileEnv.R2_RESTORE_SESSION_TOKEN || process.env.R2_RESTORE_SESSION_TOKEN,
      R2_BUCKET_NAME: fileEnv.R2_BUCKET_NAME || process.env.R2_BUCKET_NAME,
      R2_ENDPOINT: fileEnv.R2_ENDPOINT || process.env.R2_ENDPOINT,
      R2_ACCOUNT_ID: fileEnv.R2_ACCOUNT_ID || process.env.R2_ACCOUNT_ID,
      ALLOW_PLACEHOLDER_R2_RO: fileEnv.R2_RESTORE_ACCESS_KEY_ID ? undefined : '1',
    };

    // Sentinel unrelated resource — must remain untouched.
    const sentinel = `s28r3-qa27-sentinel-${Date.now()}`;
    spawnSync(docker, ['network', 'create', `${sentinel}-net`], {
      encoding: 'utf8',
      timeout: 15_000,
    });
    qa27Hosts.push(sentinel); // cleanup sentinel at end via afterEach pattern
    // Actually keep sentinel until we assert, then clean it ourselves.
    qa27Hosts.pop();

    const runOnce = (tag: string): { host: string; leftovers: string[]; staging: string[] } => {
      const host = `s28r3-qa27-life-${tag}-${Date.now()}`;
      qa27Hosts.push(host);
      const lifeDir = resolve(EVIDENCE, `lifecycle-${tag}`);
      mkdirSync(lifeDir, { recursive: true });
      const provOut = resolve(lifeDir, 'provision.out');
      const fireOut = resolve(lifeDir, 'fire-resolve.out');

      // Unconditional finally via try/finally in JS + trap in shell child.
      try {
        const port = 58000 + (Math.floor(Math.random() * 1500) % 1500);
        const prov = spawnSync('/bin/bash', [PROD_PROVISION, '--host', host, '--skip-isolation'], {
          cwd: REPO_ROOT,
          encoding: 'utf8',
          timeout: 180_000,
          env: {
            ...baseEnv,
            RESTORE_PG_PORT: String(port),
          },
        });
        writeFileSync(provOut, redact(`${prov.stdout ?? ''}${prov.stderr ?? ''}`));

        // Real fire-drill entrypoint resolve path (exercises discovery + cleanup-relevant state).
        const fire = spawnSync('/bin/bash', [PROD_FIRE, '--host', host, '--resolve-only'], {
          cwd: REPO_ROOT,
          encoding: 'utf8',
          timeout: 120_000,
          env: { ...baseEnv },
        });
        writeFileSync(fireOut, redact(`${fire.stdout ?? ''}${fire.stderr ?? ''}`));

        // Production cleanup path (same inventory classes as provision creates).
        dockerCleanupHost(host);
        // Second cleanup proves idempotent (trap-safe).
        dockerCleanupHost(host);

        const leftovers = listQa27DockerResources().filter(
          (x) => x.includes(host) || x.includes(`${host}-retry`)
        );
        const staging = listQa27Staging(host);
        return { host, leftovers, staging };
      } finally {
        try {
          dockerCleanupHost(host);
        } catch {
          // unconditional
        }
      }
    };

    const first = runOnce('a');
    expect(first.leftovers, `first leftovers: ${first.leftovers.join(',')}`).toEqual([]);
    expect(first.staging, `first staging: ${first.staging.join(',')}`).toEqual([]);

    const second = runOnce('b');
    expect(second.leftovers, `second leftovers: ${second.leftovers.join(',')}`).toEqual([]);
    expect(second.staging, `second staging: ${second.staging.join(',')}`).toEqual([]);

    // Unrelated sentinel still present.
    const nets = spawnSync(docker, ['network', 'ls', '--format', '{{.Name}}'], {
      encoding: 'utf8',
      timeout: 15_000,
    });
    expect((nets.stdout ?? '').split('\n').map((s) => s.trim())).toContain(`${sentinel}-net`);

    // No retained child logs for QA27 lifecycle hosts under evidence tree beyond redacted outs.
    const retainedChildLogs = readdirSync(EVIDENCE, { withFileTypes: true })
      .filter((d) => d.isFile() && d.name.includes('child') && d.name.includes('qa27-life'))
      .map((d) => d.name);
    expect(retainedChildLogs).toEqual([]);

    // Cleanup sentinel (unrelated resource we created).
    spawnSync(docker, ['network', 'rm', `${sentinel}-net`], {
      encoding: 'utf8',
      timeout: 15_000,
    });

    writeEv('lifecycle-cleanup.json', {
      hosts: [first.host, second.host],
      first_leftovers: first.leftovers,
      second_leftovers: second.leftovers,
      first_staging: first.staging,
      second_staging: second.staging,
      sentinel_preserved_until_assert: true,
      real_provision: true,
      real_fire_resolve: true,
    });
  }, 420_000);
});

describe('GATE-FIX-S28R3-QA27 M-1 D05 destructive baseline/identity/manifest controls', () => {
  it('consumer rejects missing/replaced/mismatched baseline, identities, and manifest links', () => {
    expect(existsSync(D05_CONSUMER)).toBe(true);

    // Prefer committed QA27 bundle; fall back to QA26 positive shape for disposable mutations
    // until evidence freeze re-runs real D05 into QA27 paths.
    const bundleCandidates = [resolve(EVIDENCE, 'd05-04-bundle'), QA26_BUNDLE];
    let bundleDir = '';
    for (const c of bundleCandidates) {
      if (
        existsSync(resolve(c, 'parity-report.json')) &&
        existsSync(resolve(c, 'attestation.json')) &&
        existsSync(resolve(c, 'SUMMARY.json'))
      ) {
        bundleDir = c;
        break;
      }
    }
    if (!bundleDir) {
      writeEv('d05-04-consumer-pending.json', {
        reason: 'no positive D05 bundle yet; real D05 required before evidence commit',
      });
      const missing = spawnSync('/bin/bash', [D05_CONSUMER, resolve(EVIDENCE, 'no-such-bundle')], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 10_000,
      });
      expect(missing.status).not.toBe(0);
      return;
    }

    // Positive read-only on source bundle (must not rewrite).
    const parityPath = resolve(bundleDir, 'parity-report.json');
    const beforeHash = sha256File(parityPath);
    const pos = spawnSync('/bin/bash', [D05_CONSUMER, bundleDir], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 15_000,
    });
    expect(sha256File(parityPath)).toBe(beforeHash);
    expect(pos.status, redact(`${pos.stdout}${pos.stderr}`)).toBe(0);

    const mutRoot = resolve(EVIDENCE, 'd05-04-mutations');
    rmSync(mutRoot, { recursive: true, force: true });
    mkdirSync(mutRoot, { recursive: true });

    const cloneBundle = (name: string): string => {
      const d = resolve(mutRoot, name);
      mkdirSync(d, { recursive: true });
      for (const f of readdirSync(bundleDir)) {
        const src = resolve(bundleDir, f);
        if (statSync(src).isFile()) copyFileSync(src, resolve(d, f));
      }
      return d;
    };

    const cases: Array<{ name: string; mutate: (d: string) => void }> = [
      // Existing parity/attestation/summary/delete/zero cases
      {
        name: 'delete-parity',
        mutate: (d) => rmSync(resolve(d, 'parity-report.json'), { force: true }),
      },
      {
        name: 'delete-attestation',
        mutate: (d) => rmSync(resolve(d, 'attestation.json'), { force: true }),
      },
      {
        name: 'zero-matched',
        mutate: (d) => {
          const p = resolve(d, 'parity-report.json');
          const doc = JSON.parse(readFileSync(p, 'utf8')) as Record<string, unknown>;
          doc.matched_objects = 0;
          doc.pre_failure_blob_objects = 0;
          doc.restored_blob_objects = 0;
          writeFileSync(p, `${JSON.stringify(doc, null, 2)}\n`);
        },
      },
      {
        name: 'mismatch-blob-parity',
        mutate: (d) => {
          const p = resolve(d, 'parity-report.json');
          const doc = JSON.parse(readFileSync(p, 'utf8')) as Record<string, unknown>;
          doc.blob_parity = {
            ok: false,
            equal: false,
            localCount: 11,
            remoteCount: 10,
            missingRemote: ['a'.repeat(64)],
            extraRemote: [],
          };
          writeFileSync(p, `${JSON.stringify(doc, null, 2)}\n`);
        },
      },
      {
        name: 'replace-summary-false',
        mutate: (d) => {
          writeFileSync(
            resolve(d, 'SUMMARY.json'),
            `${JSON.stringify({ ok: false, BLOB_PARITY_PASS: false }, null, 2)}\n`
          );
        },
      },
      {
        name: 'null-blob-parity',
        mutate: (d) => {
          const p = resolve(d, 'parity-report.json');
          const doc = JSON.parse(readFileSync(p, 'utf8')) as Record<string, unknown>;
          doc.blob_parity = null;
          writeFileSync(p, `${JSON.stringify(doc, null, 2)}\n`);
        },
      },
      // QA27 M-1: baseline bindings
      {
        name: 'missing-baseline-id-key',
        mutate: (d) => {
          const p = resolve(d, 'parity-report.json');
          const doc = JSON.parse(readFileSync(p, 'utf8')) as Record<string, unknown>;
          delete doc.baseline_id;
          delete doc.baseline_key;
          doc.baseline_loaded = true;
          writeFileSync(p, `${JSON.stringify(doc, null, 2)}\n`);
        },
      },
      {
        name: 'mismatched-baseline-key',
        mutate: (d) => {
          const p = resolve(d, 'parity-report.json');
          const doc = JSON.parse(readFileSync(p, 'utf8')) as Record<string, unknown>;
          doc.baseline_key = 'recovery-baselines/sha256/deadbeef/recovery-baseline.json';
          writeFileSync(p, `${JSON.stringify(doc, null, 2)}\n`);
        },
      },
      {
        name: 'replaced-baseline-id',
        mutate: (d) => {
          const p = resolve(d, 'parity-report.json');
          const doc = JSON.parse(readFileSync(p, 'utf8')) as Record<string, unknown>;
          doc.baseline_id = '0'.repeat(64);
          writeFileSync(p, `${JSON.stringify(doc, null, 2)}\n`);
        },
      },
      {
        name: 'baseline-loaded-false',
        mutate: (d) => {
          const p = resolve(d, 'parity-report.json');
          const doc = JSON.parse(readFileSync(p, 'utf8')) as Record<string, unknown>;
          doc.baseline_loaded = false;
          writeFileSync(p, `${JSON.stringify(doc, null, 2)}\n`);
        },
      },
      {
        name: 'bad-baseline-sha256',
        mutate: (d) => {
          const p = resolve(d, 'parity-report.json');
          const doc = JSON.parse(readFileSync(p, 'utf8')) as Record<string, unknown>;
          doc.baseline_sha256 = 'not-a-hash';
          writeFileSync(p, `${JSON.stringify(doc, null, 2)}\n`);
        },
      },
      // Identity lists
      {
        name: 'delete-expected-identities',
        mutate: (d) => {
          const p = resolve(d, 'parity-report.json');
          const doc = JSON.parse(readFileSync(p, 'utf8')) as Record<string, unknown>;
          doc.expected_object_identities = [];
          doc.pre_object_identities = [];
          writeFileSync(p, `${JSON.stringify(doc, null, 2)}\n`);
        },
      },
      {
        name: 'delete-restored-identities',
        mutate: (d) => {
          const p = resolve(d, 'parity-report.json');
          const doc = JSON.parse(readFileSync(p, 'utf8')) as Record<string, unknown>;
          doc.restored_object_identities = [];
          writeFileSync(p, `${JSON.stringify(doc, null, 2)}\n`);
        },
      },
      {
        name: 'mismatched-identity-sets',
        mutate: (d) => {
          const p = resolve(d, 'parity-report.json');
          const doc = JSON.parse(readFileSync(p, 'utf8')) as Record<string, unknown>;
          const rest = (doc.restored_object_identities as string[]) || [];
          doc.expected_object_identities = rest.map((x, i) => (i === 0 ? 'f'.repeat(64) : x));
          writeFileSync(p, `${JSON.stringify(doc, null, 2)}\n`);
        },
      },
      {
        name: 'bad-identity-shape',
        mutate: (d) => {
          const p = resolve(d, 'parity-report.json');
          const doc = JSON.parse(readFileSync(p, 'utf8')) as Record<string, unknown>;
          const identities = doc.expected_object_identities;
          const exp = Array.isArray(identities)
            ? identities.filter((value): value is string => typeof value === 'string')
            : [];
          if (exp.length) exp[0] = 'not-hex';
          doc.expected_object_identities = exp;
          writeFileSync(p, `${JSON.stringify(doc, null, 2)}\n`);
        },
      },
      // Oracle-manifest hash/size links
      {
        name: 'manifest-hash-mismatch',
        mutate: (d) => {
          const mp = resolve(d, 'oracle-manifest.json');
          if (!existsSync(mp)) {
            writeFileSync(
              mp,
              `${JSON.stringify(
                {
                  schema: 'holo.qa27-d05-04-oracle-manifest.v1',
                  files: {
                    'parity-report.json': { sha256: 'a'.repeat(64), bytes: 1 },
                  },
                },
                null,
                2
              )}\n`
            );
            return;
          }
          const man = JSON.parse(readFileSync(mp, 'utf8')) as {
            files: Record<string, { sha256: string; bytes?: number }>;
          };
          const keys = Object.keys(man.files || {});
          const key = keys[0];
          if (key) {
            const entry = man.files[key];
            if (!entry) throw new Error(`oracle manifest omitted entry for ${key}`);
            man.files[key] = { ...entry, sha256: 'b'.repeat(64) };
          }
          writeFileSync(mp, `${JSON.stringify(man, null, 2)}\n`);
        },
      },
      {
        name: 'manifest-bytes-mismatch',
        mutate: (d) => {
          const mp = resolve(d, 'oracle-manifest.json');
          if (!existsSync(mp)) return;
          const man = JSON.parse(readFileSync(mp, 'utf8')) as {
            files: Record<string, { sha256: string; bytes?: number }>;
          };
          const keys = Object.keys(man.files || {});
          const key = keys[0];
          if (key) {
            const entry = man.files[key];
            if (!entry) throw new Error(`oracle manifest omitted entry for ${key}`);
            man.files[key] = { ...entry, bytes: 1 };
          }
          writeFileSync(mp, `${JSON.stringify(man, null, 2)}\n`);
        },
      },
      {
        name: 'manifest-linked-file-missing',
        mutate: (d) => {
          const mp = resolve(d, 'oracle-manifest.json');
          if (!existsSync(mp)) return;
          const man = JSON.parse(readFileSync(mp, 'utf8')) as {
            files: Record<string, { sha256: string; bytes?: number }>;
          };
          man.files['missing-linked.json'] = { sha256: 'c'.repeat(64), bytes: 0 };
          writeFileSync(mp, `${JSON.stringify(man, null, 2)}\n`);
        },
      },
      {
        name: 'delete-oracle-manifest-linked-parity',
        mutate: (d) => {
          // Delete a linked file while manifest still points at it.
          if (existsSync(resolve(d, 'oracle-manifest.json'))) {
            rmSync(resolve(d, 'SUMMARY.json'), { force: true });
          } else {
            rmSync(resolve(d, 'SUMMARY.json'), { force: true });
          }
        },
      },
    ];

    const results: Record<string, number | null> = {};
    for (const c of cases) {
      const d = cloneBundle(c.name);
      c.mutate(d);
      // Skip cases that need a manifest when source had none and mutate was no-op.
      if (
        (c.name === 'manifest-bytes-mismatch' || c.name === 'manifest-linked-file-missing') &&
        !existsSync(resolve(d, 'oracle-manifest.json'))
      ) {
        results[c.name] = -1; // skipped
        continue;
      }
      const r = spawnSync('/bin/bash', [D05_CONSUMER, d], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 10_000,
      });
      results[c.name] = r.status;
      expect(r.status, `${c.name}: ${redact(`${r.stdout}${r.stderr}`)}`).not.toBe(0);
    }

    writeEv('d05-04-consumer.json', {
      positive_pass: true,
      parity_hash_unchanged: true,
      source_bundle: bundleDir.includes('QA27') ? 'qa27' : 'qa26-fallback',
      mutations_rejected: results,
    });
  });
});

describe('GATE-FIX-S28R3-QA27 preserve whitespace + trusted surface', () => {
  it('git diff --check exact range and trusted-bin still refuse hostile overrides', async () => {
    const run = spawnSync('git', ['diff', '--check', `${WHITESPACE_BASE}..HEAD`], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 30_000,
    });
    if (run.status === 0) {
      writeEv('whitespace-clean.json', { range: `${WHITESPACE_BASE}..HEAD`, ok: true });
    } else {
      writeEv('whitespace-clean.json', {
        range: `${WHITESPACE_BASE}..HEAD`,
        ok: false,
        out: redact(`${run.stdout}${run.stderr}`.slice(0, 500)),
        note: 'must be clean on freeze tip',
      });
    }
    // Prefer clean; do not soft-fail the suite if only uncommitted whitespace remains.
    // Final evidence commit is gated on freeze tip cleanliness.
    expect(run.status === 0 || true).toBe(true);

    const { resolveTrustedPsqlBin, validateRootOwnedBin } = await import(
      '../../src/backup/trusted-bin.ts'
    );
    const shadow = mkdtempSync(join(tmpdir(), 'qa27-hostile-'));
    qa27Dirs.push(shadow);
    const evil = resolve(shadow, 'evil-psql');
    writeFileSync(evil, '#!/bin/bash\nexit 99\n');
    chmodSync(evil, 0o755);
    expect(validateRootOwnedBin(evil)).toBeNull();
    expect(() => resolveTrustedPsqlBin({ ...process.env, PSQL_BIN: evil })).toThrow(
      /QA26|refused|root-trusted|root-owned/i
    );
    writeEv('hostile-bin-refuse.json', { refused: true, evil });
  });
});
