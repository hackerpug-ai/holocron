import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { Text } from '@/components/ui/text'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from './radio-group'
import { within, userEvent, expect } from '@storybook/test'

const meta: Meta<typeof RadioGroup> = {
  title: 'UI/RadioGroup',
  component: RadioGroup,
  parameters: {
    docs: {
      description: {
        component: 'Radio group component for single selection from multiple options. Supports disabled states and custom values.',
      },
    },
  },
  argTypes: {
    value: {
      control: { type: 'text' },
      description: 'Currently selected value',
    },
    onValueChange: {
      action: 'changed',
      description: 'Callback when selection changes',
    },
  },
  decorators: [
    (Story) => (
      <View className="flex-1 items-center justify-center bg-background p-4">
        <Story />
      </View>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof RadioGroup>

export const Default: Story => {
  render: () => (
    <RadioGroup defaultValue="option1">
      <View className="flex-row items-center gap-3">
        <RadioGroupItem value="option1" aria-labelledby="option1-label" />
        <Text nativeID="option1-label">Option 1</Text>
      </View>
      <View className="flex-row items-center gap-3">
        <RadioGroupItem value="option2" aria-labelledby="option2-label" />
        <Text nativeID="option2-label">Option 2</Text>
      </View>
      <View className="flex-row items-center gap-3">
        <RadioGroupItem value="option3" aria-labelledby="option3-label" />
        <Text nativeID="option3-label">Option 3</Text>
      </View>
    </RadioGroup>
  ),
}

export const WithLabels: Story => {
  render: () => (
    <View className="gap-4">
      <Label>
        <Text>Choose a plan:</Text>
      </Label>
      <RadioGroup defaultValue="basic">
        <View className="gap-3">
          <View className="flex-row items-center gap-3">
            <RadioGroupItem value="basic" aria-labelledby="basic-label" />
            <View>
              <Text nativeID="basic-label" className="font-medium">Basic</Text>
              <Text className="text-muted-foreground text-sm">$0/month</Text>
            </View>
          </View>
          <View className="flex-row items-center gap-3">
            <RadioGroupItem value="pro" aria-labelledby="pro-label" />
            <View>
              <Text nativeID="pro-label" className="font-medium">Pro</Text>
              <Text className="text-muted-foreground text-sm">$10/month</Text>
            </View>
          </View>
          <View className="flex-row items-center gap-3">
            <RadioGroupItem value="enterprise" aria-labelledby="enterprise-label" />
            <View>
              <Text nativeID="enterprise-label" className="font-medium">Enterprise</Text>
              <Text className="text-muted-foreground text-sm">$50/month</Text>
            </View>
          </View>
        </View>
      </RadioGroup>
    </View>
  ),
}

export const Disabled: Story => {
  render: () => (
    <RadioGroup defaultValue="option1">
      <View className="gap-3">
        <View className="flex-row items-center gap-3">
          <RadioGroupItem value="option1" aria-labelledby="disabled-option1-label" disabled />
          <Text nativeID="disabled-option1-label">Disabled Option 1</Text>
        </View>
        <View className="flex-row items-center gap-3">
          <RadioGroupItem value="option2" aria-labelledby="disabled-option2-label" disabled />
          <Text nativeID="disabled-option2-label">Disabled Option 2</Text>
        </View>
      </View>
    </RadioGroup>
  ),
}

export const Mixed: Story => {
  render: () => (
    <RadioGroup defaultValue="option1">
      <View className="gap-3">
        <View className="flex-row items-center gap-3">
          <RadioGroupItem value="option1" aria-labelledby="mixed-option1-label" />
          <Text nativeID="mixed-option1-label">Enabled Option 1</Text>
        </View>
        <View className="flex-row items-center gap-3">
          <RadioGroupItem value="option2" aria-labelledby="mixed-option2-label" disabled />
          <Text nativeID="mixed-option2-label" className="opacity-50">Disabled Option 2</Text>
        </View>
        <View className="flex-row items-center gap-3">
          <RadioGroupItem value="option3" aria-labelledby="mixed-option3-label" />
          <Text nativeID="mixed-option3-label">Enabled Option 3</Text>
        </View>
      </View>
    </RadioGroup>
  ),
}

// All variants grid
export const AllVariants: Story => {
  render: () => (
    <View className="gap-6">
      <View>
        <Text className="mb-3 text-sm font-medium">Default Radio Group</Text>
        <RadioGroup defaultValue="a">
          <View className="gap-3">
            <View className="flex-row items-center gap-3">
              <RadioGroupItem value="a" aria-labelledby="var-a-label" />
              <Text nativeID="var-a-label">Option A</Text>
            </View>
            <View className="flex-row items-center gap-3">
              <RadioGroupItem value="b" aria-labelledby="var-b-label" />
              <Text nativeID="var-b-label">Option B</Text>
            </View>
            <View className="flex-row items-center gap-3">
              <RadioGroupItem value="c" aria-labelledby="var-c-label" />
              <Text nativeID="var-c-label">Option C</Text>
            </View>
          </View>
        </RadioGroup>
      </View>

      <View>
        <Text className="mb-3 text-sm font-medium">With Disabled Items</Text>
        <RadioGroup defaultValue="enabled1">
          <View className="gap-3">
            <View className="flex-row items-center gap-3">
              <RadioGroupItem value="enabled1" aria-labelledby="mix-e1-label" />
              <Text nativeID="mix-e1-label">Enabled</Text>
            </View>
            <View className="flex-row items-center gap-3">
              <RadioGroupItem value="disabled1" aria-labelledby="mix-d1-label" disabled />
              <Text nativeID="mix-d1-label" className="opacity-50">Disabled</Text>
            </View>
          </View>
        </RadioGroup>
      </View>
    </View>
  ),
}

// Interactive test
export const Selectable: Story => {
  render: () => (
    <RadioGroup defaultValue="option1" testID="test-radio-group">
      <View className="gap-3">
        <View className="flex-row items-center gap-3">
          <RadioGroupItem value="option1" testID="radio-1" aria-labelledby="test-option1-label" />
          <Text nativeID="test-option1-label">Option 1</Text>
        </View>
        <View className="flex-row items-center gap-3">
          <RadioGroupItem value="option2" testID="radio-2" aria-labelledby="test-option2-label" />
          <Text nativeID="test-option2-label">Option 2</Text>
        </View>
      </View>
    </RadioGroup>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    // Verify radio items exist
    await expect(canvas.getByTestId('radio-1')).toBeTruthy()
    await expect(canvas.getByTestId('radio-2')).toBeTruthy()
  },
}
