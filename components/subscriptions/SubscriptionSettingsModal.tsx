import { useZero, useQuery as useZeroQuery } from '@rocicorp/zero/react';
import { ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { feedSettings as feedSettingsQuery } from '@/app/zero/queries';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { Text } from '@/components/ui/text';

export interface FeedSettings {
  // Notification preferences
  enablePushNotifications: boolean;
  enableInAppNotifications: boolean;
  // Display options
  showThumbnails: boolean;
  autoPlayVideos: boolean;
  // Content filter
  contentFilter: 'all' | 'videos-only' | 'blogs-only';
}

interface SubscriptionSettingsModalProps {
  /** Whether modal is visible */
  visible: boolean;
  /** Callback to close modal */
  onDismiss: () => void;
  /** Navigate to subscriptions management */
  onManageSubscriptions: () => void;
  /** Test ID for testing */
  testID?: string;
}

type AppSettingsRow = {
  id: string;
  key: string;
  value_json?: unknown;
  updated_at?: number | null;
  created_at: number;
};

const DEFAULT_SETTINGS: FeedSettings = {
  enablePushNotifications: false,
  enableInAppNotifications: false,
  showThumbnails: true,
  autoPlayVideos: false,
  contentFilter: 'all',
};

const FEED_SETTINGS_ROW_ID = 'app-settings-feed-settings';

function parseSettings(value: unknown): FeedSettings {
  if (value == null || typeof value !== 'object') return { ...DEFAULT_SETTINGS };
  const v = value as Partial<FeedSettings>;
  return {
    enablePushNotifications: v.enablePushNotifications ?? DEFAULT_SETTINGS.enablePushNotifications,
    enableInAppNotifications:
      v.enableInAppNotifications ?? DEFAULT_SETTINGS.enableInAppNotifications,
    showThumbnails: v.showThumbnails ?? DEFAULT_SETTINGS.showThumbnails,
    autoPlayVideos: v.autoPlayVideos ?? DEFAULT_SETTINGS.autoPlayVideos,
    contentFilter: v.contentFilter ?? DEFAULT_SETTINGS.contentFilter,
  };
}

export function SubscriptionSettingsModal({
  visible,
  onDismiss,
  onManageSubscriptions,
  testID = 'settings-modal',
}: SubscriptionSettingsModalProps) {
  const zero = useZero();
  const [settingsRow] = useZeroQuery(feedSettingsQuery());
  const row = (settingsRow ?? null) as AppSettingsRow | null;
  const currentSettings = parseSettings(row?.value_json);

  const handleSettingChange = async (key: keyof FeedSettings, value: FeedSettings[typeof key]) => {
    const next: FeedSettings = { ...currentSettings, [key]: value };
    // Serialize through JSON so the value is a plain ReadonlyJSONValue for Zero mutators.
    const valueJson = JSON.parse(JSON.stringify(next)) as {
      enablePushNotifications: boolean;
      enableInAppNotifications: boolean;
      showThumbnails: boolean;
      autoPlayVideos: boolean;
      contentFilter: string;
    };
    const now = Date.now();
    if (row?.id) {
      await zero.mutate.app_settings.update({
        id: row.id,
        value_json: valueJson,
        updated_at: now,
      });
    } else {
      await zero.mutate.app_settings.insert({
        id: FEED_SETTINGS_ROW_ID,
        key: 'feed_settings',
        value_json: valueJson,
        created_at: now,
        updated_at: now,
      });
    }
  };

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
            onValueChange={(value) =>
              handleSettingChange('contentFilter', value as FeedSettings['contentFilter'])
            }
            testID={`${testID}-content-filter`}
          >
            <View style={styles.radioRow}>
              <RadioGroupItem value="all" testID={`${testID}-filter-all`} />
              <Text variant="p" style={styles.radioLabel}>
                All content
              </Text>
            </View>
            <View style={styles.radioRow}>
              <RadioGroupItem value="videos-only" testID={`${testID}-filter-videos`} />
              <Text variant="p" style={styles.radioLabel}>
                Videos only
              </Text>
            </View>
            <View style={styles.radioRow}>
              <RadioGroupItem value="blogs-only" testID={`${testID}-filter-blogs`} />
              <Text variant="p" style={styles.radioLabel}>
                Blogs only
              </Text>
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
  );
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
});
