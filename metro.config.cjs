const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const { withStorybook } = require('@storybook/react-native/metro/withStorybook');

const config = getDefaultConfig(__dirname);

// Apply NativeWind
const nativeWindConfig = withNativeWind(config, { input: './global.css' });

// Apply Storybook - only enabled when STORYBOOK_ENABLED=true
// Use: pnpm storybook (sets the env var automatically)
const STORYBOOK_ENABLED = process.env.STORYBOOK_ENABLED === 'true';

// When Storybook is enabled, redirect React Navigation's UnhandledLinkingContext
// to a mock that doesn't have throwing getters (prevents Storybook argType inference errors)
if (STORYBOOK_ENABLED) {
  const originalResolveRequest = nativeWindConfig.resolver.resolveRequest;
  nativeWindConfig.resolver.resolveRequest = (context, moduleName, platform) => {
    if (moduleName.includes('UnhandledLinkingContext')) {
      return {
        filePath: path.resolve(__dirname, '.rnstorybook/mocks/UnhandledLinkingContext.js'),
        type: 'sourceFile',
      };
    }
    if (originalResolveRequest) {
      return originalResolveRequest(context, moduleName, platform);
    }
    return context.resolveRequest(context, moduleName, platform);
  };
}

module.exports = withStorybook(nativeWindConfig, {
  enabled: STORYBOOK_ENABLED,
  configPath: './.rnstorybook',
});
