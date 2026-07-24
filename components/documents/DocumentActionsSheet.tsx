import * as Haptics from 'expo-haptics';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Globe, Megaphone, MessageSquarePlus, Share2 } from '@/components/ui/icons';
import { Text } from '@/components/ui/text';

export interface DocumentActionsSheetProps {
  visible: boolean;
  onClose: () => void;
  onListenPress: () => void;
  onSharePress: () => void;
  onAddToChatPress: () => void;
  isNarrationActive: boolean;
  isPublic?: boolean;
  testID?: string;
}

/**
 * Bottom sheet with document actions: Listen, Add to Chat, Share.
 *
 * Simplified (GATE-FIX-005/run2): plain Modal + View hierarchy so Maestro/XCUITest
 * can see document-actions-sheet and document-actions-sheet-share. Prior Reanimated
 * + GestureHandler sheet left button taps COMPLETED but sheet never in hierarchy.
 */
export function DocumentActionsSheet({
  visible,
  onClose,
  onListenPress,
  onSharePress,
  onAddToChatPress,
  isNarrationActive,
  isPublic = false,
  testID = 'document-actions-sheet',
}: DocumentActionsSheetProps) {
  const insets = useSafeAreaInsets();

  const handleAction = (action: () => void) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
    setTimeout(action, 200);
  };

  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View
        testID={testID}
        accessibilityViewIsModal
        accessibilityLabel="Document actions"
        collapsable={false}
        style={styles.root}
      >
        <Pressable
          onPress={onClose}
          testID={`${testID}-backdrop`}
          style={StyleSheet.absoluteFillObject}
          accessibilityLabel="Dismiss document actions"
        />
        <View
          testID={`${testID}-panel`}
          collapsable={false}
          className="rounded-t-2xl border-t border-border bg-card px-6 pt-4"
          style={{ paddingBottom: insets.bottom + 16 }}
        >
          <View className="mb-4 items-center">
            <View className="h-1 w-10 rounded-full bg-muted-foreground/30" />
          </View>

          <Pressable
            testID={`${testID}-listen`}
            onPress={() => handleAction(onListenPress)}
            className="flex-row items-center gap-4 rounded-xl px-4 py-3.5 active:bg-muted"
            accessibilityRole="button"
            accessibilityLabel={isNarrationActive ? 'Stop Listening' : 'Listen'}
          >
            <View
              className={
                isNarrationActive ? 'rounded-full bg-primary/15 p-2' : 'rounded-full bg-muted p-2'
              }
            >
              <Megaphone
                size={20}
                className={isNarrationActive ? 'text-primary' : 'text-foreground'}
              />
            </View>
            <View className="flex-1">
              <Text className="text-foreground text-base font-medium">
                {isNarrationActive ? 'Stop Listening' : 'Listen'}
              </Text>
              <Text className="text-muted-foreground text-sm">
                {isNarrationActive
                  ? 'Exit audio narration mode'
                  : 'Have this document read aloud'}
              </Text>
            </View>
          </Pressable>

          <Pressable
            testID={`${testID}-add-to-chat`}
            onPress={() => handleAction(onAddToChatPress)}
            className="flex-row items-center gap-4 rounded-xl px-4 py-3.5 active:bg-muted"
            accessibilityRole="button"
            accessibilityLabel="Add to Chat"
          >
            <View className="rounded-full bg-primary/15 p-2">
              <MessageSquarePlus size={20} className="text-primary" />
            </View>
            <View className="flex-1">
              <Text className="text-foreground text-base font-medium">Add to Chat</Text>
              <Text className="text-muted-foreground text-sm">
                Discuss this document in a conversation
              </Text>
            </View>
          </Pressable>

          <Pressable
            testID={`${testID}-share`}
            onPress={() => handleAction(onSharePress)}
            className="flex-row items-center gap-4 rounded-xl px-4 py-3.5 active:bg-muted"
            accessibilityRole="button"
            accessibilityLabel={isPublic ? 'Shared' : 'Share'}
          >
            <View
              className={
                isPublic ? 'rounded-full bg-primary/15 p-2' : 'rounded-full bg-muted p-2'
              }
            >
              {isPublic ? (
                <Globe size={20} className="text-primary" />
              ) : (
                <Share2 size={20} className="text-foreground" />
              )}
            </View>
            <View className="flex-1">
              <Text className="text-foreground text-base font-medium">
                {isPublic ? 'Shared' : 'Share'}
              </Text>
              <Text className="text-muted-foreground text-sm">
                {isPublic ? 'Manage or copy share link' : 'Publish and share this document'}
              </Text>
            </View>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
});
