import { useLocalSearchParams, useRouter } from 'expo-router';
import { CheckCircle2, XCircle } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { postMission } from '@/app/zero/platform';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/hooks/use-theme';

type AddToolParams = {
  title: string;
  description: string;
  category: string;
  sourceUrl: string;
  sourceType: string;
  language?: string;
  tags?: string;
  useCases?: string;
};

type MissionResult = Awaited<ReturnType<typeof postMission>>;

// A deep link can briefly mount this modal twice while Expo reconciles its
// initial URL with the URL event. Coalesce only that burst: a later deliberate
// re-open still calls the server and receives its durable replay result.
const recentAddsBySourceUrl = new Map<
  string,
  { expiresAt: number; promise: Promise<MissionResult> }
>();
const ADD_REQUEST_COALESCE_MS = 3_000;

function addToolOnce(params: AddToolParams, goal: string): Promise<MissionResult> {
  const now = Date.now();
  for (const [sourceUrl, entry] of recentAddsBySourceUrl) {
    if (entry.expiresAt <= now) recentAddsBySourceUrl.delete(sourceUrl);
  }

  const existing = recentAddsBySourceUrl.get(params.sourceUrl);
  if (existing && existing.expiresAt > now) return existing.promise;

  const promise = postMission({
    templateKey: 'toolbelt',
    goal,
    idempotencyKey: `toolbelt-add-${params.sourceUrl}`,
    args: {
      goal,
      title: params.title,
      description: params.description,
      category: params.category,
      sourceUrl: params.sourceUrl,
      sourceType: params.sourceType,
      ...(params.language ? { language: params.language } : {}),
      ...(params.tags ? { tags: params.tags } : {}),
      ...(params.useCases ? { useCases: params.useCases } : {}),
    },
  });
  recentAddsBySourceUrl.set(params.sourceUrl, {
    expiresAt: now + ADD_REQUEST_COALESCE_MS,
    promise,
  });
  return promise;
}

/**
 * Toolbelt add — Hono command POST /api/missions (toolbelt-add-from-url).
 */
export default function ToolbeltAddScreen() {
  const params = useLocalSearchParams<AddToolParams>();
  const router = useRouter();
  const { colors, spacing } = useTheme();

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [toolTitle, setToolTitle] = useState('');

  const didRun = useRef(false);

  useEffect(() => {
    if (didRun.current) return;
    didRun.current = true;

    async function addToolFromParams() {
      try {
        if (
          !params.title ||
          !params.description ||
          !params.category ||
          !params.sourceUrl ||
          !params.sourceType
        ) {
          throw new Error('Missing required parameters');
        }

        const goal = `Add toolbelt entry: ${params.title}`;
        // Pass full validated tool fields — do not drop after validate.
        const result = await addToolOnce(params, goal);

        setToolTitle(params.title);

        // Mission create returns a run id; treat any 2xx without error as success.
        const isNew = result.replay !== true;
        setStatus('success');
        setMessage(isNew ? 'Added to your toolbelt!' : 'Already in your toolbelt');

        setTimeout(() => {
          router.back();
        }, 2000);
      } catch (error) {
        setStatus('error');
        setMessage(error instanceof Error ? error.message : 'Failed to add tool');
      }
    }

    addToolFromParams();
  }, [
    router.back,
    params.useCases,
    params.sourceUrl,
    params.title,
    params.sourceType,
    params.category,
    params.tags,
    params.language,
    params.description,
  ]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <Pressable
        onPress={() => router.back()}
        style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl }}
      >
        {status === 'loading' && (
          <>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text className="text-muted-foreground mt-4 text-center">
              Adding to your toolbelt...
            </Text>
          </>
        )}

        {status === 'success' && (
          <View style={{ alignItems: 'center', gap: spacing.md }}>
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                backgroundColor: `${colors.success}20`,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <CheckCircle2 size={32} color={colors.success} />
            </View>
            <Text className="text-foreground text-center text-lg font-semibold">{toolTitle}</Text>
            <Text className="text-muted-foreground text-center">{message}</Text>
          </View>
        )}

        {status === 'error' && (
          <View style={{ alignItems: 'center', gap: spacing.md }}>
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                backgroundColor: `${colors.destructive}20`,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <XCircle size={32} color={colors.destructive} />
            </View>
            <Text className="text-destructive text-center">{message}</Text>
          </View>
        )}
      </Pressable>
    </SafeAreaView>
  );
}
