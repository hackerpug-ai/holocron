/**
 * Expo app configuration
 *
 * NOTE: This file takes precedence over app.json. All Expo config should be here.
 * app.json is only used for EAS metadata that can't be in JS config.
 */
module.exports = {
  expo: {
    name: 'holocron',
    slug: 'holocron',
    version: '1.0.0',
    scheme: 'holocron',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    splash: {
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#ffffff',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.holocron.app',
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
      },
      simulator: {
        device: 'iPhone 15 Pro',
      },
    },
    android: {
      adaptiveIcon: {
        backgroundColor: '#E6F4FE',
        foregroundImage: './assets/android-icon-foreground.png',
        backgroundImage: './assets/android-icon-background.png',
        monochromeImage: './assets/android-icon-monochrome.png',
      },
      package: 'com.holocron.app',
    },
    web: {
      favicon: './assets/favicon.png',
      bundler: 'metro',
    },
    plugins: [
      'expo-router',
      'expo-sqlite',
      'expo-font',
      '@react-native-community/datetimepicker',
      [
        'expo-audio',
        {
          enableBackgroundPlayback: true,
        },
      ],
    ],
    extra: {
      router: {},
      eas: {
        projectId: 'a580bd53-e7a9-4968-96c8-f6cf207a4abe',
      },
    },
    owner: 'hackerpug',
    // EAS Updates configuration (merged from app.json)
    runtimeVersion: {
      policy: 'appVersion',
    },
    updates: {
      url: 'https://u.expo.dev/a580bd53-e7a9-4968-96c8-f6cf207a4abe',
    },
  },
}
