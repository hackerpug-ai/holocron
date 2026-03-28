import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { View } from 'react-native'

export function ImprovementCardSkeleton() {
  return (
    <View className="w-full" testID="improvement-card-skeleton">
      <Card className="border border-border bg-card w-full overflow-hidden">
        <CardContent className="py-3 px-4">
          {/* Header row: badge placeholder + date placeholder */}
          <View className="flex-row items-center justify-between mb-2">
            <Skeleton className="w-16 h-5 rounded-full" />
            <Skeleton className="w-12 h-3 rounded-md" />
          </View>

          {/* Title placeholder */}
          <Skeleton className="w-3/4 h-5 rounded-md mb-1" />

          {/* Description placeholders */}
          <Skeleton className="w-full h-4 rounded-md mb-1" />
          <Skeleton className="w-2/3 h-4 rounded-md mb-2" />

          {/* Footer placeholder */}
          <Skeleton className="w-10 h-3 rounded-md" />
        </CardContent>
      </Card>
    </View>
  )
}
