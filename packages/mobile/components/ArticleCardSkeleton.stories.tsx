import type { Meta, StoryObj } from "@storybook/react";
import { View } from "react-native";
import { ArticleCardSkeleton } from "./ArticleCardSkeleton";

const meta = {
  title: "Components/ArticleCardSkeleton",
  component: ArticleCardSkeleton,
  decorators: [
    (Story) => (
      <View className="bg-muted" style={{ padding: 16 }}>
        <Story />
      </View>
    ),
  ],
} satisfies Meta<typeof ArticleCardSkeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default skeleton loading state
 */
export const Default: Story = {
  args: {},
};

/**
 * Multiple skeleton cards with staggered animation delays
 * Mimics the loading state shown in the articles list
 */
export const StaggeredList: Story = {
  render: () => (
    <View style={{ gap: 12 }}>
      {[0, 1, 2, 3, 4].map((index) => (
        <ArticleCardSkeleton key={index} delay={index * 100} />
      ))}
    </View>
  ),
};

/**
 * Single skeleton with custom delay
 */
export const WithDelay: Story = {
  args: {
    delay: 200,
  },
};
