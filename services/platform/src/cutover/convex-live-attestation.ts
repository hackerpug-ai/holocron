/**
 * D08-02 — live cloud attestation retired with source decommission.
 */
import { resolve } from 'node:path';

export const CONVEX_UNREACHABLE = 'CONVEX_UNREACHABLE';
export const WRITES_NOT_BLOCKED = 'WRITES_NOT_BLOCKED';
export const WRITE_PROBE_TARGET_MISSING = 'WRITE_PROBE_TARGET_MISSING';
export const ATTESTATION_PARTIAL = 'ATTESTATION_PARTIAL';
export const DEFAULT_ATTEST_TICKS = 3;
export const DEFAULT_ATTEST_INTERVAL_MS = 1500;

export type AttestationError = { code: string; message: string };

export type AttestationReport = {
  ok: boolean;
  ticks: number;
  error?: AttestationError;
  message?: string;
};

export type AttestConvexLiveOptions = {
  ticks?: number;
  intervalMs?: number;
  baseUrl?: string;
  reportPath?: string;
};

export function defaultAttestationEvidencePath(cwd = process.cwd()): string {
  return resolve(cwd, '.tmp/D07-02/convex-live-attestation.jsonl');
}

export function defaultAttestationReportPath(cwd = process.cwd()): string {
  return resolve(cwd, '.tmp/D07-02/convex-live-attestation-report.json');
}

export async function runAttestConvexLive(
  _options: AttestConvexLiveOptions = {}
): Promise<AttestationReport> {
  void _options;
  return {
    ok: false,
    ticks: 0,
    error: {
      code: CONVEX_UNREACHABLE,
      message: 'live cloud attestation retired in D08-02; source tree and SDK are gone',
    },
  };
}

export function formatAttestConvexLiveText(report: AttestationReport): string {
  return `attest-live ok=${report.ok} ticks=${report.ticks} error=${report.error?.code ?? 'none'}`;
}
