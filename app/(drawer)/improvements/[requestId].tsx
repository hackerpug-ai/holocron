import { useQuery as useZeroQuery } from '@rocicorp/zero/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { deleteImprovement, updateImprovement } from '@/app/zero/improvements';
import { improvementRequestById } from '@/app/zero/queries';
import { ImprovementActionMenu } from '@/components/improvements/ImprovementActionMenu';
import { ImprovementDetailView } from '@/components/improvements/ImprovementDetailView';
import { ImprovementEditSheet } from '@/components/improvements/ImprovementEditSheet';
import { Button } from '@/components/ui/button';
import { EllipsisVertical } from '@/components/ui/icons';
import { ScreenLayout } from '@/components/ui/screen-layout';
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

  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [editSheetOpen, setEditSheetOpen] = useState(false);

  const [row] = useZeroQuery(requestId ? improvementRequestById(requestId) : undefined, {
    enabled: !!requestId,
  });

  const handleBack = () => {
    // Deep links can leave an unrelated screen beneath this route. Returning
    // explicitly keeps the detail flow anchored to its owning list.
    router.replace('/improvements');
  };

  const handleToggleStatus = async () => {
    if (!requestId || !row) return;
    await updateImprovement(requestId, { status: isClosed ? 'pending' : 'completed' });
  };

  const handleSaveEdit = async (title: string, description: string) => {
    if (!requestId) return;
    await updateImprovement(requestId, { title, description });
    setEditSheetOpen(false);
  };

  const handleDelete = async () => {
    if (!requestId) return;
    await deleteImprovement(requestId);
    setActionMenuOpen(false);
    router.replace('/improvements');
  };

  if (row === undefined) {
    return (
      <ScreenLayout
        header={{
          title: 'Loading...',
          showBack: true,
          onBack: handleBack,
          testID: 'improvements-detail',
        }}
        edges="bottom"
        testID="improvements-detail-loading"
      >
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text className="text-muted-foreground mt-4">Loading improvement request...</Text>
        </View>
      </ScreenLayout>
    );
  }

  if (row === null) {
    return (
      <ScreenLayout
        header={{
          title: 'Error',
          showBack: true,
          onBack: handleBack,
          testID: 'improvements-detail',
        }}
        edges="bottom"
        testID="improvements-detail-error"
      >
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: theme.spacing.xl,
          }}
        >
          <Text className="text-destructive text-center text-lg mb-4">Request not found</Text>
          <Button
            onPress={handleBack}
            testID="improvements-detail-go-back"
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Text>Go Back</Text>
          </Button>
        </View>
      </ScreenLayout>
    );
  }

  const data = row as ImprovementRow;
  const isClosed = ['closed', 'completed', 'cancelled', 'canceled'].includes(data.status);
  const request = {
    _id: data.id,
    id: data.id,
    title: data.title ?? undefined,
    description: data.description ?? '',
    summary: data.summary ?? undefined,
    status: (isClosed ? 'closed' : 'open') as 'closed' | 'open',
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
    <ScreenLayout
      header={{
        title: request.title ?? 'Improvement Request',
        showBack: true,
        onBack: handleBack,
        testID: 'improvements-detail',
        rightContent: (
          <Pressable
            onPress={() => setActionMenuOpen(true)}
            style={{ padding: theme.spacing.sm }}
            testID="improvement-detail-menu-button"
            accessibilityRole="button"
            accessibilityLabel="More options"
          >
            <EllipsisVertical size={24} color={theme.colors.foreground} />
          </Pressable>
        ),
      }}
      edges="bottom"
      testID="improvements-detail-layout"
    >
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
    </ScreenLayout>
  );
}
