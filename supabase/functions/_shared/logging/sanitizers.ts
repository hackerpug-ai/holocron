import type { SanitizationPattern } from './types.ts';

/**
 * Patterns for detecting and redacting sensitive information
 */
const SANITIZATION_PATTERNS: SanitizationPattern[] = [
  // Supabase keys
  {
    name: 'Supabase Anon Key',
    pattern: /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g,
    replacement: 'SUPABASE_ANON_KEY_REDACTED',
  },
  {
    name: 'Supabase Service Role Key',
    pattern: /"service_role":\s*"[^"]{30,}"/g,
    replacement: '"service_role": "SUPABASE_SERVICE_ROLE_KEY_REDACTED"',
  },
  // OpenAI API keys
  {
    name: 'OpenAI API Key',
    pattern: /sk-[a-zA-Z0-9]{48}/g,
    replacement: 'OPENAI_API_KEY_REDACTED',
  },
  // Langfuse keys
  {
    name: 'Langfuse Public Key',
    pattern: /pk-lf-[a-zA-Z0-9]{32}/g,
    replacement: 'LANGFUSE_PUBLIC_KEY_REDACTED',
  },
  {
    name: 'Langfuse Secret Key',
    pattern: /sk-lf-[a-zA-Z0-9]{32}/g,
    replacement: 'LANGFUSE_SECRET_KEY_REDACTED',
  },
  // Bearer tokens (JWT)
  {
    name: 'Bearer Token',
    pattern: /Bearer\s+[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g,
    replacement: 'Bearer TOKEN_REDACTED',
  },
  {
    name: 'Authorization Header',
    pattern: /"Authorization":\s*"[^"]+"/g,
    replacement: '"Authorization": "REDACTED"',
  },
  // Email addresses
  {
    name: 'Email Address',
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    replacement: 'EMAIL_REDACTED',
  },
  // Credit card numbers (basic pattern)
  {
    name: 'Credit Card',
    pattern: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
    replacement: 'CREDIT_CARD_REDACTED',
  },
  // Generic API keys (common patterns)
  {
    name: 'Generic API Key',
    pattern: /(?:api[_-]?key|apikey|access[_-]?token)[:\s]*[a-zA-Z0-9_-]{20,}/gi,
    replacement: 'API_KEY_REDACTED',
  },
  // Passwords in JSON/URL params
  {
    name: 'Password Parameter',
    pattern: /"password":\s*"[^"]+"/gi,
    replacement: '"password": "REDACTED"',
  },
  {
    name: 'Password URL Param',
    pattern: /[?&]password=[^&\s]+/gi,
    replacement: 'password=REDACTED',
  },
  // Session tokens
  {
    name: 'Session Token',
    pattern: /["']?session["']?\s*[:=]\s*["']?[a-zA-Z0-9_-]{30,}/gi,
    replacement: 'session=SESSION_TOKEN_REDACTED',
  },
  // Phone numbers
  {
    name: 'Phone Number',
    pattern: /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    replacement: 'PHONE_REDACTED',
  },
  // IP addresses
  {
    name: 'IP Address',
    pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
    replacement: 'IP_REDACTED',
  },
];

/**
 * Additional keys to redact in objects (case-insensitive)
 */
const SENSITIVE_KEYS = [
  'password',
  'passwd',
  'secret',
  'token',
  'apikey',
  'api_key',
  'accesskey',
  'access_key',
  'privatekey',
  'private_key',
  'sessionkey',
  'session_key',
  'authorization',
  'cookie',
  'csrf',
  'ssn',
  'social_security',
  'creditcard',
  'credit_card',
  'pin',
];

/**
 * Sanitize a string by replacing sensitive patterns
 */
export function sanitize(input: string): string {
  if (!input || typeof input !== 'string') {
    return input;
  }

  let sanitized = input;

  for (const { pattern, replacement } of SANITIZATION_PATTERNS) {
    sanitized = sanitized.replace(pattern, replacement);
  }

  return sanitized;
}

/**
 * Check if a key name is potentially sensitive
 */
function isSensitiveKey(key: string): boolean {
  const lowerKey = key.toLowerCase().trim();
  return SENSITIVE_KEYS.some(sensitive => lowerKey.includes(sensitive));
}

/**
 * Recursively sanitize an object's values and keys
 */
export function sanitizeObject<T>(obj: T, depth = 0, maxDepth = 10): T {
  // Prevent infinite recursion
  if (depth > maxDepth) {
    return obj;
  }

  // Handle null/undefined/primitives
  if (obj === null || obj === undefined) {
    return obj;
  }

  // Handle strings
  if (typeof obj === 'string') {
    return sanitize(obj) as T;
  }

  // Handle numbers and booleans (no sanitization needed)
  if (typeof obj !== 'object') {
    return obj;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item, depth + 1, maxDepth)) as T;
  }

  // Handle objects
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const sanitizedKey = isSensitiveKey(key) ? `${key}_REDACTED` : key;

    if (value === null || value === undefined) {
      result[sanitizedKey] = value;
    } else if (typeof value === 'string') {
      result[sanitizedKey] = isSensitiveKey(key) ? 'REDACTED' : sanitize(value);
    } else if (typeof value === 'object') {
      result[sanitizedKey] = sanitizeObject(value, depth + 1, maxDepth);
    } else {
      result[sanitizedKey] = value;
    }
  }

  return result as T;
}

/**
 * Sanitize an error object for logging
 */
export function sanitizeError(error: unknown): Record<string, unknown> {
  if (!error) {
    return { message: 'Unknown error' };
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: sanitize(error.message),
      stack: error.stack ? sanitize(error.stack) : undefined,
    };
  }

  if (typeof error === 'string') {
    return { message: sanitize(error) };
  }

  if (typeof error === 'object') {
    return sanitizeObject(error as Record<string, unknown>);
  }

  return { message: String(error) };
}

/**
 * Get the list of sanitization patterns (for testing/debugging)
 */
export function getSanitizationPatterns(): ReadonlyArray<SanitizationPattern> {
  return SANITIZATION_PATTERNS;
}
