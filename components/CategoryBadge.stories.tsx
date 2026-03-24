import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { CategoryBadge, type CategoryType } from './CategoryBadge'
import { DOCUMENT_CATEGORIES } from '@/convex/lib/categories'

const meta: Meta<typeof CategoryBadge> = {
  title: 'Components/CategoryBadge',
  component: CategoryBadge,
  parameters: {
    docs: {
      description: {
        component:
          'Colored badge displaying article or research categories. Maps category types to semantic badge variants for consistent visual language across the app.',
      },
    },
  },
  argTypes: {
    category: {
      control: { type: 'select' },
      options: [...DOCUMENT_CATEGORIES],
      description: 'The category type to display',
    },
    label: {
      control: { type: 'text' },
      description: 'Optional custom label (defaults to formatted category name)',
    },
    size: {
      control: { type: 'select' },
      options: ['sm', 'md'],
      description: 'Size variant',
    },
  },
  args: {
    category: 'research',
    size: 'md',
  },
}

export default meta
type Story = StoryObj<typeof CategoryBadge>

export const Default: Story = {}

export const Business: Story = {
  args: { category: 'business' },
}

export const TechnicalAnalysis: Story = {
  args: { category: 'technical-analysis' },
}

export const Small: Story = {
  args: { category: 'research', size: 'sm' },
}

export const CustomLabel: Story = {
  args: { category: 'research', label: 'Custom Label' },
}

export const AllCategories: Story = {
  render: () => {
    return (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {DOCUMENT_CATEGORIES.map((category) => (
          <CategoryBadge key={category} category={category} />
        ))}
      </View>
    )
  },
}

export const AllSizes: Story = {
  render: () => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <CategoryBadge category="research" size="sm" />
      <CategoryBadge category="research" size="md" />
    </View>
  ),
}
