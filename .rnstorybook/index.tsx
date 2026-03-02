// This file is the entry point for Storybook
import AsyncStorage from '@react-native-async-storage/async-storage'
import { view } from './storybook.requires'

// Get the Storybook UI component from the view instance
// Pass AsyncStorage explicitly to fix "Cannot read property 'getItem' of undefined"
const StorybookUI = view.getStorybookUI({
  storage: AsyncStorage,
})

export default StorybookUI
