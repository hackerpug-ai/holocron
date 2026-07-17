/** Ambient modules for optional queue backends (dynamic import). */
declare module 'pg-boss' {
  export default class PgBoss {
    constructor(options: string | Record<string, unknown>);
    start(): Promise<unknown>;
    stop(options?: { graceful?: boolean; timeout?: number }): Promise<unknown>;
    send(name: string, data?: unknown, options?: Record<string, unknown>): Promise<string | null>;
    fetch(name: string): Promise<unknown>;
  }
}

declare module 'graphile-worker' {
  export function run(options: Record<string, unknown>): Promise<unknown>;
}
