import type { Meta, StoryObj } from '@storybook/react'
import { HelloWorld } from './HelloWorld'

const meta: Meta<typeof HelloWorld> = {
  title: 'Components/HelloWorld',
  component: HelloWorld,
  argTypes: {
    title: {
      control: 'text',
      description: 'Primary heading text',
    },
    subtitle: {
      control: 'text',
      description: 'Secondary description text',
    },
    variant: {
      control: 'select',
      options: ['default', 'accent', 'muted'],
      description: 'Visual variant of the component',
    },
    showIcon: {
      control: 'boolean',
      description: 'Whether to display the icons',
    },
  },
  args: {
    title: 'Hello, Holocron',
    subtitle: 'Your research knowledge base is ready.',
    variant: 'default',
    showIcon: true,
  },
}

export default meta

type Story = StoryObj<typeof HelloWorld>

export const Default: Story = {}

export const Accent: Story = {
  args: {
    variant: 'accent',
    title: 'Research Mode',
    subtitle: 'Deep dive into your knowledge base.',
  },
}

export const Muted: Story = {
  args: {
    variant: 'muted',
    title: 'Archive',
    subtitle: 'Browse your saved research.',
    showIcon: false,
  },
}

export const AllVariants: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <HelloWorld variant="default" title="Default" subtitle="The standard card style" />
      <HelloWorld variant="accent" title="Accent" subtitle="Highlighted important content" />
      <HelloWorld variant="muted" title="Muted" subtitle="Secondary or archived content" showIcon={false} />
    </div>
  ),
}
