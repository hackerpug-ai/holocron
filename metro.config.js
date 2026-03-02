const { getDefaultConfig } = require('expo/metro-config')
const { withNativeWind } = require('nativewind/metro')
const { withStorybook } = require('@storybook/react-native/metro/withStorybook')

const config = getDefaultConfig(__dirname)

// Apply NativeWind
const nativeWindConfig = withNativeWind(config, { input: './global.css' })

// Apply Storybook - only enabled when STORYBOOK_ENABLED=true
// Use: pnpm storybook (sets the env var automatically)
const STORYBOOK_ENABLED = process.env.STORYBOOK_ENABLED === 'true'

module.exports = withStorybook(nativeWindConfig, {
  enabled: STORYBOOK_ENABLED,
  configPath: './.rnstorybook',
})
