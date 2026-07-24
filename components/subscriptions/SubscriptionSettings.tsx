/**
 * SubscriptionSettings - Subscription preferences component
 *
 * Provides settings UI for subscription preferences including:
 * - Content ranking preferences
 * - Feedback history management
 * - Personalization options
 *
 * Preference persistence is local UI for now; feed-item feedback writes go
 * through Zero mutators on the cards (useFeedItemFeedback).
 */

import React from 'react';
import { ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { Switch } from '@/components/ui/switch';
import { Text } from '@/components/ui/text';

export interface SubscriptionSettingsProps {
  /** Optional test ID for testing */
  testID?: string;
}

export function SubscriptionSettings({
  testID = 'subscription-settings',
}: SubscriptionSettingsProps) {
  const handlePreferenceChange = async (key: string, value: boolean) => {
    // Preference store lands with app_settings Zero mutators when productized.
    console.log(`Preference ${key} changed to ${value}`);
  };

  return (
    <ScrollView style={styles.container} testID={testID} contentContainerStyle={styles.content}>
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
            Remember your &quot;more/less like this&quot; choices
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
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  } as ViewStyle,
  content: {
    padding: 16,
  } as ViewStyle,
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
});

/**
 * Memoized version for performance optimization
 */
export const SubscriptionSettingsMemo = React.memo(SubscriptionSettings);
