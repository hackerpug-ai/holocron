/**
 * Backup package exports (CAP-BAK-01).
 *
 * Recovery baseline (REDHAT-FIX-C5) is the immutable SHA-256 parity oracle
 * co-retained with the backup set in R2.
 */

export {
  type BaseBackupJobResult,
  type BaseBackupType,
  formatBaseBackupText,
  formatLaunchdInstallText,
  installBaseBackupLaunchd,
  type LaunchdInstallResult,
  parseLatestBackupLabel,
  readBaseBackupSchedule,
  renderBaseBackupPlist,
  runBaseBackupJob,
} from './base-backup.ts';

export { type BackupConfig, loadBackupConfig } from './config.ts';
export {
  assertParity,
  compareHashSets,
  hashDirectoryTree,
  hashLocalBlobStore,
  type ParityCompareResult,
} from './parity-check.ts';
export {
  type BaselineHookResult,
  type BaselineParityCompareResult,
  baselineDomainRowTotal,
  bindResticSnapshotToRecoveryBaseline,
  buildRecoveryBaseline,
  captureAndUploadRecoveryBaseline,
  compareRestoredToBaseline,
  computeBaselineId,
  computeBlobManifestSha256,
  computeLedgerSha256,
  contentAddressedBaselineKey,
  emitBaseBackupRecoveryBaselineHook,
  formatSha256Digest,
  isBaselineParityMeaningful,
  isMd5OnlyDigest,
  listRecoveryBaselines,
  loadBaselineAndCompare,
  loadRecoveryBaselineFromR2,
  lookupBaselineKey,
  normalizeSha256Digest,
  queryTargetLsn,
  RECOVERY_BASELINE_OBJECT_NAME,
  RECOVERY_BASELINE_PREFIX,
  RECOVERY_BASELINE_SCHEMA,
  type RecoveryBaseline,
  type RecoveryBaselineUploadResult,
  uploadRecoveryBaseline,
  validateRecoveryBaseline,
  verifyResticSnapshotInRepo,
} from './recovery-baseline.ts';
export {
  DEFAULT_RESTIC_PREFIX,
  RESTIC_BLOB_MIRROR_JOB,
  RESTIC_BLOB_MIRROR_SPAN,
  type ResticMirrorResult,
} from './restic-mirror.ts';
export {
  classifyPostgresStartFailure,
  mapPostgresStartFailureNamedErrors,
} from './restore.ts';
