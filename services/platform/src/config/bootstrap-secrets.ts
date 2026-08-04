/**
 * Service-composition bootstrap.
 *
 * Keep this as the first dependency of the service entry module so modules
 * that capture configuration during ESM evaluation see the explicit
 * HOLO_SECRETS_PATH overlay. Environment values still win.
 */
import { applyConsolidatedSecretsToEnv } from './secrets.ts';

export const SERVICE_BOOTSTRAP_SECRETS = applyConsolidatedSecretsToEnv();
