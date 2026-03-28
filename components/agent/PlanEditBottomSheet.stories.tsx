import type { Meta, StoryObj } from '@storybook/react'
import { View, Pressable, useState } from 'react-native'
import { Text } from '@/components/ui/text'
import { PlanEditBottomSheet } from './PlanEditBottomSheet'
import { Edit } from '@/components/ui/icons'

const meta: Meta<typeof PlanEditBottomSheet> = {
  title: 'Agent/PlanEditBottomSheet',
  component: PlanEditBottomSheet,
  parameters: {
    docs: {
      description: {
        component:
          'Bottom sheet component for editing plan text with freeform input. Features animated slide-up transitions, pan gesture dismissal, character counter, and validation support.',
      },
    },
  },
  argTypes: {
    visible: {
      control: 'boolean',
      description: 'Whether the sheet is visible',
    },
    onClose: {
      action: 'closed',
      description: 'Called when the sheet is dismissed without saving',
    },
    onSave: {
      action: 'saved',
      description: 'Called when save is pressed with the edited text',
    },
    initialText: {
      control: 'text',
      description: 'Initial text content for the editor',
    },
    title: {
      control: 'text',
      description: 'Optional title for the sheet',
    },
    placeholder: {
      control: 'text',
      description: 'Optional placeholder text',
    },
    maxChars: {
      control: 'number',
      description: 'Maximum character count (default: 5000)',
    },
    testID: {
      control: 'text',
      description: 'Test ID prefix for testing',
    },
  },
  decorators: [
    (Story) => (
      <View className="bg-background flex-1">
        <Story />
      </View>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof PlanEditBottomSheet>

// Sample plan texts for stories
const samplePlans = {
  short: 'Research quantum computing applications in cryptography.',
  medium: `Research Plan: Quantum Cryptography

1. Literature Review
   - Search for recent papers on quantum-resistant algorithms
   - Identify key researchers in the field

2. Technical Analysis
   - Compare post-quantum cryptography standards
   - Evaluate implementation challenges

3. Case Studies
   - Review real-world quantum key distribution systems
   - Analyze commercial viability`,

  long: `Comprehensive Research Plan: AI Safety and Alignment

Phase 1: Foundation
- Review core literature on AI alignment (Bostrom, Yudkowsky, Russell)
- Examine current state of AI safety research at leading labs
- Identify key open problems in alignment theory

Phase 2: Technical Approaches
- Analyze value learning methods: inverse reinforcement learning, cooperative inverse reinforcement learning
- Study interpretability techniques: attention visualization, feature circuits, mechanistic interpretability
- Review scalable oversight: debate, recursive reward modeling, amplification

Phase 3: Implementation Challenges
- Explore robustness and distributional shift issues
- Examine inner alignment and mesa-optimization risks
- Consider reward hacking and specification gaming

Phase 4: Governance and Policy
- Review international coordination frameworks
- Analyze compute governance proposals
- Study verification and monitoring mechanisms

Expected Outcomes:
- Comprehensive literature review document
- Technical analysis report with code examples
- Policy recommendations for safe AI development
- Presentation of findings to research group`,
}

// Interactive wrapper component for stories
function InteractiveWrapper({
  children,
  initialText = samplePlans.medium,
  title = 'Edit Plan',
}: {
  children: (props: {
    visible: boolean
    onClose: () => void
    onSave: (text: string) => void
    initialText: string
    title: string
  }) => React.ReactNode
  initialText?: string
  title?: string
}) {
  const [visible, setVisible] = useState(false)
  const [savedText, setSavedText] = useState(initialText)

  return (
    <View className="gap-4 p-4">
      <View className="rounded-lg border border-border bg-card p-4">
        <Text className="text-foreground text-sm font-semibold mb-2">Current Plan:</Text>
        <Text className="text-muted-foreground text-sm" numberOfLines={4}>
          {savedText}
        </Text>
      </View>

      <Pressable
        onPress={() => setVisible(true)}
        className="flex-row items-center justify-center gap-2 rounded-lg bg-primary py-3 active:opacity-80"
      >
        <Edit size={16} className="text-primary-foreground" />
        <Text className="text-primary-foreground text-sm font-semibold">Edit Plan</Text>
      </Pressable>

      {children({
        visible,
        onClose: () => setVisible(false),
        onSave: (text) => {
          setSavedText(text)
          setVisible(false)
        },
        initialText: savedText,
        title,
      })}
    </View>
  )
}

export const Default: Story = {
  args: {
    visible: true,
    initialText: samplePlans.medium,
    title: 'Edit Plan',
    placeholder: 'Enter your plan details...',
    maxChars: 5000,
  },
}

export const ShortPlan: Story = {
  args: {
    visible: true,
    initialText: samplePlans.short,
    title: 'Edit Research Plan',
  },
}

export const LongPlan: Story = {
  args: {
    visible: true,
    initialText: samplePlans.long,
    title: 'Edit Comprehensive Plan',
  },
}

export const EmptyPlan: Story = {
  args: {
    visible: true,
    initialText: '',
    title: 'Create New Plan',
    placeholder: 'Enter your plan details here...',
  },
}

export const CustomTitle: Story = {
  args: {
    visible: true,
    initialText: samplePlans.medium,
    title: 'Edit Deep Research Plan',
    placeholder: 'Describe your research approach...',
  },
  parameters: {
    docs: {
      description: {
        story: 'Example with custom title and placeholder text.',
      },
    },
  },
}

export const WithCharacterLimit: Story = {
  args: {
    visible: true,
    initialText: samplePlans.medium,
    title: 'Edit Plan (200 char limit)',
    maxChars: 200,
  },
  parameters: {
    docs: {
      description: {
        story: 'Example with a reduced character limit to demonstrate the counter functionality.',
      },
    },
  },
}

// Interactive stories that demonstrate the full flow
export const Interactive: Story = {
  render: () => (
    <InteractiveWrapper>
      {(props) => <PlanEditBottomSheet {...props} />}
    </InteractiveWrapper>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Interactive example showing the complete edit flow. Click "Edit Plan" to open the sheet, make changes, and save.',
      },
    },
  },
}

export const InteractiveShort: Story = {
  render: () => (
    <InteractiveWrapper initialText={samplePlans.short} title="Edit Quick Plan">
      {(props) => <PlanEditBottomSheet {...props} />}
    </InteractiveWrapper>
  ),
}

export const InteractiveLong: Story = {
  render: () => (
    <InteractiveWrapper initialText={samplePlans.long} title="Edit Detailed Plan">
      {(props) => <PlanEditBottomSheet {...props} />}
    </InteractiveWrapper>
  ),
}

// Validation example
export const WithValidation: Story = {
  render: () => (
    <InteractiveWrapper
      initialText={samplePlans.medium}
      title="Edit Plan (Validated)"
    >
      {(props) => (
        <PlanEditBottomSheet
          {...props}
          validate={(text) => {
            if (text.length < 10) {
              return 'Plan must be at least 10 characters'
            }
            if (!text.includes('Phase') && !text.includes('Step')) {
              return 'Plan should include phases or steps'
            }
            return true
          }}
        />
      )}
    </InteractiveWrapper>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Example with custom validation. The plan must be at least 10 characters and include "Phase" or "Step".',
      },
    },
  },
}

// All variants showcase
export const AllVariants: Story = {
  render: () => (
    <View className="gap-6 p-4">
      <View>
        <Text className="text-foreground text-base font-semibold mb-2">
          Plan Edit Sheet Examples
        </Text>
        <Text className="text-muted-foreground text-sm">
          Different configurations of the PlanEditBottomSheet component
        </Text>
      </View>

      <View className="gap-3">
        <View className="rounded-lg border border-border bg-muted/30 p-3">
          <Text className="text-muted-foreground text-xs font-semibold uppercase mb-1">
            Default
          </Text>
          <Text className="text-foreground text-sm">
            Standard edit sheet with medium-length plan
          </Text>
        </View>

        <View className="rounded-lg border border-border bg-muted/30 p-3">
          <Text className="text-muted-foreground text-xs font-semibold uppercase mb-1">
            Empty State
          </Text>
          <Text className="text-foreground text-sm">
            Create new plan with placeholder text
          </Text>
        </View>

        <View className="rounded-lg border border-border bg-muted/30 p-3">
          <Text className="text-muted-foreground text-xs font-semibold uppercase mb-1">
            With Validation
          </Text>
          <Text className="text-foreground text-sm">
            Custom validation rules before saving
          </Text>
        </View>

        <View className="rounded-lg border border-border bg-muted/30 p-3">
          <Text className="text-muted-foreground text-xs font-semibold uppercase mb-1">
            Character Limit
          </Text>
          <Text className="text-foreground text-sm">
            Reduced limit with counter display
          </Text>
        </View>
      </View>
    </View>
  ),
}

// Play function for testing interactions
export const WithInteractions: Story = {
  args: {
    visible: true,
    initialText: samplePlans.medium,
    title: 'Edit Plan',
  },
  play: async ({ canvasElement }) => {
    // This story is for visual inspection of the component
    // Interactive testing would require a more complex setup
    const canvas = canvasElement as HTMLElement

    // Verify sheet is rendered
    const sheet = canvas.querySelector('[data-testid="plan-edit-bottom-sheet"]')
    if (!sheet) {
      throw new Error('PlanEditBottomSheet not found')
    }

    // Verify backdrop exists
    const backdrop = canvas.querySelector('[data-testid="plan-edit-bottom-sheet-backdrop"]')
    if (!backdrop) {
      throw new Error('Backdrop not found')
    }

    // Verify save button exists
    const saveButton = canvas.querySelector('[data-testid="plan-edit-bottom-sheet-save-button"]')
    if (!saveButton) {
      throw new Error('Save button not found')
    }

    // Verify cancel button exists
    const cancelButton = canvas.querySelector('[data-testid="plan-edit-bottom-sheet-cancel-button"]')
    if (!cancelButton) {
      throw new Error('Cancel button not found')
    }
  },
}
