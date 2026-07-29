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
  type EmitLiveRecoveryBaselineOptions,
  emitBaseBackupRecoveryBaselineHook,
  emitLiveRecoveryBaseline,
  formatSha256Digest,
  isBaselineParityMeaningful,
  isMd5OnlyDigest,
  listRecoveryBaselines,
  listResticSnapshotIds,
  loadBaselineAndCompare,
  loadRecoveryBaselineFromR2,
  lookupBaselineKey,
  matchResticSnapshotId,
  normalizeSha256Digest,
  parseBackupStopForLabel,
  queryTargetLsn,
  RECOVERY_BASELINE_OBJECT_NAME,
  RECOVERY_BASELINE_PREFIX,
  RECOVERY_BASELINE_SCHEMA,
  type RecoverableBaselineBindingInput,
  type RecoverableBaselineBindingResult,
  type RecoveryBaseline,
  type RecoveryBaselineUploadResult,
  resolveRecoverableBaselineBinding,
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
  extractBackupTimeWindow,
  formatPitrWindowText,
  mapPostgresStartFailureNamedErrors,
  PITR_WINDOW_WAL_SLACK_MS,
  type PitrWindowReport,
  queryPitrWindow,
} from './restore.ts';
