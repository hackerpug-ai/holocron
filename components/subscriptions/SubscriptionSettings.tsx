/**
 * SubscriptionSettings - Subscription preferences component
 *
 * Provides settings UI for subscription preferences including:
 * - Content ranking preferences
 * - Feedback history management
 * - Personalization options
 */

import React from 'react'
import { View, ScrollView, StyleSheet, type ViewStyle } from 'react-native'
import { Text } from '@/components/ui/text'
import { Switch } from '@/components/ui/switch'
import { useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'

export interface SubscriptionSettingsProps {
  /** Optional test ID for testing */
  testID?: string
}

export function SubscriptionSettings({
  testID = 'subscription-settings',
}: SubscriptionSettingsProps) {
  // Mutation to update preferences (reserved for future use)
  useMutation(api.subscriptions.feedback.submitFeedback)

  const handlePreferenceChange = async (key: string, value: boolean) => {
    // In a real implementation, this would update user preferences
    // For now, we're just showing the UI structure
    console.log(`Preference ${key} changed to ${value}`)
  }

  return (
    <ScrollView
      style={styles.container}
      testID={testID}
      contentContainerStyle={styles.content}
    >
      <Text variant="h4" style={styles.sectionTitle} testID={`${testID}-ranking-title`}>
        Content Ranking
      </Text>

      <View style={styles.settingRow} testID={`${testID}-personalized-row`}>
        <View style={styles.settingLabel}>
          <Text variant="p">Personalized feed</Text>
          <Text variant="muted" style={styles.settingDescription}>
            Use your feedback to improve content relevance
          </Text>
        </View>
        <Switch
          checked={true}
          onCheckedChange={(value) => handlePreferenceChange('personalized', value)}
          testID={`${testID}-personalized-switch`}
        />
      </View>

      <View style={styles.settingRow} testID={`${testID}-feedback-row`}>
        <View style={styles.settingLabel}>
          <Text variant="p">Track feedback</Text>
          <Text variant="muted" style={styles.settingDescription}>
            Remember your "more/less like this" choices
          </Text>
        </View>
        <Switch
          checked={true}
          onCheckedChange={(value) => handlePreferenceChange('trackFeedback', value)}
          testID={`${testID}-feedback-switch`}
        />
      </View>

      <Text variant="h4" style={styles.sectionTitle} testID={`${testID}-display-title`}>
        Display Options
      </Text>

      <View style={styles.settingRow} testID={`${testID}-show-feedback-row`}>
        <View style={styles.settingLabel}>
          <Text variant="p">Show feedback buttons</Text>
          <Text variant="muted" style={styles.settingDescription}>
            Display thumbs up/down on content cards
          </Text>
        </View>
        <Switch
          checked={true}
          onCheckedChange={(value) => handlePreferenceChange('showFeedback', value)}
          testID={`${testID}-show-feedback-switch`}
        />
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  } as ViewStyle,
  content: {
    padding: 16,
  },
  sectionTitle: {
    marginTop: 16,
    marginBottom: 12,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
  },
  settingLabel: {
    flex: 1,
    gap: 4,
  },
  settingDescription: {
    opacity: 0.7,
    fontSize: 12,
  },
})

/**
 * Memoized version for performance optimization
 */
export const SubscriptionSettingsMemo = React.memo(SubscriptionSettings)
