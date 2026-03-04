import type { LoggerConfig, LogLevel } from './types';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

/**
 * Default logger configuration
 */
export const defaultConfig: LoggerConfig = {
  enabled: Constants.expoConfig?.extra?.LOGGING_ENABLED === 'true' || __DEV__,
  minLevel: (Constants.expoConfig?.extra?.LOG_LEVEL as LogLevel) || (__DEV__ ? 'debug' : 'info'),
  sanitize: true,
  maxFileSize: 5 * 1024 * 1024, // 5MB
  maxFiles: 7,
  logDirectory: '.tmp/logs',
};

/**
 * Get platform string for logging
 */
export function getPlatformString(): string {
  return Platform.OS;
}

/**
 * Validate log level
 */
export function isValidLogLevel(level: string): level is LogLevel {
  return ['debug', 'info', 'warn', 'error'].includes(level);
}

/**
 * Parse log level from environment variable
 */
export function parseLogLevel(envValue: string | undefined): LogLevel {
  if (envValue && isValidLogLevel(envValue)) {
    return envValue;
  }
  return 'info';
}
