import { useZero, useQuery as useZeroQuery } from '@rocicorp/zero/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { improvementRequestById } from '@/app/zero/queries';
import { ImprovementActionMenu } from '@/components/improvements/ImprovementActionMenu';
import { ImprovementDetailView } from '@/components/improvements/ImprovementDetailView';
import { ImprovementEditSheet } from '@/components/improvements/ImprovementEditSheet';
import { Button } from '@/components/ui/button';
import { ArrowLeft, EllipsisVertical } from '@/components/ui/icons';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/hooks/use-theme';

type ImprovementRow = {
  id: string;
  title?: string | null;
  description?: string | null;
  summary?: string | null;
  status: string;
  source_screen?: string | null;
  source_component?: string | null;
  agent_decision?: unknown;
  merged_into_id?: string | null;
  merged_from_ids?: unknown;
  user_feedback?: string | null;
  closure_reason?: string | null;
  closure_evidence?: unknown;
  closed_at?: number | null;
  created_at: number;
  updated_at: number;
  processed_at?: number | null;
};

/**
 * Improvement Request Detail Screen — Zero query + mutators.
 * Route: /improvements/[requestId]
 */
export default function ImprovementDetailScreen() {
  const { requestId } = useLocalSearchParams<{ requestId: string }>();
  const router = useRouter();
  const theme = useTheme();
  const zero = useZero();

  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [editSheetOpen, setEditSheetOpen] = useState(false);

  const [row] = useZeroQuery(requestId ? improvementRequestById(requestId) : undefined, {
    enabled: !!requestId,
  });

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.navigate('/improvements');
    }
  };

  const handleToggleStatus = async () => {
    if (!requestId || !row) return;
    const data = row as ImprovementRow;
    const nextStatus = data.status === 'open' ? 'closed' : 'open';
    await zero.mutate.improvement_requests.update({
      id: requestId,
      status: nextStatus,
      updated_at: Date.now(),
      closed_at: nextStatus === 'closed' ? Date.now() : null,
    });
  };

  const handleSaveEdit = async (title: string, description: string) => {
    if (!requestId) return;
    await zero.mutate.improvement_requests.update({
      id: requestId,
      title,
      description,
      updated_at: Date.now(),
    });
    setEditSheetOpen(false);
  };

  const handleDelete = async () => {
    if (!requestId) return;
    await zero.mutate.improvement_requests.delete({ id: requestId });
    setActionMenuOpen(false);
    router.back();
  };

  if (row === undefined) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={['top']}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: theme.spacing.md,
            paddingVertical: theme.spacing.md,
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.border,
            gap: theme.spacing.md,
          }}
        >
          <Pressable onPress={handleBack} style={{ padding: theme.spacing.sm }}>
            <ArrowLeft size={24} color={theme.colors.foreground} />
          </Pressable>
          <Text
            style={{
              flex: 1,
              fontSize: theme.typography.h4.fontSize,
              fontWeight: theme.typography.h4.fontWeight,
              color: theme.colors.foreground,
            }}
          >
            Loading...
          </Text>
        </View>

        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text className="text-muted-foreground mt-4">Loading improvement request...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (row === null) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={['top']}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: theme.spacing.md,
            paddingVertical: theme.spacing.md,
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.border,
            gap: theme.spacing.md,
          }}
        >
          <Pressable onPress={handleBack} style={{ padding: theme.spacing.sm }}>
            <ArrowLeft size={24} color={theme.colors.foreground} />
          </Pressable>
          <Text
            style={{
              flex: 1,
              fontSize: theme.typography.h4.fontSize,
              fontWeight: theme.typography.h4.fontWeight,
              color: theme.colors.foreground,
            }}
          >
            Error
          </Text>
        </View>

        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: theme.spacing.xl,
          }}
        >
          <Text className="text-destructive text-center text-lg mb-4">Request not found</Text>
          <Button onPress={handleBack}>
            <Text>Go Back</Text>
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  const data = row as ImprovementRow;
  const request = {
    _id: data.id,
    id: data.id,
    title: data.title ?? undefined,
    description: data.description ?? '',
    summary: data.summary ?? undefined,
    status: data.status,
    sourceScreen: data.source_screen ?? undefined,
    sourceComponent: data.source_component ?? undefined,
    agentDecision: data.agent_decision,
    mergedIntoId: data.merged_into_id ?? undefined,
    mergedFromIds: data.merged_from_ids as string[] | undefined,
    userFeedback: data.user_feedback ?? undefined,
    closureReason: data.closure_reason ?? undefined,
    closureEvidence: data.closure_evidence,
    closedAt: data.closed_at ?? undefined,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    processedAt: data.processed_at ?? undefined,
  };

  // Images relationship not yet synced on the thin Zero surface for this cluster.
  const images: unknown[] = [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={['top']}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: theme.spacing.md,
          paddingVertical: theme.spacing.md,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
          gap: theme.spacing.md,
        }}
      >
        <Pressable
          onPress={handleBack}
          style={{ padding: theme.spacing.sm }}
          testID="improvement-detail-back-button"
        >
          <ArrowLeft size={24} color={theme.colors.foreground} />
        </Pressable>
        <Text
          style={{
            flex: 1,
            fontSize: theme.typography.h4.fontSize,
            fontWeight: theme.typography.h4.fontWeight,
            color: theme.colors.foreground,
          }}
          numberOfLines={1}
        >
          {request.title ?? 'Improvement Request'}
        </Text>
        <Pressable
          onPress={() => setActionMenuOpen(true)}
          style={{ padding: theme.spacing.sm }}
          testID="improvement-detail-menu-button"
          accessibilityRole="button"
          accessibilityLabel="More options"
        >
          <EllipsisVertical size={24} color={theme.colors.foreground} />
        </Pressable>
      </View>

      <ImprovementDetailView
        request={request as never}
        images={images as never}
        onToggleStatus={handleToggleStatus}
        testID="improvement-detail-view"
      />

      <ImprovementActionMenu
        open={actionMenuOpen}
        onClose={() => setActionMenuOpen(false)}
        onEdit={() => {
          setActionMenuOpen(false);
          setEditSheetOpen(true);
        }}
        onDelete={handleDelete}
        testID="improvement-detail-action-menu"
      />

      {editSheetOpen && (
        <ImprovementEditSheet
          visible={editSheetOpen}
          onClose={() => setEditSheetOpen(false)}
          onSave={handleSaveEdit}
          initialTitle={request.title ?? ''}
          initialDescription={request.description}
          testID="improvement-detail-edit-sheet"
        />
      )}
    </SafeAreaView>
  );
}
