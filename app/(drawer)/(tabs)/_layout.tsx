import { Tabs } from 'expo-router'
import { useColorScheme } from 'react-native'
import { Icon, MaterialCommunityIcon } from '@/components/ui/icon'
import { colors } from '@/lib/theme'

export default function TabLayout() {
  const colorScheme = useColorScheme()
  const themeColors = colorScheme === 'dark' ? colors.dark : colors.light

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: themeColors.primary,
        headerShown: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => (
            <Icon as={MaterialCommunityIcon} name="home" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Explore',
          tabBarIcon: ({ color, size }) => (
            <Icon as={MaterialCommunityIcon} name="compass" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  )
}
