import { useQuery as useZeroQuery } from '@rocicorp/zero/react';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable } from 'react-native';
import { deleteImprovement, updateImprovement } from '@/app/zero/improvements';
import { improvementRequestById, improvementRequestsByOwner } from '@/app/zero/queries';
import { ImprovementActionBottomSheet } from '@/components/improvements/ImprovementActionMenu';
import { ImprovementEditSheet } from '@/components/improvements/ImprovementEditSheet';
import { ImprovementProcessingIndicator } from '@/components/improvements/ImprovementProcessingIndicator';
import { ImprovementSubmitSheet } from '@/components/improvements/ImprovementSubmitSheet';
import { Plus } from '@/components/ui/icons';
import { ScreenLayout } from '@/components/ui/screen-layout';
import { resolveE2eFixtureUri } from '@/lib/e2e/fixture-uri';
import { ImprovementsScreen } from '@/screens/improvements-screen';

type ImprovementRow = {
  id: string;
  title?: string | null;
  description?: string | null;
  status: string;
  created_at: number;
  merged_into_id?: string | null;
  merged_from_ids?: unknown;
  processed_at?: number | null;
};

/**
 * Improvements route — Zero-backed list + mutators.
 * Inside (drawer) group so the navigation drawer remains accessible.
 */
export default function ImprovementsRoute() {
  const router = useRouter();
  const [sheetVisible, setSheetVisible] = useState(false);
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const [editSheetId, setEditSheetId] = useState<string | null>(null);
  const [processingRequestId, setProcessingRequestId] = useState<string | null>(null);

  const [rawRequests, listDetails] = useZeroQuery(improvementRequestsByOwner(50));
  const isLoading = listDetails.type === 'unknown' && rawRequests === undefined;

  const [requestStatus] = useZeroQuery(
    processingRequestId ? improvementRequestById(processingRequestId) : undefined,
    { enabled: !!processingRequestId }
  );

  useEffect(() => {
    const row = requestStatus as ImprovementRow | null | undefined;
    if (row?.processed_at != null) {
      setProcessingRequestId(null);
    }
  }, [requestStatus]);

  const allRows = (rawRequests ?? []) as ImprovementRow[];
  // Post-filter merged requests (mirrors Convex list behavior).
  const openRows = allRows.filter((r) => r.merged_into_id == null);

  const requests = openRows.map((req) => ({
    _id: req.id,
    title: req.title ?? undefined,
    description: req.description ?? '',
    status: (['closed', 'completed', 'cancelled', 'canceled'].includes(req.status)
      ? 'closed'
      : 'open') as 'open' | 'closed',
    createdAt: req.created_at,
    images: undefined as undefined,
    mergedFromIds: req.merged_from_ids as string[] | undefined,
  }));

  const handleRequestPress = (id: string) => {
    router.push(`/improvements/${id}`);
  };

  const handleMenuPress = (id: string) => {
    setActionMenuId(id);
  };

  const handleEdit = (id: string) => {
    setEditSheetId(id);
  };

  const handleDelete = async (id: string) => {
    await deleteImprovement(id);
  };

  const handleSaveEdit = async (title: string, description: string) => {
    if (!editSheetId) return;
    await updateImprovement(editSheetId, { title, description });
    setEditSheetId(null);
  };

  const handleSubmitted = (requestId: string) => {
    setProcessingRequestId(requestId);
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.navigate('/chat/new');
    }
  };

  const editing = openRows.find((r) => r.id === editSheetId);

  return (
    <ScreenLayout
      header={{
        title: 'Improvements',
        showBack: true,
        onBack: handleBack,
        rightContent: (
          <Pressable
            onPress={() => setSheetVisible(true)}
            className="h-10 w-10 items-center justify-center rounded-full active:bg-muted"
            testID="improvements-header-add-button"
            accessibilityRole="button"
            accessibilityLabel="Add improvement"
          >
            <Plus size={22} className="text-foreground" />
          </Pressable>
        ),
      }}
      edges="bottom"
      testID="improvements-route-layout"
    >
      <ImprovementsScreen
        requests={requests}
        isLoading={isLoading}
        onRequestPress={handleRequestPress}
        onMenuPress={handleMenuPress}
      />

      <ImprovementProcessingIndicator
        visible={processingRequestId !== null}
        testID="improvements-processing-indicator"
      />

      <ImprovementSubmitSheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        onSubmitted={handleSubmitted}
        // Maestro / __DEV__: seed attach URI so attach-button can load the fixture.
        // Production builds resolve null (no silent seed).
        screenshotUri={resolveE2eFixtureUri()}
        sourceComponent="improvements-route"
        testID="improvements-screen-submit-sheet"
      />

      {editSheetId && (
        <ImprovementEditSheet
          visible={editSheetId !== null}
          onClose={() => setEditSheetId(null)}
          onSave={handleSaveEdit}
          initialTitle={editing?.title ?? ''}
          initialDescription={editing?.description ?? ''}
          testID="improvements-edit-sheet"
        />
      )}

      <ImprovementActionBottomSheet
        open={actionMenuId !== null}
        onClose={() => setActionMenuId(null)}
        onEdit={() => {
          const id = actionMenuId;
          setActionMenuId(null);
          if (id) handleEdit(id);
        }}
        onDelete={async () => {
          const id = actionMenuId;
          if (id) await handleDelete(id);
        }}
        testID="improvements-action-bottom-sheet"
      />
    </ScreenLayout>
  );
}
