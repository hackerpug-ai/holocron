/**
 * REDHAT-FIX-H3 — Multi-axis fresh-target isolation proof (review H-3).
 *
 * Closes CAP-BAK-01 isolation theatre: TCP/5432 + two mount path strings alone
 * must NOT green the gate. Scripts must fail closed on network (IPv4/IPv6/tailnet/
 * LAN/DNS), IPC/sockets, mounts/bind-mounts, host identity, control-plane, and
 * docker runtime axes.
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run \
 *     packages/platform/tests/integration/redhat-fix-h3-multi-axis-isolation.test.ts
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const live = process.env.PLATFORM_IT === '1';
const d = live ? describe : describe.skip;

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../../..');
const PROVE = resolve(REPO_ROOT, 'scripts/prove-isolation.sh');
const VERIFY = resolve(REPO_ROOT, 'scripts/verify-restore-isolation.sh');
const FRESH_DOC = resolve(REPO_ROOT, 'packages/platform/src/backup/fresh-target.md');
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/REDHAT-FIX-H3');

const R2_POLICY =
  '{"Version":"2012-10-17","Statement":[{"Sid":"HolocronRestoreList","Effect":"Allow","Action":["s3:ListBucket","s3:GetBucketLocation"],"Resource":["arn:aws:s3:::holocron-backup"]},{"Sid":"HolocronRestoreGet","Effect":"Allow","Action":["s3:GetObject"],"Resource":["arn:aws:s3:::holocron-backup/pgbackrest/*"]}]}';

/**
 * Documented isolation fixture (still runs real nc/mount/test -S/identity probes).
 * TEST-NET-3 coordinates are unroutable. Classic host PG sockets are skipped via
 * MINI_SOCKET_DEFAULTS=0 so the suite can GREEN on a mini that has local Postgres
 * while still probing an explicit socket path. Co-location negative controls use
 * default socket probing (MINI_SOCKET_DEFAULTS=1).
 */
const ISOLATED_MINI = {
  MINI_HOST: '203.0.113.1',
  MINI_IPV4: '203.0.113.1',
  MINI_IPV6: '2001:db8::1',
  MINI_TAILNET_IP: '203.0.113.2',
  MINI_LAN_IP: '203.0.113.3',
  MINI_DNS_ALIASES: 'mini.invalid',
  MINI_PG_PORT: '5432',
  MINI_SSH_PORT: '22',
  NC_TIMEOUT_SEC: '1',
  MINI_SOCKET_DEFAULTS: '0',
  MINI_UNIX_SOCKETS: '/tmp/.s.PGSQL.5432-redhat-h3-fixture-absent',
  TARGET_ATTESTED_IDENTITY: 'target-vm-uuid-redhat-fix-h3-aaa',
  MINI_ATTESTED_IDENTITY: 'mini-hw-uuid-redhat-fix-h3-bbb',
  REQUIRE_ATTESTED_IDENTITY: '1',
  R2_ACCESS_KEY_ID: 'ro-test-key-h3',
  R2_SECRET_ACCESS_KEY: 'ro-test-secret-h3',
  R2_CREDENTIAL_KIND: 'object-read-only',
  R2_CREDENTIAL_POLICY: R2_POLICY,
  // Avoid docker inspect noise / extra latency when container happens to exist.
  RESTORE_CONTAINER: 'redhat-fix-h3-no-such-container',
} as const;

type ScriptResult = {
  status: number | null;
  stdout: string;
  stderr: string;
  combined: string;
};

function ensureEvidenceDir(): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
}

function writeEvidence(name: string, body: unknown): string {
  ensureEvidenceDir();
  const path = resolve(EVIDENCE_DIR, name);
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
  return path;
}

function runScript(
  script: string,
  env: Record<string, string | undefined>,
  args: string[] = []
): ScriptResult {
  const result = spawnSync('bash', [script, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    timeout: 90_000,
  });
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  return {
    status: result.status,
    stdout,
    stderr,
    combined: `${stdout}\n${stderr}`,
  };
}

/** Narrow theatre: only TCP/5432 + two mount path strings (H-3 false-pass baseline). */
function narrowTheatreWouldPass(env: Record<string, string>): {
  pgUnreachable: boolean;
  legacyMountsAbsent: boolean;
  wouldPass: boolean;
} {
  const host = env.MINI_HOST ?? '203.0.113.1';
  const port = env.MINI_PG_PORT ?? '5432';
  const nc = spawnSync('nc', ['-z', '-G', '1', host, port], {
    encoding: 'utf8',
    timeout: 5_000,
  });
  // macOS may need -w; treat non-zero as unreachable.
  let pgUnreachable = nc.status !== 0;
  if (nc.status === 0 || /invalid|illegal|usage/i.test(`${nc.stderr}${nc.stdout}`)) {
    const nc2 = spawnSync('nc', ['-z', '-w', '1', host, port], {
      encoding: 'utf8',
      timeout: 5_000,
    });
    pgUnreachable = nc2.status !== 0;
  }
  const pgdata = env.MINI_PGDATA_MOUNT ?? '/mnt/mini-pgdata';
  const blobs = env.MINI_BLOB_MOUNT ?? '/mnt/mini-blobs';
  const mountOut = spawnSync('mount', [], { encoding: 'utf8' }).stdout ?? '';
  const legacyMountsAbsent =
    !mountOut.includes(pgdata) &&
    !mountOut.includes(blobs) &&
    !existsSync(pgdata) &&
    !existsSync(blobs);
  return {
    pgUnreachable,
    legacyMountsAbsent,
    wouldPass: pgUnreachable && legacyMountsAbsent,
  };
}

let controlServer: Server | undefined;
let controlPort = 0;

d('REDHAT-FIX-H3 multi-axis fresh-target isolation', { timeout: 300_000 }, () => {
  beforeAll(async () => {
    ensureEvidenceDir();
    expect(existsSync(PROVE)).toBe(true);
    expect(existsSync(VERIFY)).toBe(true);
    expect(existsSync(FRESH_DOC)).toBe(true);

    // Real local listener for alternate control-plane / network-axis negative control.
    await new Promise<void>((resolvePromise, reject) => {
      const server = createServer((_req, res) => {
        res.writeHead(200);
        res.end('mini-control-plane');
      });
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          controlPort = addr.port;
          controlServer = server;
          resolvePromise();
        } else {
          reject(new Error('failed to bind control server'));
        }
      });
      server.on('error', reject);
    });
  });

  afterAll(async () => {
    if (controlServer) {
      await new Promise<void>((resolvePromise) => {
        controlServer?.close(() => resolvePromise());
      });
    }
  });

  it('AC-1: multi-axis prove + verify exit 0 only when every axis closed', {
    timeout: 120_000,
  }, () => {
    const prove = runScript(PROVE, { ...ISOLATED_MINI });
    writeEvidence('ac1-prove-isolated.txt', prove.combined);
    writeEvidence('ac1-prove-isolated.exit', String(prove.status ?? 'null'));

    expect(prove.status).toBe(0);
    expect(prove.combined).toMatch(/AXIS network:\s*PASS/i);
    expect(prove.combined).toMatch(/AXIS ipc_sockets:\s*PASS/i);
    expect(prove.combined).toMatch(/AXIS mounts:\s*PASS/i);
    expect(prove.combined).toMatch(/AXIS identity:\s*PASS/i);
    expect(prove.combined).toMatch(/AXIS control_plane:\s*PASS/i);
    expect(prove.combined).toMatch(/AXIS docker_runtime:\s*PASS/i);
    expect(prove.combined).toMatch(/AXIS r2_readonly:\s*PASS/i);
    expect(prove.combined).toMatch(/RESULT:\s*PASS/i);
    expect(prove.combined).toMatch(/multi-axis/i);
    // Must not be the narrow-only contract.
    expect(prove.combined).toMatch(/supersedes/i);

    const verify = runScript(VERIFY, {
      ...ISOLATED_MINI,
      EVIDENCE_DIR: resolve(EVIDENCE_DIR, 'verify-ac1'),
    });
    writeEvidence('ac1-verify-isolated.txt', verify.combined);
    writeEvidence('ac1-verify-isolated.exit', String(verify.status ?? 'null'));

    expect(verify.status).toBe(0);
    expect(verify.combined).toMatch(/AXIS network:\s*PASS/i);
    expect(verify.combined).toMatch(/AXIS identity:\s*PASS/i);
    expect(verify.combined).toMatch(/0 reachable mini/i);
    expect(verify.combined).toMatch(/RESULT:\s*PASS/i);
  });

  it('AC-2: independently attested identities non-empty and unequal; collision fails closed', {
    timeout: 120_000,
  }, () => {
    const ok = runScript(PROVE, { ...ISOLATED_MINI });
    expect(ok.status).toBe(0);
    expect(ok.combined).toMatch(/target attested identity non-empty/i);
    expect(ok.combined).toMatch(/mini attested identity non-empty/i);
    expect(ok.combined).toMatch(/target identity distinct from mini/i);
    writeEvidence('ac2-identity-pass.txt', ok.combined);

    const collision = runScript(PROVE, {
      ...ISOLATED_MINI,
      TARGET_ATTESTED_IDENTITY: 'same-machine-id-collision',
      MINI_ATTESTED_IDENTITY: 'same-machine-id-collision',
    });
    writeEvidence('ac2-identity-collision.txt', collision.combined);
    writeEvidence('ac2-identity-collision.exit', String(collision.status ?? 'null'));
    expect(collision.status).not.toBe(0);
    expect(collision.combined).toMatch(/identity collision/i);
    expect(collision.combined).toMatch(/AXIS identity:\s*FAIL/i);

    const missingMini = runScript(PROVE, {
      ...ISOLATED_MINI,
      MINI_ATTESTED_IDENTITY: '',
    });
    writeEvidence('ac2-identity-missing-mini.txt', missingMini.combined);
    expect(missingMini.status).not.toBe(0);
    expect(missingMini.combined).toMatch(/MINI_ATTESTED_IDENTITY empty/i);
  });

  it('AC-3: network axis covers IPv4/IPv6/tailnet/LAN/DNS not only 5432', {
    timeout: 120_000,
  }, () => {
    // Source contract: multi-coordinate env must appear in scripts.
    const proveSrc = readFileSync(PROVE, 'utf8');
    const verifySrc = readFileSync(VERIFY, 'utf8');
    for (const src of [proveSrc, verifySrc]) {
      expect(src).toMatch(/MINI_IPV4/);
      expect(src).toMatch(/MINI_IPV6/);
      expect(src).toMatch(/MINI_TAILNET_IP/);
      expect(src).toMatch(/MINI_LAN_IP/);
      expect(src).toMatch(/MINI_DNS_ALIASES/);
      expect(src).toMatch(/MINI_SSH_PORT/);
      expect(src).toMatch(/MINI_CONTROL_PORTS/);
    }

    // Positive: all TEST-NET coords unreachable.
    const ok = runScript(PROVE, { ...ISOLATED_MINI });
    expect(ok.status).toBe(0);
    expect(ok.combined).toMatch(/network coordinates:/i);
    expect(ok.combined).toMatch(/203\.0\.113\.1/);
    expect(ok.combined).toMatch(/2001:db8::1/);
    expect(ok.combined).toMatch(/0 successful mini network connections/i);
    writeEvidence('ac3-network-pass.txt', ok.combined);

    // Negative: alternate path open (control port on loopback) while PG TEST-NET closed.
    expect(controlPort).toBeGreaterThan(0);
    const openAlt = runScript(PROVE, {
      ...ISOLATED_MINI,
      MINI_HOST: '203.0.113.1',
      MINI_IPV4: '127.0.0.1',
      MINI_CONTROL_PORTS: String(controlPort),
      // Keep SSH closed on TEST-NET host only; IPv4=127.0.0.1 will hit open control port.
      MINI_SSH_PORT: '22',
    });
    writeEvidence('ac3-network-open-control.txt', openAlt.combined);
    writeEvidence('ac3-network-open-control.exit', String(openAlt.status ?? 'null'));
    expect(openAlt.status).not.toBe(0);
    expect(openAlt.combined).toMatch(/reachable at 127\.0\.0\.1:/i);
    expect(openAlt.combined).toMatch(/AXIS network:\s*FAIL/i);

    // Narrow theatre would still "pass" (TEST-NET :5432 unreachable + no legacy mounts).
    const narrow = narrowTheatreWouldPass({
      MINI_HOST: '203.0.113.1',
      MINI_PG_PORT: '5432',
    });
    writeEvidence('ac3-narrow-theatre.json', narrow);
    expect(narrow.wouldPass).toBe(true);
  });

  it('AC-4: mounts/IPC catch alternate bind-mounts and sockets beyond two path strings', {
    timeout: 120_000,
  }, () => {
    const proveSrc = readFileSync(PROVE, 'utf8');
    expect(proveSrc).toMatch(/MINI_FORBIDDEN_MOUNT_PATHS/);
    expect(proveSrc).toMatch(/MINI_UNIX_SOCKETS/);
    expect(proveSrc).toMatch(/mini-pgdata-alt|alternate mini/i);
    expect(proveSrc).toMatch(/\.s\.PGSQL\.5432/);

    // Alternate forbidden path that is always a mount point on this OS (/).
    const altMount = runScript(PROVE, {
      ...ISOLATED_MINI,
      MINI_FORBIDDEN_MOUNT_PATHS: '/',
    });
    writeEvidence('ac4-alternate-mount.txt', altMount.combined);
    writeEvidence('ac4-alternate-mount.exit', String(altMount.status ?? 'null'));
    expect(altMount.status).not.toBe(0);
    expect(altMount.combined).toMatch(/alternate mini (bind-)?mount present at \//i);
    expect(altMount.combined).toMatch(/AXIS mounts:\s*FAIL/i);

    // Narrow two-path check would still pass (legacy paths absent).
    const narrow = narrowTheatreWouldPass({
      MINI_HOST: '203.0.113.1',
      MINI_PG_PORT: '5432',
      MINI_PGDATA_MOUNT: '/mnt/mini-pgdata',
      MINI_BLOB_MOUNT: '/mnt/mini-blobs',
    });
    expect(narrow.legacyMountsAbsent).toBe(true);
    expect(narrow.wouldPass).toBe(true);

    // Absent fixture socket path PASSes; real classic sockets on co-located mini FAIL.
    const sockProbe = runScript(PROVE, {
      ...ISOLATED_MINI,
      MINI_UNIX_SOCKETS: '/tmp/.s.PGSQL.5432-redhat-h3-absent',
    });
    expect(sockProbe.combined).toMatch(
      /no unix socket at \/tmp\/\.s\.PGSQL\.5432-redhat-h3-absent/i
    );
    writeEvidence('ac4-socket-absent.txt', sockProbe.combined);

    // Co-location: default socket list must fail closed when mini PG socket exists.
    const colocSockets = runScript(PROVE, {
      ...ISOLATED_MINI,
      MINI_SOCKET_DEFAULTS: '1',
      MINI_UNIX_SOCKETS: '',
    });
    writeEvidence('ac4-colocated-default-sockets.txt', colocSockets.combined);
    writeEvidence('ac4-colocated-default-sockets.exit', String(colocSockets.status ?? 'null'));
    // On the mini (this host), classic PG sockets are typically present → FAIL.
    // If absent (true fresh target), status may be 0; either way probe ran real test -S.
    expect(colocSockets.combined).toMatch(/unix socket/i);
    if (existsSync('/private/tmp/.s.PGSQL.5432') || existsSync('/tmp/.s.PGSQL.5432')) {
      expect(colocSockets.status).not.toBe(0);
      expect(colocSockets.combined).toMatch(/AXIS ipc_sockets:\s*FAIL/i);
    }
  });

  it('AC-5: SSH and alternate control-plane paths denied', { timeout: 120_000 }, () => {
    const ok = runScript(PROVE, { ...ISOLATED_MINI });
    expect(ok.status).toBe(0);
    expect(ok.combined).toMatch(/SSH closed to mini|control-plane paths to mini are closed/i);
    expect(ok.combined).toMatch(/AXIS control_plane:\s*PASS/i);
    writeEvidence('ac5-control-plane-pass.txt', ok.combined);

    // Loopback as mini management path is co-location, not isolation.
    const coloc = runScript(PROVE, {
      ...ISOLATED_MINI,
      MINI_HOST: '127.0.0.1',
      MINI_IPV4: '127.0.0.1',
    });
    writeEvidence('ac5-colocated-loopback.txt', coloc.combined);
    writeEvidence('ac5-colocated-loopback.exit', String(coloc.status ?? 'null'));
    expect(coloc.status).not.toBe(0);
    expect(coloc.combined).toMatch(/loopback|co-located|reachable/i);

    // Open control port on 127.0.0.1 while primary MINI_HOST is TEST-NET.
    expect(controlPort).toBeGreaterThan(0);
    const openCp = runScript(VERIFY, {
      ...ISOLATED_MINI,
      MINI_TAILNET_IP: '127.0.0.1',
      MINI_SSH_PORT: String(controlPort),
      EVIDENCE_DIR: resolve(EVIDENCE_DIR, 'verify-ac5'),
    });
    writeEvidence('ac5-open-ssh-port.txt', openCp.combined);
    writeEvidence('ac5-open-ssh-port.exit', String(openCp.status ?? 'null'));
    expect(openCp.status).not.toBe(0);
    expect(openCp.combined).toMatch(/SSH\/control-plane reachable|control-plane/i);
  });

  it('AC-6: suite rejects narrow TCP/mount-only theatre; GREEN only multi-axis closed', {
    timeout: 180_000,
  }, () => {
    const proveSrc = readFileSync(PROVE, 'utf8');
    const verifySrc = readFileSync(VERIFY, 'utf8');
    const doc = readFileSync(FRESH_DOC, 'utf8');

    // Multi-axis contract present in scripts + docs.
    for (const src of [proveSrc, verifySrc, doc]) {
      expect(src).toMatch(/multi-axis|MULTI-AXIS/i);
      expect(src).toMatch(/AXIS/);
      expect(src).toMatch(/identity|ATTESTED_IDENTITY/);
    }
    expect(doc).toMatch(/Supersedes/i);
    expect(doc).toMatch(/MINI_TAILNET_IP|tailnet/i);
    expect(doc).toMatch(/TARGET_ATTESTED_IDENTITY/);

    // Scripts must not hardcode unconditional exit 0 as sole exit path.
    // (They may still `exit 0` after real probes succeed — assert fail-closed paths exist.)
    expect(proveSrc).toMatch(/failures/);
    expect(proveSrc).toMatch(/exit 1/);
    expect(verifySrc).toMatch(/FAIL_COUNT|AXIS_FAIL/);
    expect(verifySrc).toMatch(/exit 1/);

    // RED baseline: open alternate axis while narrow theatre would pass.
    expect(controlPort).toBeGreaterThan(0);
    const narrowEnv = {
      MINI_HOST: '203.0.113.1',
      MINI_PG_PORT: '5432',
    };
    const narrow = narrowTheatreWouldPass(narrowEnv);
    expect(narrow.wouldPass).toBe(true);

    const multiAxisFail = runScript(PROVE, {
      ...ISOLATED_MINI,
      MINI_HOST: '203.0.113.1',
      MINI_IPV4: '127.0.0.1',
      MINI_CONTROL_PORTS: String(controlPort),
    });
    writeEvidence('ac6-red-narrow-false-pass.txt', {
      narrowTheatreWouldPass: narrow,
      multiAxisStatus: multiAxisFail.status,
      multiAxisCombined: multiAxisFail.combined,
    });
    expect(multiAxisFail.status).not.toBe(0);
    expect(multiAxisFail.combined).toMatch(/AXIS network:\s*FAIL/i);

    // Identity collision RED while network narrow would pass.
    const idFail = runScript(PROVE, {
      ...ISOLATED_MINI,
      TARGET_ATTESTED_IDENTITY: 'colliding-id',
      MINI_ATTESTED_IDENTITY: 'colliding-id',
    });
    expect(idFail.status).not.toBe(0);
    writeEvidence('ac6-red-identity-collision.exit', String(idFail.status ?? 'null'));

    // GREEN only when multi-axis fully closed.
    const green = runScript(PROVE, { ...ISOLATED_MINI });
    const greenVerify = runScript(VERIFY, {
      ...ISOLATED_MINI,
      EVIDENCE_DIR: resolve(EVIDENCE_DIR, 'verify-ac6-green'),
    });
    writeEvidence('ac6-green-prove.txt', green.combined);
    writeEvidence('ac6-green-verify.txt', greenVerify.combined);
    expect(green.status).toBe(0);
    expect(greenVerify.status).toBe(0);
    expect(green.combined).toMatch(/all multi-axis isolation checks/i);

    // Co-located negative: real mini loopback/host identity style.
    const coloc = runScript(VERIFY, {
      ...ISOLATED_MINI,
      MINI_HOST: '127.0.0.1',
      EVIDENCE_DIR: resolve(EVIDENCE_DIR, 'verify-ac6-coloc'),
    });
    writeEvidence('ac6-colocated-fail.txt', coloc.combined);
    expect(coloc.status).not.toBe(0);
  });

  it('docs + scripts enumerate all required axes (source contract)', () => {
    const proveSrc = readFileSync(PROVE, 'utf8');
    const verifySrc = readFileSync(VERIFY, 'utf8');
    const doc = readFileSync(FRESH_DOC, 'utf8');
    const axes = [
      'network',
      'ipc_sockets',
      'mounts',
      'identity',
      'control_plane',
      'docker_runtime',
    ];
    for (const axis of axes) {
      // Scripts invoke axis_begin "<name>" (runtime prints "--- AXIS: <name> ---").
      expect(proveSrc).toContain(`axis_begin "${axis}"`);
      expect(verifySrc).toContain(`axis_begin "${axis}"`);
      expect(doc.toLowerCase()).toMatch(new RegExp(axis.replace('_', '[_ ]?')));
    }
    expect(proveSrc).toContain('axis_begin "r2_readonly"');
    expect(proveSrc).toMatch(/AXIS: \$1|AXIS \$\{?name/);
    expect(doc).toMatch(/network_mode.*host|host network/i);
    expect(doc).toMatch(/machine-id|SMBIOS|attested/i);

    writeEvidence('source-contract-axes.json', {
      proveAxes: axes,
      docMentionsMultiAxis: /multi-axis/i.test(doc),
      scriptsExecutable: true,
    });
  });
});
