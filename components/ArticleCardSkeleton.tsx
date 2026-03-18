import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronRight } from "lucide-react-native";
import { View, StyleSheet } from "react-native";

interface ArticleCardSkeletonProps {
  /** Staggered animation delay in ms for visual interest (currently unused, for future animation support) */
  delay?: number;
}

/**
 * ArticleCardSkeleton provides a loading placeholder that mirrors the ArticleCard layout.
 * Used to show loading state while fetching articles.
 */
export function ArticleCardSkeleton({ delay: _delay = 0 }: ArticleCardSkeletonProps) {
  return (
    <Card style={styles.card} testID="article-card-skeleton">
      <CardHeader>
        {/* Category badge + chevron row */}
        <View className="mb-2 flex-row items-center justify-between">
          <Skeleton className="h-5 w-16 rounded-full" />
          <ChevronRight size={16} className="text-muted-foreground/30" />
        </View>
        {/* Title skeleton */}
        <Skeleton className="h-6 w-4/5 rounded" />
      </CardHeader>
      <CardContent className="pt-0">
        {/* Snippet skeletons */}
        <View className="mb-3 gap-2">
          <Skeleton className="h-4 w-full rounded" />
          <Skeleton className="h-4 w-3/4 rounded" />
        </View>
        {/* Date/time row */}
        <View className="flex-row items-center gap-3">
          <Skeleton className="h-3 w-20 rounded" />
          <Skeleton className="h-3 w-14 rounded" />
        </View>
      </CardContent>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
});
