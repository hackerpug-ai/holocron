/**
 * Mock for @react-navigation/native's UnhandledLinkingContext
 * This prevents Storybook's argType inference from hitting throwing getters
 */
import * as React from 'react'

export const UnhandledLinkingContext = React.createContext({
  lastUnhandledLink: undefined,
  setLastUnhandledLink: () => {},
})

UnhandledLinkingContext.displayName = 'UnhandledLinkingContext'
