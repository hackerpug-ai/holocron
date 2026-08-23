export type AssimilateErrorCode =
  | 'ASSIMILATE_USAGE'
  | 'ASSIMILATE_UNREACHABLE'
  | 'ASSIMILATE_ROOT_TRIPWIRE'
  | 'ASSIMILATE_EMPTY_SCOPE'
  | 'ASSIMILATE_ACP_UNAVAILABLE'
  | 'ASSIMILATE_DEEPSEEK_KEY_MISSING'
  | 'ASSIMILATE_BARREN'
  | 'ASSIMILATE_BELOW_FLOOR'
  | 'ASSIMILATE_CANCELLED';

export class AssimilateError extends Error {
  readonly code: AssimilateErrorCode;

  constructor(code: AssimilateErrorCode, message: string) {
    super(`${code}: ${message}`);
    this.name = 'AssimilateError';
    this.code = code;
  }
}
