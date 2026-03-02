import { Tabs } from 'expo-router'
import { Icon, MaterialCommunityIcon } from '@/components/ui/icon'

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#6750A4',
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
