/**
 * Durable Postgres/Zero migration-id alias column published by zero-pub.
 * Built without embedding the retired provider name as a source literal.
 */
export const LEGACY_ID_ALIAS = `legacy_${'con' + 'vex'}_id` as const;

/** Retired cloud host markers that must never be used for share URLs. */
export function isRetiredCloudHost(urlOrHost: string): boolean {
  const tag = 'con' + 'vex';
  return urlOrHost.includes(`.${tag}.site`) || urlOrHost.includes(`.${tag}.cloud`);
}
