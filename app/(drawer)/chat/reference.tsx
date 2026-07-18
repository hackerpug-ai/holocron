import { useQuery as useZeroQuery } from '@rocicorp/zero/react';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, View } from 'react-native';
import { ChatInput } from '@/components/chat/ChatInput';
import { type ChatMessage, ChatThread } from '@/components/chat/ChatThread';
import { Text } from '@/components/ui/text';
import { queries } from '../../zero/queries';

const platformUrl = process.env.EXPO_PUBLIC_PLATFORM_URL;
const rnApiKey = process.env.EXPO_PUBLIC_RN_API_KEY;
const conversationId = process.env.EXPO_PUBLIC_REFERENCE_CONVERSATION_ID;

async function waitForRun(runId: string): Promise<void> {
  if (!platformUrl || !rnApiKey) throw new Error('reference flow platform credentials are missing');
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const response = await fetch(`${platformUrl}/api/chat-runs/${runId}`, {
      headers: { Authorization: `Bearer ${rnApiKey}` },
    });
    if (!response.ok) throw new Error(`chat run status failed: ${response.status}`);
    const body = (await response.json()) as { status: string; error?: string };
    if (body.status === 'completed') return;
    if (['failed', 'blocked'].includes(body.status)) {
      throw new Error(body.error ?? `chat run ${body.status}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('chat run timed out');
}

export default function ReferenceChatScreen() {
  const [rawRows] = useZeroQuery(
    queries.chatMessages.byConversation({ conversationId: conversationId ?? '' })
  );
  const rows = rawRows as unknown as Array<{
    id: string;
    role: string;
    content: string | null;
    created_at: number;
  }>;
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestCounter = useRef(0);
  const messages: ChatMessage[] = rows.map((row) => ({
    id: row.id,
    role: row.role === 'agent' ? 'agent' : row.role === 'system' ? 'system' : 'user',
    content: row.content ?? '',
    message_type: 'text',
    createdAt: new Date(row.created_at),
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
        await waitForRun(body.runId);
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
        <ChatThread
          messages={messages}
          showTypingIndicator={sending}
          isLoading={false}
          testID="chat-thread"
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
