import { Redirect, useLocalSearchParams } from 'expo-router'

/**
 * Redirect to canonical document route.
 * All document viewing is consolidated at /document/[id].
 */
export default function ArticleDetailRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <Redirect href={`/document/${id}`} />
}
