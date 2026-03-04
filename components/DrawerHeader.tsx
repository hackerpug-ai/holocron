import { Text } from '@/components/ui/text'
import { NavTaskLoader } from '@/components/nav/NavTaskLoader'
import { cn } from '@/lib/utils'
import { BookOpen, MessageSquare, PenSquare, Search, Settings } from 'lucide-react-native'
import { Pressable, TextInput, View, type ViewProps } from 'react-native'

/** Navigation section item */
export interface NavSection {
  id: string
  label: string
  icon: React.ReactNode
  onPress?: () => void
}

interface DrawerHeaderProps extends Omit<ViewProps, 'children'> {
  /** Current search query */
  searchQuery?: string
  /** Callback when search query changes */
  onSearchChange?: (_query: string) => void
  /** Callback when New Chat button is pressed */
  onNewChatPress?: () => void
  /** Navigation sections to display before conversations */
  sections?: NavSection[]
  /** Whether there are active long-running tasks */
  hasActiveTasks?: boolean
}

const defaultSections: NavSection[] = [
  { id: 'holocron', label: 'Holocron', icon: <MessageSquare size={20} /> },
  { id: 'articles', label: 'Articles', icon: <BookOpen size={20} /> },
  { id: 'settings', label: 'Settings', icon: <Settings size={20} /> },
]

/**
 * DrawerHeader displays the top section of the navigation drawer.
 * Contains a search bar with compose icon and app section links.
 * Matches the ChatGPT drawer pattern.
 */
export function DrawerHeader({
  searchQuery = '',
  onSearchChange,
  onNewChatPress,
  sections = defaultSections,
  hasActiveTasks = false,
  className,
  ...props
}: DrawerHeaderProps) {
  return (
    <View
      className={cn('gap-1 px-3 pb-2 pt-3', className)}
      testID="drawer-header"
      {...props}
    >
      {/* Search Bar + Compose Icon Row */}
      <View className="mb-2 flex-row items-center gap-2">
        {/* Search Input */}
        <View className="bg-muted/50 flex-1 flex-row items-center gap-2 rounded-xl px-3 py-2.5">
          <Search size={18} className="text-muted-foreground" />
          <TextInput
            value={searchQuery}
            onChangeText={onSearchChange}
            placeholder="Search"
            placeholderTextColor="hsl(215, 20%, 55%)"
            className="text-foreground flex-1 text-base"
            testID="drawer-search-input"
            accessibilityLabel="Search conversations"
            accessibilityRole="search"
          />
          {/* Task Loader Indicator */}
          <NavTaskLoader hasActiveTasks={hasActiveTasks} />
        </View>

        {/* Compose/New Chat Circle Button */}
        <Pressable
          onPress={onNewChatPress}
          className="bg-muted/50 h-11 w-11 items-center justify-center rounded-xl active:bg-muted"
          testID="drawer-new-chat-button"
          accessibilityRole="button"
          accessibilityLabel="Create new chat"
          accessibilityHint="Double tap to start a new conversation"
        >
          <PenSquare size={20} className="text-foreground" />
        </Pressable>
      </View>

      {/* App Sections */}
      <View className="gap-0.5" accessibilityRole="menu">
        {sections.map((section) => (
          <Pressable
            key={section.id}
            onPress={section.onPress}
            className="flex-row items-center gap-3 rounded-lg px-3 py-2.5 active:bg-muted"
            testID={`drawer-section-${section.id}`}
            accessibilityRole="menuitem"
            accessibilityLabel={`Navigate to ${section.label}`}
          >
            <View className="text-foreground">{section.icon}</View>
            <Text className="text-foreground text-base">{section.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  )
}
