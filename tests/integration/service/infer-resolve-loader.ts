/**
 * Non-literal dynamic import of resolveModel so root `pnpm tsgo --noEmit`
 * does not pull services/platform .ts-extension imports into the program
 * (platform is Bun-first and excluded from root tsconfig).
 */

type ErrorClass = {
  new (...args: string[]): Error & Record<string, unknown>;
};

export type LoadedResolveModel = {
  resolveModel: (
    role: string,
    options?: Record<string, unknown>
  ) => Promise<{
    endpoint: string;
    role: string;
    litellmModelId?: string;
    modelRevision?: string;
    healthy?: boolean;
    baseURL?: string;
    allowEscape?: boolean;
    provider?: string;
    degradationAction?: string;
    [key: string]: unknown;
  }>;
  UnknownFleetRoleError: ErrorClass & {
    new (role: string): Error & { code: string; role: string };
  };
  RoleUnavailableError: ErrorClass & {
    new (
      role: string,
      endpoint: string,
      degradationAction: string,
      causeMessage: string
    ): Error & {
      code: string;
      role: string;
      endpoint: string;
      degradationAction: string;
    };
  };
  BudgetExceededError: ErrorClass & {
    new (...args: string[]): Error & { code: string };
  };
};

export async function loadResolveModel(): Promise<LoadedResolveModel> {
  const path = ['../../../services/platform/src/inference', 'resolve-model'].join('/');
  return import(path) as Promise<LoadedResolveModel>;
}
