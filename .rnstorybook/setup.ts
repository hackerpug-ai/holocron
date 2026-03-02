/**
 * Storybook setup file - MUST be imported before any React Navigation imports
 * Patches UnhandledLinkingContext to prevent throwing getters during argType inference
 */
import * as React from 'react'

// Create a safe context with non-throwing default values
const SafeUnhandledLinkingContext = React.createContext({
  lastUnhandledLink: undefined as string | undefined,
  setLastUnhandledLink: (_link: string) => {},
})
SafeUnhandledLinkingContext.displayName = 'UnhandledLinkingContext'

// Patch the module cache before anything imports it
try {
  // This patches the require cache so subsequent imports get the safe version
  const navModule = require('@react-navigation/native/lib/module/UnhandledLinkingContext')
  if (navModule) {
    navModule.UnhandledLinkingContext = SafeUnhandledLinkingContext
  }
} catch {
  // Module not found - that's fine
}

export {}
