// MUST be imported first - patches React Navigation before it's loaded
import './setup'

import type { Preview } from '@storybook/react-native'
import { View } from 'react-native'
import { NavigationContainer } from '@react-navigation/native'

const preview: Preview = {
  decorators: [
    (Story) => (
      <NavigationContainer independent>
        <View style={{ flex: 1, padding: 16 }}>
          <Story />
        </View>
      </NavigationContainer>
    ),
  ],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/,
      },
    },
  },
  // Disable automatic arg type inference - prevents context access during story loading
  argTypesEnhancers: [],
}

export default preview
