#!/bin/bash

# Setup YouTube Service Account for Holocron
# Copies the service account JSON and sets it as a Convex environment variable

SERVICE_ACCOUNT_PATH="/Users/justinrich/Projects/holocron/keys/holocron-491417-dbb7b9c4fd62.json"

echo "🔐 Setting up YouTube Service Account for Holocron"
echo "================================================"

# Check if file exists
if [ ! -f "$SERVICE_ACCOUNT_PATH" ]; then
  echo "❌ Error: Service account file not found at $SERVICE_ACCOUNT_PATH"
  echo "   Please update the SERVICE_ACCOUNT_PATH variable in this script"
  exit 1
fi

echo "📂 Reading service account from: $SERVICE_ACCOUNT_PATH"

# Read file and set as Convex env var
SERVICE_ACCOUNT_JSON=$(cat "$SERVICE_ACCOUNT_PATH")

echo "📤 Uploading to Convex..."

npx convex env set GOOGLE_APPLICATION_CREDENTIALS_JSON "$SERVICE_ACCOUNT_JSON"

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Service account configured successfully!"
  echo ""
  echo "To verify, run:"
  echo "  npx convex env get GOOGLE_APPLICATION_CREDENTIALS_JSON"
else
  echo ""
  echo "❌ Failed to set environment variable"
  exit 1
fi
