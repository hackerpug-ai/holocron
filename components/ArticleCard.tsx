import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { Calendar, Clock, ChevronRight } from "@/components/ui/icons";
import { Pressable, View, type ViewProps } from "react-native";
import { CategoryBadge, type CategoryType } from "./CategoryBadge";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useTheme } from "@/hooks/use-theme";
import { SummaryText } from "@/components/subscriptions/SummaryText";

interface ArticleCardProps extends Omit<ViewProps, "children"> {
  /** Article title */
  title: string;
  /** Article category */
  category: CategoryType;
  /** Publication date (ISO string or Date) */
  date: string | Date;
  /** Optional content snippet */
  snippet?: string;
  /** Optional summary text */
  summary?: string;
  /** Optional research iteration count (for deep research) */
  iterationCount?: number;
  /** Callback when card is pressed */
  onPress?: () => void;
  /** Whether the card is in a compact mode */
  compact?: boolean;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * ArticleCard displays a summary of a research article.
 * Shows title, category, date, and an optional snippet.
 */
export function ArticleCard({
  title,
  category,
  date,
  snippet,
  summary,
  iterationCount,
  onPress,
  compact = false,
  className,
  ...props
}: ArticleCardProps) {
  const { colors } = useTheme();
  const pressed = useSharedValue(0);

  const dateObj = typeof date === "string" ? new Date(date) : date;
  const formattedDate = dateObj.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const formattedTime = dateObj.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: 1 - pressed.value * 0.02 }],
      opacity: 1 - pressed.value * 0.1,
    };
  });

  const handlePressIn = () => {
    pressed.value = withSpring(1, { damping: 20, stiffness: 300 });
  };

  const handlePressOut = () => {
    pressed.value = withSpring(0, { damping: 20, stiffness: 300 });
  };

  const cardStyle = {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  };

  const content = (
    <Card
      className={cn(compact && "py-4", className)}
      testID="article-card"
      style={cardStyle}
      {...props}
    >
      <CardHeader className={cn(compact && "pb-2")}>
        <View className="mb-2 flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <CategoryBadge category={category} size="sm" />
            {iterationCount && iterationCount > 1 && (
              <Text className="text-muted-foreground text-xs">
                {iterationCount} iterations
              </Text>
            )}
          </View>
          {onPress && <ChevronRight size={16} className="text-muted-foreground" />}
        </View>
        <Text
          className={cn(
            "text-foreground font-semibold",
            compact ? "text-base" : "text-lg",
          )}
        >
          {title}
        </Text>
      </CardHeader>
      {!compact && (snippet || summary) && (
        <CardContent className="pt-0">
          {snippet && (
            <Text className="text-muted-foreground text-sm" numberOfLines={2}>
              {snippet}
            </Text>
          )}
          <SummaryText
            summary={summary}
            title={title}
            testID="article-card-summary"
          />
        </CardContent>
      )}
      <CardContent className={cn("pt-2", compact && "pt-0")}>
        <View className="flex-row items-center gap-3">
          <View className="flex-row items-center gap-1">
            <Calendar size={12} className="text-muted-foreground" />
            <Text className="text-muted-foreground text-xs">
              {formattedDate}
            </Text>
          </View>
          <View className="flex-row items-center gap-1">
            <Clock size={12} className="text-muted-foreground" />
            <Text className="text-muted-foreground text-xs">
              {formattedTime}
            </Text>
          </View>
        </View>
      </CardContent>
    </Card>
  );

  if (onPress) {
    return (
      <AnimatedPressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={animatedStyle}
        testID="article-card-pressable"
      >
        {content}
      </AnimatedPressable>
    );
  }

  return content;
}

