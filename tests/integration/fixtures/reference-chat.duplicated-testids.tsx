/**
 * REDHAT-FIX-H6 AC-2 fixture — a deliberately WEAKENED reference-chat tree that
 * mounts TWO `chat-assistant-message` testIDs. The uniqueness audit must observe
 * length === 2 against this fixture (RED), proving it is not a stub. Do NOT use
 * this component in production — it exists only to regression-test the audit.
 */
import { Text, View } from 'react-native';

export default function DuplicatedTestIdsFixture() {
  return (
    <View testID="chat-screen">
      <View testID="chat-assistant-message">
        <Text>agent row one</Text>
      </View>
      <View testID="chat-assistant-message">
        <Text>agent row two (DUPLICATE — must be caught by the audit)</Text>
      </View>
    </View>
  );
}
