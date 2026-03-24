import type { Meta, StoryObj } from '@storybook/react'
import { View, Text, StyleSheet } from 'react-native'
import {
  Search,
  Home,
  User,
  Bell,
  Settings,
  Plus,
  Check,
  AlertTriangle,
  X,
  ChevronRight,
  BookOpen,
  Database,
  FileText,
  Folder,
  RefreshCw,
  type LucideIcon,
} from '@/components/ui/icons'
import { useTheme } from '@/hooks/use-theme'

const projectIcons: { Icon: LucideIcon; name: string; label: string }[] = [
  { Icon: Home, name: 'Home', label: 'Home' },
  { Icon: Search, name: 'Search', label: 'Search' },
  { Icon: BookOpen, name: 'BookOpen', label: 'Research' },
  { Icon: Database, name: 'Database', label: 'Database' },
  { Icon: FileText, name: 'FileText', label: 'Document' },
  { Icon: Folder, name: 'Folder', label: 'Folder' },
  { Icon: User, name: 'User', label: 'Account' },
  { Icon: Bell, name: 'Bell', label: 'Notifications' },
  { Icon: Settings, name: 'Settings', label: 'Settings' },
  { Icon: Plus, name: 'Plus', label: 'Add' },
  { Icon: Check, name: 'Check', label: 'Success' },
  { Icon: AlertTriangle, name: 'AlertTriangle', label: 'Warning' },
  { Icon: X, name: 'X', label: 'Close' },
  { Icon: ChevronRight, name: 'ChevronRight', label: 'Navigate' },
  { Icon: RefreshCw, name: 'RefreshCw', label: 'Refresh' },
]

function IconGallery() {
  const { colors: themeColors } = useTheme()

  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: themeColors.foreground }]}>Icon Gallery</Text>
      <Text style={[styles.description, { color: themeColors.mutedForeground }]}>
        Icons from lucide-react-native, curated for the holocron research app.
      </Text>
      <View style={styles.grid}>
        {projectIcons.map(({ Icon, name, label }) => (
          <View key={name} style={[styles.iconCard, { backgroundColor: themeColors.muted }]}>
            <Icon size={24} color={themeColors.foreground} />
            <Text style={[styles.label, { color: themeColors.foreground }]}>{label}</Text>
            <Text style={[styles.name, { color: themeColors.mutedForeground }]}>{name}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 24,
  },
  description: {
    fontSize: 14,
    marginBottom: 24,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 24,
  },
  iconCard: {
    alignItems: 'center',
    width: 80,
    padding: 12,
    borderRadius: 8,
  },
  label: {
    fontSize: 11,
    marginTop: 8,
    fontWeight: '500',
  },
  name: {
    fontSize: 9,
    marginTop: 2,
  },
})

const meta: Meta = {
  title: 'Design System/Icons',
  component: IconGallery,
}

export default meta

type Story = StoryObj

export const Gallery: Story = {}
