import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  authorContract,
  type ContractTarget,
  HONO_ROUTES,
  LIVE_HONO_ROUTE_KEYS,
  LIVE_ZERO_PUB_TABLES,
  resolveTarget,
  serializeContractYaml,
} from '../../sync/client-data-contract-author';

/**
 * S-CONTRACT-02 — integration tests for `holo client-contract:author`.
 *
 * The live 105-row inventory is exercised by the AC verification commands
 * in the task spec. These tests use a small synthetic inventory to prove
 * the author function maps each call site to a resolvable target, the
 * generated YAML is parseable, and fail-closed diagnostics surface for
 * unknown legacy_refs and unresolved targets.
 */

interface InventoryCallSite {
  call_site_id: string;
  source_path: string;
  line: number;
  column: number;
  hook_kind: 'useQuery' | 'useMutation' | 'useAction';
  legacy_ref: string;
}

function writeInventory(path: string, callSites: InventoryCallSite[]): void {
  writeFileSync(
    path,
    JSON.stringify(
      {
        source_roots: ['app', 'components', 'hooks', 'screens'],
        schema_version: 1,
        counting_rule: 'test',
        summary: { file_count: 1, call_site_count: callSites.length },
        call_sites: callSites,
      },
      null,
      2
    ),
    'utf8'
  );
}

describe('authorContract — counting rule + AC-1/AC-2/AC-3', () => {
  const tmpRoot = join(
    tmpdir(),
    `holo-contract-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  const invPath = join(tmpRoot, 'inv.json');

  /**
   * Test inventory that exercises every offline/conflict case required by
   * AC-4. The real S-CONTRACT-01 inventory (105 rows) covers all cases
   * naturally; this synthetic inventory is sized to do the same so the
   * author's AC-4 enforcement does not reject the small fixture.
   */
  const SEED_SITES: InventoryCallSite[] = [
    // cache_read (airplane-mode read) + last_write_wins
    {
      call_site_id: 'a000000000000001',
      source_path: 'app/chat.tsx',
      line: 1,
      column: 1,
      hook_kind: 'useQuery',
      legacy_ref: 'api.chatMessages.queries.listByConversation',
    },
    // queue_write + versioned_cas (concurrent edit)
    {
      call_site_id: 'a000000000000002',
      source_path: 'app/chat.tsx',
      line: 2,
      column: 1,
      hook_kind: 'useMutation',
      legacy_ref: 'api.conversations.mutations.update',
    },
    // rollback_rejection + request_id_replay (chat duplicate replay)
    {
      call_site_id: 'a000000000000003',
      source_path: 'app/chat.tsx',
      line: 3,
      column: 1,
      hook_kind: 'useAction',
      legacy_ref: 'api.chat.index.send',
    },
    // online_only + idempotency_key (upload duplicate replay)
    {
      call_site_id: 'a000000000000004',
      source_path: 'app/chat.tsx',
      line: 4,
      column: 1,
      hook_kind: 'useMutation',
      legacy_ref: 'api.improvements.mutations.generateUploadUrl',
    },
    // request_key (mission steering replay)
    {
      call_site_id: 'a000000000000005',
      source_path: 'app/chat.tsx',
      line: 5,
      column: 1,
      hook_kind: 'useAction',
      legacy_ref: 'api.audio.actions.regenerateForDocument',
    },
  ];

  beforeAll(() => {
    mkdirSync(tmpRoot, { recursive: true });
    writeInventory(invPath, SEED_SITES);
  });

  afterAll(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('maps every inventory call_site_id exactly once', () => {
    const c = authorContract({ inventoryPath: invPath });
    expect(c.summary.total_entries).toBe(SEED_SITES.length);
    const ids = c.entries.map((e) => e.call_site_id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const seed of SEED_SITES) {
      expect(ids).toContain(seed.call_site_id);
    }
  });

  it('every entry declares all required semantic fields', () => {
    const c = authorContract({ inventoryPath: invPath });
    const required = [
      'target',
      'projection',
      'response_error_shape',
      'ordering_cursor',
      'optimistic',
      'conflict',
      'rejection',
      'offline',
      'identifier',
      'e2e_criterion',
    ] as const;
    for (const e of c.entries) {
      for (const f of required) {
        expect(e).toHaveProperty(f);
      }
    }
  });

  it('every target resolves against live zero_pub or Hono route surface', () => {
    const c = authorContract({ inventoryPath: invPath });
    expect(c.summary.unresolved_target_count).toBe(0);
    for (const e of c.entries) {
      const r = resolveTarget(e.target);
      expect(r.resolved).toBe(true);
    }
  });

  it('covers all five T-SYNC-019 offline/conflict behavior cases', () => {
    const c = authorContract({ inventoryPath: invPath });
    expect(c.summary.offline_behavior_case_count).toBe(5);
    const policies = new Set(c.entries.map((e) => e.offline.policy));
    expect(policies.has('cache_read')).toBe(true);
    expect(policies.has('queue_write')).toBe(true);
    expect(policies.has('online_only')).toBe(true);
    expect(policies.has('rollback_rejection')).toBe(true);
    const conflicts = new Set(c.entries.map((e) => e.conflict.policy));
    // duplicate replay (any of these three) + concurrent edit (versioned_cas)
    expect(
      conflicts.has('request_id_replay') ||
        conflicts.has('idempotency_key') ||
        conflicts.has('request_key')
    ).toBe(true);
    expect(conflicts.has('versioned_cas')).toBe(true);
  });

  it('throws fail-closed on an unknown legacy_ref', () => {
    const badPath = join(tmpRoot, 'bad.json');
    writeInventory(badPath, [
      {
        call_site_id: 'c'.repeat(16),
        source_path: 'app/x.tsx',
        line: 9,
        column: 9,
        hook_kind: 'useQuery',
        legacy_ref: 'api.unknown.legacy.ref',
      },
    ]);
    expect(() => authorContract({ inventoryPath: badPath })).toThrow(/no legacy_ref mapping/);
  });

  it('serializes to deterministic, parseable YAML', () => {
    const c = authorContract({ inventoryPath: invPath });
    const yaml = serializeContractYaml(c);
    const yaml2 = serializeContractYaml(c);
    expect(yaml).toBe(yaml2);
    // The YAML should not use anchors/aliases (each entry self-contained).
    expect(yaml).not.toMatch(/&a\d/);
    expect(yaml).not.toMatch(/\*a\d/);
    // Round-trip parse preserves the structure.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { parse } = require('yaml') as { parse: (s: string) => unknown };
    const parsed = parse(yaml) as { entries: Array<{ call_site_id: string }> };
    expect(parsed.entries.length).toBe(SEED_SITES.length);
  });
});

describe('resolveTarget — live surface seeds', () => {
  it('LIVE_ZERO_PUB_TABLES contains the chat / conversations / notifications tables', () => {
    expect(LIVE_ZERO_PUB_TABLES.has('conversations')).toBe(true);
    expect(LIVE_ZERO_PUB_TABLES.has('chat_messages')).toBe(true);
    expect(LIVE_ZERO_PUB_TABLES.has('notifications')).toBe(true);
    expect(LIVE_ZERO_PUB_TABLES.has('documents')).toBe(true);
  });

  it('LIVE_HONO_ROUTE_KEYS contains the chat-runs / uploads / missions routes', () => {
    expect(LIVE_HONO_ROUTE_KEYS.has('POST /api/chat-runs')).toBe(true);
    expect(LIVE_HONO_ROUTE_KEYS.has('POST /api/chat-runs/:id/cancel')).toBe(true);
    expect(LIVE_HONO_ROUTE_KEYS.has('GET /api/chat-runs/:id/events')).toBe(true);
    expect(LIVE_HONO_ROUTE_KEYS.has('POST /api/uploads')).toBe(true);
    expect(LIVE_HONO_ROUTE_KEYS.has('POST /api/missions')).toBe(true);
  });

  it('HONO_ROUTES covers the article + health + blobs public surface', () => {
    const paths = new Set(HONO_ROUTES.map((r) => `${r.method} ${r.path}`));
    expect(paths.has('GET /article/:shareToken')).toBe(true);
    expect(paths.has('GET /health')).toBe(true);
    expect(paths.has('GET /blobs/:id')).toBe(true);
  });

  it('rejects Zero targets that reference EXCLUDED zero_pub tables', () => {
    const target: ContractTarget = {
      kind: 'zero_query',
      table: 'toolbelt_tools', // EXCLUDED per zero-pub.ts
      name: 'toolbeltList',
      route: null,
    };
    const r = resolveTarget(target);
    expect(r.resolved).toBe(false);
    expect(r.evidence).toContain('not in zero_pub');
  });

  it('rejects Hono targets that reference an invented route', () => {
    const target: ContractTarget = {
      kind: 'hono_command',
      table: null,
      name: null,
      route: 'POST /api/invented-route',
    };
    const r = resolveTarget(target);
    expect(r.resolved).toBe(false);
    expect(r.evidence).toContain('not in live surface');
  });
});

describe('authorContract — duplicate call_site_id fail-closed', () => {
  const tmpRoot = join(tmpdir(), `holo-contract-dup-${Date.now()}`);
  const dupPath = join(tmpRoot, 'dup.json');

  beforeAll(() => {
    mkdirSync(tmpRoot, { recursive: true });
    // Two records share the same call_site_id but differ in source location.
    // The author function must reject this even when the rest of the
    // inventory is well-formed.
    writeInventory(dupPath, [
      {
        call_site_id: 'd'.repeat(16),
        source_path: 'app/a.tsx',
        line: 1,
        column: 1,
        hook_kind: 'useQuery',
        legacy_ref: 'api.conversations.index.list',
      },
      {
        call_site_id: 'd'.repeat(16),
        source_path: 'app/b.tsx',
        line: 2,
        column: 1,
        hook_kind: 'useQuery',
        legacy_ref: 'api.conversations.index.list',
      },
    ]);
  });

  afterAll(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('throws on duplicate call_site_id values in the inventory', () => {
    // The duplicate-id check runs before AC-4 enforcement, so a small
    // fixture is fine — the dup violation surfaces first.
    expect(() => authorContract({ inventoryPath: dupPath })).toThrow(/duplicate call_site_id/);
  });
});
