#!/bin/bash
# Build standalone Android APK (no Metro required)
# Usage: pnpm build:android:standalone

set -e

echo "🔨 Generating native files..."
expo prebuild --clean

echo "🤖 Building release APK with Gradle..."
cd android

# Build release APK
./gradlew assembleRelease --no-daemon

echo "✅ APK ready at: android/app/build/outputs/apk/release/app-release.apk"
echo "📲 Install via: adb install android/app/build/outputs/apk/release/app-release.apk"
