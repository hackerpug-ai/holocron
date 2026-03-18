// Mock for react-dom/client on native platforms
// This is needed because @expo/metro-runtime incorrectly imports web-only code
// See: https://github.com/expo/expo/issues - Expo SDK 55 bug
module.exports = {
  createRoot: () => ({
    render: () => {},
    unmount: () => {},
  }),
};
