module.exports = (api) => {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
      '@ohah/react-native-mcp-server/babel-preset',
    ],
    plugins: ['react-native-reanimated/plugin'],
  };
};
