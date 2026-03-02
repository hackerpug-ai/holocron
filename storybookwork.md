1. Web Storybook (react-native-web) - Abandoned  


Attempted to run Storybook in browser using react-native-web polyfills.

Files created/modified:

- .storybook/main.ts - Added aliases for RN → web packages
- .storybook/tailwind.config.js - Web-specific Tailwind (no nativewind preset)
- .storybook/mocks/react-native-internals.js - Mock for native modules
- postcss.config.js - PostCSS for Tailwind processing  


Packages installed:

- react-native-svg-web - Web SVG support
- autoprefixer, postcss - Tailwind CSS processing  


Issue: react-native-reanimated has too many native-only internals that can't be easily  
 mocked. The web polyfill approach kept hitting new errors.

---

2. Native Storybook (on-device) - In Progress  


Switching to @storybook/react-native which runs in the actual Expo app.

Packages installed:

- @storybook/react-native
- @storybook/addon-ondevice-controls
- @storybook/addon-ondevice-actions  


Files created (incomplete):

- .storybook/native/index.tsx - Storybook entry point  


Still needed:

- .storybook/native/storybook.requires.ts - Story registry
- Update app/\_layout.tsx to conditionally render Storybook
- Add storybook:native script to package.json
- Configure metro to support the toggle  

