#!/bin/bash
# Build standalone iOS IPA (no Metro required)
# Usage: pnpm build:ios:standalone

set -e

echo "🔨 Generating native files..."
expo prebuild --clean

echo "📱 Building release IPA with Xcode..."
cd ios
xcodebuild -workspace holocron.xcworkspace \
  -scheme holocron \
  -configuration Release \
  -sdk iphoneos \
  -destination 'generic/platform=iOS' \
  -archivePath build/holocron.xcarchive \
  archive

echo "📦 Exporting IPA..."
xcodebuild -exportArchive \
  -archivePath build/holocron.xcarchive \
  -exportPath build/IPA \
  -exportOptionsPlist ../exportOptions.plist

echo "✅ IPA ready at: ios/build/IPA/holocron.ipa"
echo "📲 Install via: ios-deploy install ios/build/IPA/holocron.ipa"
