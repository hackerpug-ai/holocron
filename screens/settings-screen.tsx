import { View, ScrollView, Pressable, type ViewProps } from 'react-native'
import { Text } from '@/components/ui/text'
import { SectionHeader } from '@/components/SectionHeader'
import { cn } from '@/lib/utils'
import { useColorScheme } from '@/lib/useColorScheme'
import { useState } from 'react'
import { Check, Sun, Moon, Monitor } from '@/components/ui/icons'

type ThemeMode = 'light' | 'dark' | 'system'

interface ThemeOption {
  value: ThemeMode
  label: string
  description: string
  icon: typeof Sun
  previewColors: {
    background: string
    foreground: string
    accent: string
  }
}

const THEME_OPTIONS: ThemeOption[] = [
  {
    value: 'light',
    label: 'Light',
    description: 'Clean, bright interface',
    icon: Sun,
    previewColors: {
      background: 'bg-white',
      foreground: 'bg-slate-900',
      accent: 'bg-slate-200',
    },
  },
  {
    value: 'dark',
    label: 'Dark',
    description: 'Deep navy archive aesthetic',
    icon: Moon,
    previewColors: {
      background: 'bg-[#0A0E14]',
      foreground: 'bg-[#E8E4DE]',
      accent: 'bg-[#1E2A3B]',
    },
  },
  {
    value: 'system',
    label: 'System',
    description: 'Matches device settings',
    icon: Monitor,
    previewColors: {
      background: 'bg-gradient-to-br from-white to-[#0A0E14]',
      foreground: 'bg-gradient-to-br from-slate-900 to-[#E8E4DE]',
      accent: 'bg-gradient-to-br from-slate-200 to-[#1E2A3B]',
    },
  },
]

interface SettingsScreenProps extends Omit<ViewProps, 'children'> {}

/**
 * SettingsScreen - app preferences and theme customization
 *
 * Features live theme preview cards and smooth theme transitions.
 * Built with semantic tokens for full theme awareness.
 */
export function SettingsScreen({ className, ...props }: SettingsScreenProps) {
  const { colorScheme, setColorScheme } = useColorScheme()
  const [selectedTheme, setSelectedTheme] = useState<ThemeMode>(
    colorScheme === 'dark' ? 'dark' : 'light'
  )
  const [isTransitioning, setIsTransitioning] = useState(false)

  const handleThemeChange = async (value: ThemeMode) => {
    if (value === selectedTheme || isTransitioning) return

    setIsTransitioning(true)
    setSelectedTheme(value)

    // Apply theme change with smooth transition
    if (value === 'system') {
      // Reset to system default - will be handled by ThemeSync
      setColorScheme('light') // Reset to let system take over
    } else {
      setColorScheme(value)
    }

    // Allow transition to complete
    setTimeout(() => setIsTransitioning(false), 300)
  }

  const ThemePreviewCard = ({ option, isSelected }: { option: ThemeOption; isSelected: boolean }) => {
    const Icon = option.icon

    return (
      <Pressable
        onPress={() => handleThemeChange(option.value)}
        className={cn(
          'relative overflow-hidden rounded-2xl border transition-all duration-300',
          'active:scale-[0.98]',
          isSelected
            ? 'border-primary shadow-lg shadow-primary/20'
            : 'border-border opacity-80 active:opacity-100'
        )}
        testID={`theme-option-${option.value}`}
      >
        {/* Live preview area */}
        <View className="h-24 w-full">
          {/* Preview background with gradient overlay */}
          <View
            className={cn(
              'absolute inset-0 transition-colors duration-500',
              option.previewColors.background
            )}
          />
          {/* Preview content bars */}
          <View className="absolute inset-0 flex-col gap-2 p-3">
            <View
              className={cn(
                'h-2 w-3/4 rounded-full transition-colors duration-500',
                option.previewColors.foreground
              )}
            />
            <View
              className={cn(
                'h-2 w-1/2 rounded-full transition-colors duration-500',
                option.previewColors.foreground
              )}
            />
            <View className="mt-auto flex flex-row gap-2">
              <View
                className={cn(
                  'h-6 w-16 rounded-lg transition-colors duration-500',
                  option.previewColors.accent
                )}
              />
              <View
                className={cn(
                  'flex-1 h-6 rounded-lg transition-colors duration-500',
                  option.previewColors.accent
                )}
              />
            </View>
          </View>

          {/* Selected indicator overlay */}
          {isSelected && (
            <View className="absolute inset-0 bg-primary/10" />
          )}
        </View>

        {/* Theme info */}
        <View className="border-t border-border p-4 bg-card">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-3">
              <View
                className={cn(
                  'rounded-lg p-2 transition-colors duration-300',
                  isSelected ? 'bg-primary/10' : 'bg-muted'
                )}
              >
                <Icon
                  size={18}
                  className={cn(
                    'transition-colors duration-300',
                    isSelected ? 'text-primary' : 'text-muted-foreground'
                  )}
                />
              </View>
              <View>
                <Text
                  variant="h3"
                  className={cn(
                    'transition-colors duration-300',
                    isSelected ? 'text-foreground' : 'text-muted-foreground'
                  )}
                >
                  {option.label}
                </Text>
                <Text
                  variant="small"
                  className={cn(
                    'mt-0.5 transition-colors duration-300',
                    isSelected ? 'text-muted-foreground' : 'text-muted-foreground/70'
                  )}
                >
                  {option.description}
                </Text>
              </View>
            </View>

            {/* Radio indicator */}
            <View
              className={cn(
                'h-6 w-6 rounded-full border-2 transition-all duration-300 items-center justify-center',
                isSelected
                  ? 'border-primary bg-primary'
                  : 'border-muted-foreground/30'
              )}
            >
              {isSelected && (
                <Check size={14} className="text-primary-foreground" strokeWidth={3} />
              )}
            </View>
          </View>
        </View>
      </Pressable>
    )
  }

  return (
    <View
      className={cn('flex-1 bg-background', className)}
      testID="settings-screen"
      {...props}
    >
      {/* Header */}
      <SectionHeader
        title="Settings"
        className="border-b border-border px-4 pb-4"
      />

      {/* Settings content */}
      <ScrollView
        className="flex-1"
        contentContainerClassName="p-4 gap-6"
        showsVerticalScrollIndicator={false}
      >
        {/* Theme Section */}
        <View className="gap-3">
          {/* Section title with icon */}
          <View className="flex-row items-center gap-2 px-1">
            <View className="rounded-lg bg-primary/10 p-2">
              <Monitor size={16} className="text-primary" />
            </View>
            <Text variant="h2" className="text-foreground">
              Appearance
            </Text>
          </View>

          {/* Section description */}
          <Text variant="default" className="px-1 text-muted-foreground">
            Customize your interface theme. Changes apply immediately.
          </Text>

          {/* Theme options grid */}
          <View className="gap-3 pt-2">
            {THEME_OPTIONS.map((option) => (
              <ThemePreviewCard
                key={option.value}
                option={option}
                isSelected={selectedTheme === option.value}
              />
            ))}
          </View>
        </View>

        {/* Info section */}
        <View className="mt-auto gap-3 rounded-2xl border border-border bg-card p-4">
          <View className="flex-row items-center gap-2">
            <View className="h-2 w-2 rounded-full bg-primary" />
            <Text variant="h3" className="text-foreground">
              Theme Preview
            </Text>
          </View>
          <Text variant="small" className="text-muted-foreground leading-relaxed">
            The preview cards above show how each theme affects colors and contrast.
            Dark mode uses the "Crystalline Archive" palette with deep navy backgrounds
            and warm amber accents.
          </Text>
        </View>
      </ScrollView>
    </View>
  )
}
