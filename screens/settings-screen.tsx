import { useZero, useQuery as useZeroQuery } from '@rocicorp/zero/react';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { voiceLanguage as voiceLanguageQuery } from '@/app/zero/queries';
import { SubscriptionSection } from '@/components/settings/SubscriptionSection';
import { Check, Globe, Monitor, Moon, Sun } from '@/components/ui/icons';
import { Text } from '@/components/ui/text';
import { colors } from '@/lib/theme';
import { getThemePreference, setThemePreference, type ThemeMode } from '@/lib/theme-preference';
import { useColorScheme } from '@/lib/useColorScheme';
import { cn } from '@/lib/utils';

interface ThemeOption {
  value: ThemeMode;
  label: string;
  description: string;
  icon: typeof Sun;
  previewColors: {
    background: string;
    foreground: string;
    accent: string;
  };
}

const THEME_OPTIONS: ThemeOption[] = [
  {
    value: 'light',
    label: 'Light',
    description: 'Clean, bright interface',
    icon: Sun,
    previewColors: {
      background: colors.light.background,
      foreground: colors.light.foreground,
      accent: colors.light.secondary,
    },
  },
  {
    value: 'dark',
    label: 'Dark',
    description: 'Deep navy archive aesthetic',
    icon: Moon,
    previewColors: {
      background: colors.dark.background,
      foreground: colors.dark.foreground,
      accent: colors.dark.border,
    },
  },
  {
    value: 'system',
    label: 'System',
    description: 'Matches device settings',
    icon: Monitor,
    previewColors: {
      // Mid blend of light/dark tokens for system preview swatches
      background: colors.dark.card,
      foreground: colors.dark.secondaryForeground,
      accent: colors.dark.muted,
    },
  },
];

const VOICE_LANGUAGE_OPTIONS = [
  'English',
  'Spanish',
  'French',
  'German',
  'Portuguese',
  'Japanese',
  'Korean',
  'Chinese',
] as const;

const VOICE_LANGUAGE_ROW_ID = 'app-settings-voice-language';
const DEFAULT_VOICE_LANGUAGE = 'English';

type AppSettingsRow = {
  id: string;
  key: string;
  value_json?: unknown;
};

type SettingsScreenProps = {};

/**
 * SettingsScreen - app preferences and theme customization
 *
 * Features live theme preview cards and smooth theme transitions.
 * Built with semantic tokens for full theme awareness.
 *
 * Voice language uses Zero `app_settings` (CAP-CUT-01 — no convex/react).
 */
export function SettingsScreen(_props: SettingsScreenProps) {
  const { colorScheme, setColorScheme } = useColorScheme();
  const [selectedTheme, setSelectedTheme] = useState<ThemeMode>(
    colorScheme === 'dark' ? 'dark' : 'light'
  );
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    void getThemePreference().then((mode) => {
      if (!mode) return;
      setSelectedTheme(mode);
      setColorScheme(mode);
    });
  }, [setColorScheme]);
  const zero = useZero();
  const [voiceLanguageRow] = useZeroQuery(voiceLanguageQuery());
  const settingsRow = (voiceLanguageRow ?? null) as AppSettingsRow | null;
  const voiceLanguage =
    typeof settingsRow?.value_json === 'string' && settingsRow.value_json.length > 0
      ? settingsRow.value_json
      : DEFAULT_VOICE_LANGUAGE;

  const handleLanguageChange = (language: string) => {
    const now = Date.now();
    const persist = async () => {
      if (settingsRow?.id) {
        await zero.mutate.app_settings.update({
          id: settingsRow.id,
          value_json: language,
          updated_at: now,
        });
      } else {
        await zero.mutate.app_settings.insert({
          id: VOICE_LANGUAGE_ROW_ID,
          key: 'voice_language',
          value_json: language,
          created_at: now,
          updated_at: now,
        });
      }
    };
    void persist().catch((err) => {
      console.error('Failed to save voice language:', err);
    });
  };

  const handleThemeChange = async (value: ThemeMode) => {
    if (value === selectedTheme || isTransitioning) return;

    setIsTransitioning(true);
    setSelectedTheme(value);

    // Apply theme change with smooth transition
    setColorScheme(value);
    void setThemePreference(value);

    // Allow transition to complete
    setTimeout(() => setIsTransitioning(false), 300);
  };

  const ThemePreviewCard = ({
    option,
    isSelected,
  }: {
    option: ThemeOption;
    isSelected: boolean;
  }) => {
    const Icon = option.icon;

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
          {/* Preview background driven by theme tokens */}
          <View
            className="absolute inset-0 transition-colors duration-500"
            style={{ backgroundColor: option.previewColors.background }}
          />
          {/* Preview content bars */}
          <View className="absolute inset-0 flex-col gap-2 p-3">
            <View
              className="h-2 w-3/4 rounded-full transition-colors duration-500"
              style={{ backgroundColor: option.previewColors.foreground }}
            />
            <View
              className="h-2 w-1/2 rounded-full transition-colors duration-500"
              style={{ backgroundColor: option.previewColors.foreground }}
            />
            <View className="mt-auto flex flex-row gap-2">
              <View
                className="h-6 w-16 rounded-lg transition-colors duration-500"
                style={{ backgroundColor: option.previewColors.accent }}
              />
              <View
                className="flex-1 h-6 rounded-lg transition-colors duration-500"
                style={{ backgroundColor: option.previewColors.accent }}
              />
            </View>
          </View>

          {/* Selected indicator overlay */}
          {isSelected && <View className="absolute inset-0 bg-primary/10" />}
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
                isSelected ? 'border-primary bg-primary' : 'border-muted-foreground/30'
              )}
            >
              {isSelected && (
                <Check size={14} className="text-primary-foreground" strokeWidth={3} />
              )}
            </View>
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="p-4 gap-6"
      showsVerticalScrollIndicator={false}
      testID="settings-screen"
    >
      {/* Subscriptions Section */}
      <SubscriptionSection testID="settings-subscription-section" />

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

      {/* Voice Language Section */}
      <View className="gap-3">
        {/* Section title with icon */}
        <View className="flex-row items-center gap-2 px-1">
          <View className="rounded-lg bg-primary/10 p-2">
            <Globe size={16} className="text-primary" />
          </View>
          <Text variant="h2" className="text-foreground">
            Voice Language
          </Text>
        </View>

        {/* Section description */}
        <Text variant="default" className="px-1 text-muted-foreground">
          Choose the language the voice assistant responds in.
        </Text>

        {/* Language options */}
        <View className="gap-1 pt-2 rounded-2xl border border-border bg-card overflow-hidden">
          {VOICE_LANGUAGE_OPTIONS.map((lang, index) => {
            const isSelected = voiceLanguage === lang;
            return (
              <Pressable
                key={lang}
                onPress={() => handleLanguageChange(lang)}
                className={cn(
                  'flex-row items-center justify-between px-4 py-3',
                  'active:bg-muted/50',
                  index < VOICE_LANGUAGE_OPTIONS.length - 1 && 'border-b border-border'
                )}
                testID={`voice-language-${lang.toLowerCase()}`}
              >
                <Text
                  variant="default"
                  className={cn(isSelected ? 'text-foreground' : 'text-muted-foreground')}
                >
                  {lang}
                </Text>
                <View
                  className={cn(
                    'h-5 w-5 rounded-full border-2 items-center justify-center',
                    isSelected ? 'border-primary bg-primary' : 'border-muted-foreground/30'
                  )}
                >
                  {isSelected && (
                    <Check size={12} className="text-primary-foreground" strokeWidth={3} />
                  )}
                </View>
              </Pressable>
            );
          })}
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
          The preview cards above show how each theme affects colors and contrast. Dark mode uses
          the "Crystalline Archive" palette with deep navy backgrounds and warm amber accents.
        </Text>
      </View>
    </ScrollView>
  );
}
