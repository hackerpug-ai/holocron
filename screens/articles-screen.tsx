import { ArticleCard } from "@/components/ArticleCard";
import { ArticleCardSkeleton } from "@/components/ArticleCardSkeleton";
import type { CategoryType } from "@/components/CategoryBadge";
import { EmptyState } from "@/components/EmptyState";
import { FilterChip } from "@/components/FilterChip";
import { SearchInput } from "@/components/SearchInput";
import { SectionHeader } from "@/components/SectionHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { VALID_CATEGORIES } from "@/lib/category-mapping";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { ScrollView, View, type ViewProps } from "react-native";

/** Category display labels */
const categoryLabels: Record<CategoryType, string> = {
  research: "Research",
  "deep-research": "Deep Research",
  factual: "Factual",
  academic: "Academic",
  entity: "Entity",
  url: "URL",
  general: "General",
  patterns: "Patterns",
  business: "Business",
  "technical-analysis": "Technical",
  platforms: "Platforms",
  libraries: "Libraries",
  "claude-code-configuration": "Claude Config",
  toolbelt: "Toolbelt",
};

function getCategoryLabel(category: CategoryType): string {
  return categoryLabels[category] ?? category;
}

interface Article {
  id: string;
  title: string;
  category: CategoryType;
  date: string;
  snippet?: string;
  iterationCount?: number;
}

interface ArticlesScreenProps extends Omit<ViewProps, "children"> {
  /** Articles to display */
  articles?: Article[];
  /** Total count of articles (for display, may differ from articles.length due to pagination) */
  totalCount?: number;
  /** Available categories for filtering (sorted by count, with populated categories first) */
  categories?: CategoryType[];
  /** Category counts for displaying on chips */
  categoryCounts?: Record<string, number>;
  /** Total article count across all categories */
  totalArticleCount?: number;
  /** Currently selected category filter */
  selectedCategory?: CategoryType | null;
  /** Whether data is loading */
  loading?: boolean;
  /** Whether category data is still loading (shows skeleton chips) */
  isLoadingCategories?: boolean;
  /** Callback when search query changes */
  onSearch?: (_query: string) => void;
  /** Callback when an article is pressed */
  onArticlePress?: (_article: Article) => void;
  /** Callback when a category filter is selected */
  onCategoryChange?: (_category?: CategoryType) => void;
}

/**
 * ArticlesScreen provides a browsable list of all articles in the knowledge base.
 * Features horizontal category chip filters, search input, and scrollable article cards.
 * This is the main articles view accessed from the drawer.
 */
export function ArticlesScreen({
  articles = [],
  totalCount,
  categories = VALID_CATEGORIES,
  categoryCounts,
  totalArticleCount = 0,
  selectedCategory,
  loading = false,
  isLoadingCategories = false,
  onSearch,
  onArticlePress,
  onCategoryChange,
  className,
  ...props
}: ArticlesScreenProps) {
  const [searchValue, setSearchValue] = useState("");

  const handleSearchChange = (query: string) => {
    setSearchValue(query);
    onSearch?.(query);
  };

  const handleClear = () => {
    setSearchValue("");
    onSearch?.("");
  };

  const handleCategoryPress = (category: CategoryType) => {
    const isCurrentlySelected = selectedCategory === category;
    if (isCurrentlySelected) {
      // Deselect - return to "All"
      onCategoryChange?.(undefined);
    } else {
      onCategoryChange?.(category);
    }
  };

  const handleAllPress = () => {
    // Clear any selected category
    onCategoryChange?.(undefined);
  };

  const hasResults = articles.length > 0;
  const isFiltering =
    searchValue.length > 0 ||
    (selectedCategory !== null && selectedCategory !== undefined);

  // "All" is selected when no specific category is selected
  const isAllSelected = !selectedCategory;

  return (
    <View
      className={cn("flex-1 bg-background", className)}
      testID="articles-screen"
      {...props}
    >
      {/* Header Section with Search and Categories */}
      <View className="px-4 pb-4 pt-4">
        {/* Search Input - always editable to allow query refinement */}
        <SearchInput
          value={searchValue}
          onChangeText={handleSearchChange}
          placeholder="Search articles..."
          onClear={handleClear}
          testID="articles-search-input"
        />

        {/* Horizontal Filter Chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mt-3"
          contentContainerClassName="gap-2"
          testID="articles-category-chips"
        >
          {isLoadingCategories ? (
            // Skeleton loading state for chips
            <>
              <Skeleton className="h-8 w-14 rounded-full" />
              <Skeleton className="h-8 w-20 rounded-full" />
              <Skeleton className="h-8 w-16 rounded-full" />
              <Skeleton className="h-8 w-18 rounded-full" />
            </>
          ) : (
            <>
              {/* "All" Chip */}
              <FilterChip
                label={`All (${totalArticleCount})`}
                selected={isAllSelected}
                disabled={loading}
                onPress={handleAllPress}
                testID="articles-chip-All"
              />

              {/* Category Chips */}
              {categories.map((category) => {
                const count = categoryCounts?.[category] ?? 0;
                return (
                  <FilterChip
                    key={category}
                    label={`${getCategoryLabel(category)} (${count})`}
                    selected={selectedCategory === category}
                    disabled={loading}
                    onPress={() => handleCategoryPress(category)}
                    testID={`articles-chip-${category}`}
                  />
                );
              })}
            </>
          )}
        </ScrollView>
      </View>

      {/* Article List */}
      <ScrollView className="flex-1" contentContainerClassName="p-4 pb-8">
        {loading ? (
          <View className="gap-3" testID="articles-loading">
            <SectionHeader
              title="Loading..."
              size="md"
              className="mb-3"
              testID="articles-loading-header"
            />
            {[0, 1, 2, 3, 4].map((index) => (
              <ArticleCardSkeleton key={index} delay={index * 100} />
            ))}
          </View>
        ) : hasResults ? (
          <>
            {/* Results Count Header */}
            <SectionHeader
              title={`${isFiltering ? "Results" : "All Articles"} (${totalCount ?? articles.length})`}
              size="md"
              className="mb-3"
              testID="articles-count-header"
            />

            {/* Article Cards */}
            <View className="gap-3" testID="articles-list">
              {articles.map((article) => (
                <ArticleCard
                  key={article.id}
                  title={article.title}
                  category={article.category}
                  date={article.date}
                  snippet={article.snippet}
                  iterationCount={article.iterationCount}
                  onPress={() => onArticlePress?.(article)}
                  testID={`articles-card-${article.id}`}
                />
              ))}
            </View>
          </>
        ) : (
          <EmptyState
            type={isFiltering ? "no-results" : "no-data"}
            title={isFiltering ? "No articles found" : "No articles yet"}
            description={
              isFiltering
                ? "Try adjusting your search or filters to find what you're looking for."
                : "Your knowledge base is empty. Add articles through chat or research."
            }
            actionLabel={isFiltering ? "Clear filters" : undefined}
            onActionPress={
              isFiltering
                ? () => {
                    setSearchValue("");
                    onCategoryChange?.(undefined);
                  }
                : undefined
            }
            testID="articles-empty-state"
          />
        )}
      </ScrollView>
    </View>
  );
}
