import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { CategoryBadge, type CategoryType } from './CategoryBadge'

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
      options: ['research', 'deep-research', 'factual', 'academic', 'entity', 'url', 'general'],
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

export const DeepResearch: Story = {
  args: { category: 'deep-research' },
}

export const Academic: Story = {
  args: { category: 'academic' },
}

export const Small: Story = {
  args: { category: 'research', size: 'sm' },
}

export const CustomLabel: Story = {
  args: { category: 'research', label: 'Custom Label' },
}

export const AllCategories: Story = {
  render: () => {
    const categories: CategoryType[] = [
      'research',
      'deep-research',
      'factual',
      'academic',
      'entity',
      'url',
      'general',
    ]
    return (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {categories.map((category) => (
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
