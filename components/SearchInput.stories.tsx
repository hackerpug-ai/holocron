import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { View } from 'react-native'
import { Text } from '@/components/ui/text'
import { SearchInput } from './SearchInput'

const meta: Meta<typeof SearchInput> = {
  title: 'Components/SearchInput',
  component: SearchInput,
  parameters: {
    docs: {
      description: {
        component:
          'Search input field with search icon and clear button. Used for searching the knowledge base and filtering content lists.',
      },
    },
  },
  argTypes: {
    value: {
      control: { type: 'text' },
      description: 'Current search value',
    },
    placeholder: {
      control: { type: 'text' },
      description: 'Placeholder text',
    },
    onChangeText: {
      action: 'changed',
      description: 'Callback when value changes',
    },
    onSubmit: {
      action: 'submitted',
      description: 'Callback when search is submitted',
    },
    onClear: {
      action: 'cleared',
      description: 'Callback when clear button is pressed',
    },
    disabled: {
      control: { type: 'boolean' },
      description: 'Whether the input is disabled',
    },
    autoFocus: {
      control: { type: 'boolean' },
      description: 'Whether to auto-focus the input',
    },
  },
  args: {
    value: '',
    placeholder: 'Search knowledge base...',
    disabled: false,
    autoFocus: false,
  },
}

export default meta
type Story = StoryObj<typeof SearchInput>

export const Default: Story = {
  render: function DefaultStory() {
    const [value, setValue] = useState('')
    return (
      <SearchInput
        value={value}
        onChangeText={setValue}
        placeholder="Search knowledge base..."
      />
    )
  },
}

export const WithValue: Story = {
  render: function WithValueStory() {
    const [value, setValue] = useState('machine learning')
    return (
      <SearchInput
        value={value}
        onChangeText={setValue}
        placeholder="Search..."
      />
    )
  },
}

export const Disabled: Story = {
  render: function DisabledStory() {
    const [value, setValue] = useState('')
    return (
      <SearchInput
        value={value}
        onChangeText={setValue}
        placeholder="Search is disabled..."
        disabled
      />
    )
  },
}

export const CustomPlaceholder: Story = {
  render: function CustomPlaceholderStory() {
    const [value, setValue] = useState('')
    return (
      <SearchInput
        value={value}
        onChangeText={setValue}
        placeholder="Find articles, topics, or keywords..."
      />
    )
  },
}

export const Interactive: Story = {
  render: function InteractiveStory() {
    const [value, setValue] = useState('')
    const [submitted, setSubmitted] = useState('')

    return (
      <View style={{ gap: 16 }}>
        <SearchInput
          value={value}
          onChangeText={setValue}
          onSubmit={() => setSubmitted(value)}
          onClear={() => setSubmitted('')}
          placeholder="Type and press Enter..."
        />
        {submitted && (
          <Text className="text-muted-foreground text-sm">
            Searched for: "{submitted}"
          </Text>
        )}
      </View>
    )
  },
}
