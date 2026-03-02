#!/bin/bash
# Generate OTEL headers for Langfuse authentication
# Reads from .env file and outputs JSON for Claude Code's otelHeadersHelper

# Load .env from project root
ENV_FILE="$(dirname "$0")/../.env"

if [ -f "$ENV_FILE" ]; then
  export $(grep -E '^LANGFUSE_(PUBLIC|SECRET)_KEY=' "$ENV_FILE" | xargs)
fi

# Fallback to environment variables if not in .env
PUBLIC_KEY="${LANGFUSE_PUBLIC_KEY:-}"
SECRET_KEY="${LANGFUSE_SECRET_KEY:-}"

if [ -z "$PUBLIC_KEY" ] || [ -z "$SECRET_KEY" ]; then
  echo '{"X-Langfuse-Error": "Missing LANGFUSE_PUBLIC_KEY or LANGFUSE_SECRET_KEY"}'
  exit 0
fi

# Generate Basic auth header (base64 encoded public:secret)
AUTH_STRING=$(echo -n "${PUBLIC_KEY}:${SECRET_KEY}" | base64)

echo "{\"Authorization\": \"Basic ${AUTH_STRING}\"}"
