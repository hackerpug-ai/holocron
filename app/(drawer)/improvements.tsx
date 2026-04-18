import { useMutation, useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable } from 'react-native';
import { ImprovementActionBottomSheet } from '@/components/improvements/ImprovementActionMenu';
import { ImprovementEditSheet } from '@/components/improvements/ImprovementEditSheet';
import { ImprovementProcessingIndicator } from '@/components/improvements/ImprovementProcessingIndicator';
import { ImprovementSubmitSheet } from '@/components/improvements/ImprovementSubmitSheet';
import { Plus } from '@/components/ui/icons';
import { ScreenLayout } from '@/components/ui/screen-layout';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { ImprovementsScreen } from '@/screens/improvements-screen';

/**
 * Improvements route - displays searchable, filterable list of improvement requests.
 * Inside (drawer) group so the navigation drawer remains accessible.
 */
export default function ImprovementsRoute() {
  const router = useRouter();
  const [sheetVisible, setSheetVisible] = useState(false);
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const [editSheetId, setEditSheetId] = useState<string | null>(null);
  const [processingRequestId, setProcessingRequestId] = useState<Id<'improvementRequests'> | null>(
    null
  );

  const requestsData = useQuery(api.improvements.queries.list, { limit: 50 });
  const isLoading = requestsData === undefined;

  const updateMutation = useMutation(api.improvements.mutations.update);
  const removeMutation = useMutation(api.improvements.mutations.remove);

  // Watch the processing request to hide indicator once the dedup agent
  // has written back (processedAt becomes defined).
  const requestStatus = useQuery(
    api.improvements.queries.get,
    processingRequestId ? { id: processingRequestId } : 'skip'
  );

  // Hide indicator when processing completes
  useEffect(() => {
    if (requestStatus?.processedAt !== undefined) {
      setProcessingRequestId(null);
    }
  }, [requestStatus?.processedAt]);

  const requests = (requestsData ?? []).map((req: any) => ({
    _id: req._id as string,
    title: req.title,
    description: req.description,
    status: req.status,
    createdAt: req.createdAt,
    // images are stored in a separate table; list query does not include them
    images: undefined,
    mergedFromIds: req.mergedFromIds as string[] | undefined,
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
    await removeMutation({ id: id as Id<'improvementRequests'> });
  };

  const handleSaveEdit = async (title: string, description: string) => {
    if (!editSheetId) return;
    await updateMutation({
      id: editSheetId as Id<'improvementRequests'>,
      title,
      description,
    });
    setEditSheetId(null);
  };

  const handleSubmitted = (requestId: Id<'improvementRequests'>) => {
    setProcessingRequestId(requestId);
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.navigate('/chat/new');
    }
  };

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
        testID="improvements-screen-submit-sheet"
      />

      {editSheetId && requestsData && (
        <ImprovementEditSheet
          visible={editSheetId !== null}
          onClose={() => setEditSheetId(null)}
          onSave={handleSaveEdit}
          initialTitle={requestsData.find((r: any) => r._id === editSheetId)?.title ?? ''}
          initialDescription={
            requestsData.find((r: any) => r._id === editSheetId)?.description ?? ''
          }
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
