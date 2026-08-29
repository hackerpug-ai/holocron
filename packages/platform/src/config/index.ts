/**
 * Consolidated platform config — secrets loader + Convex-env build gate.
 */
export {
  type ApplySecretsResult,
  applyConsolidatedSecretsToEnv,
  type DoctorReport,
  defaultSecretsExamplePath,
  defaultSecretsPath,
  formatDoctorText,
  getSecretValue,
  loadConsolidatedSecrets,
  loadSecretsFile,
  REQUIRED_SECRET_KEYS,
  type RequiredSecretKey,
  resolveRepoRoot,
  resolveSecret,
  resolveSecretsPathFromEnv,
  runSecretsDoctor,
  type SecretResolution,
  type SecretsMap,
  secretsConfigDir,
  secretsGitignorePath,
} from './secrets.ts';

export {
  type ConvexAliasHit,
  formatVerifyNoConvexEnvText,
  getBannedConvexEnvPatterns,
  type VerifyNoConvexEnvReport,
  verifyNoConvexEnv,
} from './verify-no-convex-env.ts';
