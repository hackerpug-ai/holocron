import { View, ScrollView, StyleSheet, type ViewStyle } from 'react-native'
import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useMutation, useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'

export interface FeedSettings {
  // Notification preferences
  enablePushNotifications: boolean
  enableInAppNotifications: boolean
  // Display options
  showThumbnails: boolean
  autoPlayVideos: boolean
  // Content filter
  contentFilter: 'all' | 'videos-only' | 'blogs-only'
}

interface SubscriptionSettingsModalProps {
  /** Whether modal is visible */
  visible: boolean
  /** Callback to close modal */
  onDismiss: () => void
  /** Navigate to subscriptions management */
  onManageSubscriptions: () => void
  /** Test ID for testing */
  testID?: string
}

export function SubscriptionSettingsModal({
  visible,
  onDismiss,
  onManageSubscriptions,
  testID = 'settings-modal',
}: SubscriptionSettingsModalProps) {
  // Fetch current settings with default values
  const settings = useQuery(api.feeds.queries.getFeedSettings, {})

  // Mutation to update settings
  const updateSettings = useMutation(api.feeds.mutations.updateFeedSettings)

  const currentSettings: FeedSettings = {
    enablePushNotifications: settings?.enablePushNotifications ?? false,
    enableInAppNotifications: settings?.enableInAppNotifications ?? false,
    showThumbnails: settings?.showThumbnails ?? true,
    autoPlayVideos: settings?.autoPlayVideos ?? false,
    contentFilter: settings?.contentFilter ?? 'all',
  }

  const handleSettingChange = async (key: keyof FeedSettings, value: any) => {
    await updateSettings({ [key]: value })
  }

  return (
    <Dialog open={visible} onOpenChange={(open) => !open && onDismiss()}>
      <DialogContent testID={testID} className="max-w-md">
        <DialogHeader>
          <DialogTitle>Feed Settings</DialogTitle>
          <DialogDescription>
            Configure your feed preferences, notifications, and display options
          </DialogDescription>
        </DialogHeader>

        <ScrollView style={styles.content}>
          {/* Notification Preferences Section */}
          <Text variant="h4" style={styles.sectionTitle} testID={`${testID}-notifications-title`}>
            Notifications
          </Text>

          <View style={styles.settingRow} testID={`${testID}-push-row`}>
            <View style={styles.settingLabel}>
              <Text variant="p">Push notifications</Text>
              <Text variant="muted" style={styles.settingDescription}>
                Get notified of new content
              </Text>
            </View>
            <Switch
              checked={currentSettings.enablePushNotifications}
              onCheckedChange={(value) => handleSettingChange('enablePushNotifications', value)}
              testID={`${testID}-push-switch`}
            />
          </View>

          <View style={styles.settingRow} testID={`${testID}-inapp-row`}>
            <View style={styles.settingLabel}>
              <Text variant="p">In-app notifications</Text>
              <Text variant="muted" style={styles.settingDescription}>
                Show badges and banners
              </Text>
            </View>
            <Switch
              checked={currentSettings.enableInAppNotifications}
              onCheckedChange={(value) => handleSettingChange('enableInAppNotifications', value)}
              testID={`${testID}-inapp-switch`}
            />
          </View>

          {/* Display Options Section */}
          <Text variant="h4" style={styles.sectionTitle} testID={`${testID}-display-title`}>
            Display
          </Text>

          <View style={styles.settingRow} testID={`${testID}-thumbnails-row`}>
            <View style={styles.settingLabel}>
              <Text variant="p">Show thumbnails</Text>
              <Text variant="muted" style={styles.settingDescription}>
                Display image thumbnails in feed
              </Text>
            </View>
            <Switch
              checked={currentSettings.showThumbnails}
              onCheckedChange={(value) => handleSettingChange('showThumbnails', value)}
              testID={`${testID}-thumbnails-switch`}
            />
          </View>

          <View style={styles.settingRow} testID={`${testID}-autoplay-row`}>
            <View style={styles.settingLabel}>
              <Text variant="p">Auto-play videos</Text>
              <Text variant="muted" style={styles.settingDescription}>
                Automatically play video previews
              </Text>
            </View>
            <Switch
              checked={currentSettings.autoPlayVideos}
              onCheckedChange={(value) => handleSettingChange('autoPlayVideos', value)}
              testID={`${testID}-autoplay-switch`}
            />
          </View>

          {/* Content Filter Section */}
          <Text variant="h4" style={styles.sectionTitle} testID={`${testID}-filter-title`}>
            Content Filter
          </Text>

          <RadioGroup
            value={currentSettings.contentFilter}
            onValueChange={(value) => handleSettingChange('contentFilter', value as FeedSettings['contentFilter'])}
            testID={`${testID}-content-filter`}
          >
            <View style={styles.radioRow}>
              <RadioGroupItem value="all" testID={`${testID}-filter-all`} />
              <Text variant="p" style={styles.radioLabel}>All content</Text>
            </View>
            <View style={styles.radioRow}>
              <RadioGroupItem value="videos-only" testID={`${testID}-filter-videos`} />
              <Text variant="p" style={styles.radioLabel}>Videos only</Text>
            </View>
            <View style={styles.radioRow}>
              <RadioGroupItem value="blogs-only" testID={`${testID}-filter-blogs`} />
              <Text variant="p" style={styles.radioLabel}>Blogs only</Text>
            </View>
          </RadioGroup>
        </ScrollView>

        <DialogFooter>
          <Button variant="ghost" onPress={onDismiss} testID={`${testID}-close-button`}>
            <Text>Close</Text>
          </Button>
          <Button onPress={onManageSubscriptions} testID={`${testID}-manage-button`}>
            <Text>Manage Subscriptions</Text>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const styles = StyleSheet.create({
  content: {
    maxHeight: 400,
  } as ViewStyle,
  sectionTitle: {
    marginTop: 16,
    marginBottom: 12,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  settingLabel: {
    flex: 1,
    gap: 2,
  },
  settingDescription: {
    opacity: 0.7,
  },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  radioLabel: {
    marginLeft: 4,
  },
})
