/**
 * Parse MigratedJob.schedule expressions into a live cadence.
 *
 * Supported forms (mirrors convex/crons.ts registry strings):
 *   - "interval <N><unit>"  unit ∈ m|min|mins|minute|minutes|h|hr|hour|hours
 *   - "daily HH:MM UTC"
 *
 * Throws SCHEDULE_PARSE_ERROR (named) — never silently defaults a cadence.
 */

export type ParsedSchedule =
  | { kind: 'interval'; ms: number }
  | { kind: 'daily'; utcHour: number; utcMinute: number };

export class ScheduleParseError extends Error {
  readonly code = 'SCHEDULE_PARSE_ERROR' as const;
  readonly jobName: string | undefined;
  readonly expression: string;

  constructor(expression: string, detail: string, jobName?: string) {
    const named = jobName ? ` job="${jobName}"` : '';
    super(
      `SCHEDULE_PARSE_ERROR${named}: cannot parse schedule ${JSON.stringify(expression)} — ${detail}`
    );
    this.name = 'ScheduleParseError';
    this.expression = expression;
    this.jobName = jobName;
  }
}

const INTERVAL_RE = /^interval\s+(\d+)\s*(m|min|mins|minute|minutes|h|hr|hour|hours)$/i;
const DAILY_RE = /^daily\s+(\d{1,2}):(\d{2})\s*UTC$/i;

/**
 * Parse a registry schedule string. Throws ScheduleParseError on failure.
 */
export function parseSchedule(expression: string, jobName?: string): ParsedSchedule {
  const raw = expression.trim();
  if (!raw) {
    throw new ScheduleParseError(expression, 'empty expression', jobName);
  }

  const intervalMatch = INTERVAL_RE.exec(raw);
  if (intervalMatch) {
    const amount = Number(intervalMatch[1]);
    const unit = intervalMatch[2]?.toLowerCase();
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new ScheduleParseError(
        expression,
        'interval amount must be a positive integer',
        jobName
      );
    }
    const isHour = unit.startsWith('h');
    const ms = amount * (isHour ? 3_600_000 : 60_000);
    return { kind: 'interval', ms };
  }

  const dailyMatch = DAILY_RE.exec(raw);
  if (dailyMatch) {
    const utcHour = Number(dailyMatch[1]);
    const utcMinute = Number(dailyMatch[2]);
    if (
      !Number.isInteger(utcHour) ||
      !Number.isInteger(utcMinute) ||
      utcHour < 0 ||
      utcHour > 23 ||
      utcMinute < 0 ||
      utcMinute > 59
    ) {
      throw new ScheduleParseError(expression, 'daily hour/minute out of range', jobName);
    }
    return { kind: 'daily', utcHour, utcMinute };
  }

  throw new ScheduleParseError(expression, 'unrecognized schedule form', jobName);
}

/**
 * Compute the next fire instant for a parsed schedule at/after `from`.
 * For intervals: from + ms (exclusive of "now" as a fire — next cadence).
 * For daily: next occurrence of utcHour:utcMinute at or after `from` (if exactly
 * on the minute, returns `from` so an in-window step can fire).
 */
export function nextFireAt(parsed: ParsedSchedule, from: Date = new Date()): Date {
  if (parsed.kind === 'interval') {
    return new Date(from.getTime() + parsed.ms);
  }

  const y = from.getUTCFullYear();
  const m = from.getUTCMonth();
  const d = from.getUTCDate();
  let candidate = new Date(Date.UTC(y, m, d, parsed.utcHour, parsed.utcMinute, 0, 0));
  // If we are strictly past today's slot, roll to tomorrow.
  if (candidate.getTime() < from.getTime()) {
    candidate = new Date(Date.UTC(y, m, d + 1, parsed.utcHour, parsed.utcMinute, 0, 0));
  }
  return candidate;
}

/**
 * True when a daily schedule should fire at the given evaluation instant.
 * Window: same UTC hour and minute (second may be non-zero — cron second skew).
 * Interval schedules always "due" when the consumer asks (caller decides cadence).
 */
export function isDueAt(parsed: ParsedSchedule, at: Date): boolean {
  if (parsed.kind === 'interval') {
    return true;
  }
  return at.getUTCHours() === parsed.utcHour && at.getUTCMinutes() === parsed.utcMinute;
}
