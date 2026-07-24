import { useQuery as useZeroQuery } from '@rocicorp/zero/react';
import { useRouter } from 'expo-router';
import { toolbeltDocumentsByOwner } from '@/app/zero/queries';
import { ScreenLayout } from '@/components/ui/screen-layout';
import { type Tool, ToolbeltScreen } from '@/screens/toolbelt-screen';

type DocumentRow = {
  id: string;
  title?: string | null;
  content?: string | null;
  category?: string | null;
  status: string;
  file_type?: string | null;
  date?: string | null;
  time?: string | null;
  created_at: number;
  research_type?: string | null;
};

/**
 * Toolbelt route — Zero query toolbeltDocumentsByOwner
 * (toolbelt_tools excluded from zero_pub; entries surface as documents).
 */
export default function ToolbeltRoute() {
  const router = useRouter();

  const [rows, details] = useZeroQuery(toolbeltDocumentsByOwner(100));
  const isLoading = details.type === 'unknown' && rows === undefined;

  const tools = ((rows ?? []) as DocumentRow[]).map(
    (doc): Tool => ({
      _id: doc.id,
      title: doc.title ?? '',
      description: undefined,
      content: doc.content ?? undefined,
      category: (doc.category as Tool['category']) ?? undefined,
      status: doc.status as Tool['status'],
      sourceUrl: undefined,
      sourceType: (doc.file_type as Tool['sourceType']) ?? undefined,
      tags: undefined,
      useCases: undefined,
      keywords: undefined,
      language: undefined,
      date: doc.date ?? undefined,
      time: doc.time ?? undefined,
      createdAt: doc.created_at,
      updatedAt: doc.created_at,
    })
  );

  const handleToolPress = (tool: Tool) => {
    if (tool.sourceUrl) {
      router.push(`/webview/${encodeURIComponent(tool.sourceUrl)}`);
    }
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
        title: 'Toolbelt',
        showBack: true,
        onBack: handleBack,
      }}
      edges="bottom"
      testID="toolbelt-route-layout"
    >
      <ToolbeltScreen tools={tools} isLoading={isLoading} onToolPress={handleToolPress} />
    </ScreenLayout>
  );
}
