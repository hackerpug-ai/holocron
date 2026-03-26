/**
 * SubscriptionSettingsModal - Feed settings modal (PLACEHOLDER for FR-027)
 *
 * This is a minimal placeholder modal to allow FR-028 to complete.
 * The full settings implementation with all controls will be added in FR-027.
 */
import { View, StyleSheet, Modal, type ViewStyle } from 'react-native'
import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/EmptyState'
import { Wrench } from '@/components/ui/icons'

interface SubscriptionSettingsModalProps {
  visible: boolean
  onDismiss: () => void
  onManageSubscriptions: () => void
  testID?: string
}

export function SubscriptionSettingsModal({
  visible,
  onDismiss,
  onManageSubscriptions,
  testID = 'settings-modal',
}: SubscriptionSettingsModalProps) {
  return (
    <Modal
      visible={visible}
      onRequestClose={onDismiss}
      animationType="slide"
      testID={testID}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text variant="h2" style={styles.title}>Feed Settings</Text>
        </View>

        <View style={styles.content}>
          <EmptyState
            icon={Wrench}
            title="Settings Coming Soon"
            description="Feed settings will be added in FR-027. This will include notification preferences, display options, and content filters."
            size="lg"
          />
        </View>

        <View style={styles.actions}>
          <Button
            variant="outline"
            onPress={onDismiss}
            testID={`${testID}-close-button`}
            style={styles.button}
          >
            <Text>Close</Text>
          </Button>
          <Button
            onPress={onManageSubscriptions}
            testID={`${testID}-manage-button`}
            style={styles.button}
          >
            <Text>Manage Subscriptions</Text>
          </Button>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  } as ViewStyle,
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    padding: 16,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
  },
  button: {
    flex: 1,
  },
})
