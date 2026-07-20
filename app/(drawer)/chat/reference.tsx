import { useQuery as useZeroQuery } from '@rocicorp/zero/react';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, View } from 'react-native';
import { ChatInput } from '@/components/chat/ChatInput';
import { Text } from '@/components/ui/text';
import { chatMessagesByConversation } from '../../zero/queries';

const platformUrl = process.env.EXPO_PUBLIC_PLATFORM_URL;
const rnApiKey = process.env.EXPO_PUBLIC_RN_API_KEY;
const conversationId = process.env.EXPO_PUBLIC_REFERENCE_CONVERSATION_ID;

type ReferenceMessage = {
  id: string;
  role: string;
  content: string | null;
  session_id?: string;
  created_at: number;
};

async function waitForDurableReply(
  readRows: () => ReferenceMessage[],
  runId: string
): Promise<void> {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    const reply = readRows().find(
      (row) =>
        row.role === 'agent' &&
        row.session_id === runId &&
        typeof row.content === 'string' &&
        row.content.trim().length > 0
    );
    if (reply) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('Zero-synced durable reply timed out');
}

export default function ReferenceChatScreen() {
  const [rawRows] = useZeroQuery(chatMessagesByConversation(conversationId ?? ''));
  const rows = (rawRows ?? []) as unknown as ReferenceMessage[];
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestCounter = useRef(0);
  const messages = rows.map((row) => ({
    id: row.id,
    role: row.role,
    content: row.content ?? '',
  }));

  const handleSend = useCallback(
    async (content: string) => {
      if (!platformUrl || !rnApiKey || !conversationId || sending) {
        setError('reference flow credentials or conversation are missing');
        return;
      }
      setSending(true);
      setError(null);
      requestCounter.current += 1;
      try {
        const response = await fetch(`${platformUrl}/api/chat-runs`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${rnApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            requestId: `s20-reference-${Date.now()}-${requestCounter.current}`,
            msg: content,
            conversationId,
          }),
        });
        if (!response.ok) throw new Error(`chat run create failed: ${response.status}`);
        const body = (await response.json()) as { runId?: string };
        if (!body.runId) throw new Error('chat run response omitted runId');
        await waitForDurableReply(() => rowsRef.current, body.runId);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setSending(false);
      }
    },
    [sending]
  );

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      testID="chat-screen"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View className="flex-1" testID="chat-thread">
        {rows.length === 0 && sending ? <ActivityIndicator testID="chat-loading-inline" /> : null}
        <FlatList
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          renderItem={({ item }) => (
            <View
              className={
                item.role === 'agent'
                  ? 'self-start rounded-2xl bg-muted p-3'
                  : 'self-end rounded-2xl bg-primary p-3'
              }
              testID={item.role === 'agent' ? 'chat-assistant-message' : `message-${item.id}`}
            >
              <Text
                className={item.role === 'agent' ? 'text-foreground' : 'text-primary-foreground'}
              >
                {item.content}
              </Text>
            </View>
          )}
        />
      </View>
      {error ? (
        <Text className="text-destructive" testID="error-banner">
          {error}
        </Text>
      ) : null}
      <ChatInput
        onSend={handleSend}
        disabled={sending}
        testID="chat-input"
        showVoiceButton={false}
      />
    </KeyboardAvoidingView>
  );
}
