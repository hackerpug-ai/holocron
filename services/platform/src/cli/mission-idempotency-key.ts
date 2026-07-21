/**
 * Deterministic default idempotency keys for Sprint-22 mission CLI surfaces (REDHAT-FIX-2 / C-2).
 *
 * Precedence:
 * 1. explicit override (--idempotency-key) when non-empty after trim
 * 2. pure base key from template identity + operator params
 * 3. optional uniqueness suffix only when opts.fresh is true
 *
 * Default keys NEVER embed Date.now() / randomUUID / pid.
 */

export type MissionIdempotencySurface =
  | 'research'
  | 'whatsnew'
  | 'assimilate'
  | 'shop'
  | 'subscriptions'
  | 'report';

export type DefaultMissionIdempotencyParams = {
  /** research / deepResearch / subscriptions-research / fulcrum */
  instantiation?: string;
  goal?: string;
  components?: string | number | null;
  /** whatsNew */
  date?: string;
  /** assimilate */
  target?: string;
  /** shop */
  query?: string;
  /** subscriptions */
  topic?: string;
  /** report */
  reportKind?: string;
  subject?: string;
};

export type MissionIdempotencyKeyOptions = {
  /** Explicit --idempotency-key override (highest precedence when non-empty after trim). */
  override?: string | null;
  /** Opt-in uniqueness: append a unique suffix only when true. */
  fresh?: boolean;
  /**
   * Suffix used when fresh=true. Defaults to Date.now().
   * Injectable for tests; production callers leave this unset.
   */
  uniqueSuffix?: string | number;
};

/**
 * Build the idempotency key for a mission CLI surface.
 * Pure function of (kind, params, opts) — no wall-clock entropy unless opts.fresh.
 */
export function defaultMissionIdempotencyKey(
  kind: MissionIdempotencySurface,
  params: DefaultMissionIdempotencyParams,
  opts?: MissionIdempotencyKeyOptions
): string {
  const override = opts?.override?.trim();
  if (override) return override;

  const base = baseMissionIdempotencyKey(kind, params);
  if (opts?.fresh) {
    const suffix = opts.uniqueSuffix ?? Date.now();
    return `${base}:${suffix}`;
  }
  return base;
}

function baseMissionIdempotencyKey(
  kind: MissionIdempotencySurface,
  params: DefaultMissionIdempotencyParams
): string {
  switch (kind) {
    case 'research': {
      const components =
        params.components === undefined || params.components === null || params.components === ''
          ? 'default'
          : String(params.components);
      return `${params.instantiation}:${params.goal}:${components}`;
    }
    case 'whatsnew':
      return `whatsnew:${params.date}`;
    case 'assimilate':
      return `assimilate:${params.target}`;
    case 'shop':
      return `shop:${params.query}`;
    case 'subscriptions':
      return `subscriptions:${params.topic}`;
    case 'report':
      return `report:${params.reportKind}:${params.subject}`;
    default: {
      const _exhaustive: never = kind;
      throw new Error(`unknown mission idempotency surface: ${String(_exhaustive)}`);
    }
  }
}
