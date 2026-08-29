/**
 * Fleet Role Manifest loader — fail-closed validation at load.
 *
 * Default path: packages/platform/fleet/manifest.json (relative to package root).
 * Override via FLEET_MANIFEST_PATH or loadFleetManifest(path).
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FLEET_ROLE_NAMES,
  type FleetRole,
  type FleetRoleManifest,
  FleetRoleManifestSchema,
  type FleetRoleName,
} from './manifest.schema.ts';

export class ManifestIncompleteError extends Error {
  readonly code = 'MANIFEST_INCOMPLETE' as const;
  constructor(
    message: string,
    readonly issues: string[] = []
  ) {
    super(message);
    this.name = 'ManifestIncompleteError';
  }
}

export class UnknownFleetRoleError extends Error {
  readonly code = 'UNKNOWN_FLEET_ROLE' as const;
  constructor(readonly role: string) {
    super(`unknown fleet role: ${role}`);
    this.name = 'UnknownFleetRoleError';
  }
}

/** Package root = packages/platform (parent of src/). */
export function platformPackageRoot(): string {
  // src/fleet/manifest.ts → src/fleet → src → platform
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '..', '..');
}

export function defaultManifestPath(): string {
  const fromEnv = process.env.FLEET_MANIFEST_PATH;
  if (fromEnv && fromEnv.length > 0) {
    return isAbsolute(fromEnv) ? fromEnv : resolve(process.cwd(), fromEnv);
  }
  return join(platformPackageRoot(), 'fleet', 'manifest.json');
}

/**
 * Load + validate the Fleet Role Manifest. Throws ManifestIncompleteError
 * (fail closed) on missing file, invalid JSON, or schema failure.
 */
export function loadFleetManifest(path: string = defaultManifestPath()): FleetRoleManifest {
  if (!existsSync(path)) {
    throw new ManifestIncompleteError(`Fleet Role Manifest not found: ${path}`, [
      `missing file: ${path}`,
    ]);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new ManifestIncompleteError(`Fleet Role Manifest is not valid JSON: ${msg}`, [msg]);
  }

  const parsed = FleetRoleManifestSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new ManifestIncompleteError(
      `Fleet Role Manifest incomplete or invalid (${issues.length} issue(s))`,
      issues
    );
  }
  return parsed.data;
}

export function isFleetRoleName(role: string): role is FleetRoleName {
  return (FLEET_ROLE_NAMES as readonly string[]).includes(role);
}

export function getRoleEntry(manifest: FleetRoleManifest, role: string): FleetRole {
  if (!isFleetRoleName(role)) {
    throw new UnknownFleetRoleError(role);
  }
  return manifest.roles[role];
}

/** Cached default manifest for process lifetime (reloadable via clearManifestCache). */
let cached: FleetRoleManifest | null = null;
let cachedPath: string | null = null;

export function getFleetManifest(path?: string): FleetRoleManifest {
  const p = path ?? defaultManifestPath();
  if (cached && cachedPath === p) return cached;
  cached = loadFleetManifest(p);
  cachedPath = p;
  return cached;
}

export function clearManifestCache(): void {
  cached = null;
  cachedPath = null;
}
