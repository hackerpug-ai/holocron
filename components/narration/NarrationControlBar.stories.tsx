import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { NarrationControlBar } from './NarrationControlBar'
import type { UseNarrationStateReturn } from './hooks/useNarrationState'

// ─── Mock Factory ─────────────────────────────────────────────────────────────

function makeMockNarration(overrides: Partial<UseNarrationStateReturn['state']>): UseNarrationStateReturn {
  const state: UseNarrationStateReturn['state'] = {
    status: 'paused',
    activeParagraphIndex: 2,
    totalParagraphs: 12,
    generatedCount: 12,
    currentTimeSeconds: 42,
    totalTimeSeconds: 195,
    playbackSpeed: 1,
    ...overrides,
  }

  return {
    state,
    isNarrationMode: state.status !== 'idle',
    enterNarrationMode: () => {},
    exitNarrationMode: () => {},
    togglePlayPause: () => {},
    skipToParagraph: () => {},
    skipPrevious: () => {},
    skipNext: () => {},
    setSpeed: () => {},
    regenerate: () => {},
    onParagraphReady: () => {},
    onAllReady: () => {},
    onTick: () => {},
  }
}

// ─── Meta ─────────────────────────────────────────────────────────────────────

const meta: Meta<typeof NarrationControlBar> = {
  title: 'Narration/NarrationControlBar',
  component: NarrationControlBar,
  parameters: {
    docs: {
      description: {
        component:
          'Fixed bottom bar that slides up when narration mode is active. Shows a progress stripe, playback controls, paragraph counter, speed control, and regenerate button.',
      },
    },
  },
  decorators: [
    (Story) => (
      <View style={{ height: 160, position: 'relative' }}>
        <Story />
      </View>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof NarrationControlBar>

// ─── Stories ──────────────────────────────────────────────────────────────────

/**
 * Paused at paragraph 3 of 12, 42 seconds elapsed out of 3:15 total.
 */
export const Default: Story = {
  args: {
    narration: makeMockNarration({
      status: 'paused',
      activeParagraphIndex: 2,
      totalParagraphs: 12,
      currentTimeSeconds: 42,
      totalTimeSeconds: 195,
      playbackSpeed: 1,
    }),
    isVisible: true,
  },
}

/**
 * Same position as Default but actively playing.
 */
export const Playing: Story = {
  args: {
    narration: makeMockNarration({
      status: 'playing',
      activeParagraphIndex: 2,
      totalParagraphs: 12,
      currentTimeSeconds: 42,
      totalTimeSeconds: 195,
      playbackSpeed: 1,
    }),
    isVisible: true,
  },
}

/**
 * Still generating audio — shows ActivityIndicator in the play button
 * and an amber progress stripe indicating generation progress (8 of 24 paragraphs).
 */
export const Generating: Story = {
  args: {
    narration: makeMockNarration({
      status: 'generating',
      activeParagraphIndex: -1,
      totalParagraphs: 24,
      generatedCount: 8,
      currentTimeSeconds: 0,
      totalTimeSeconds: 0,
      playbackSpeed: 1,
    }),
    isVisible: true,
  },
}

/**
 * On the last paragraph — skip-next button is disabled (opacity-40).
 */
export const AtEnd: Story = {
  args: {
    narration: makeMockNarration({
      status: 'paused',
      activeParagraphIndex: 11,
      totalParagraphs: 12,
      currentTimeSeconds: 185,
      totalTimeSeconds: 195,
      playbackSpeed: 1,
    }),
    isVisible: true,
  },
}

/**
 * Hidden state — bar is translated off-screen below the viewport.
 */
export const Hidden: Story = {
  args: {
    narration: makeMockNarration({}),
    isVisible: false,
  },
}

/**
 * All four stories side-by-side for a quick visual overview.
 */
export const AllStates: Story = {
  render: () => (
    <View style={{ gap: 160 }}>
      {(
        [
          { label: 'Default (paused)', overrides: { status: 'paused' as const, activeParagraphIndex: 2, totalParagraphs: 12, currentTimeSeconds: 42, totalTimeSeconds: 195 } },
          { label: 'Playing', overrides: { status: 'playing' as const, activeParagraphIndex: 2, totalParagraphs: 12, currentTimeSeconds: 42, totalTimeSeconds: 195 } },
          { label: 'Generating', overrides: { status: 'generating' as const, activeParagraphIndex: -1, totalParagraphs: 24, generatedCount: 8, currentTimeSeconds: 0, totalTimeSeconds: 0 } },
          { label: 'AtEnd', overrides: { status: 'paused' as const, activeParagraphIndex: 11, totalParagraphs: 12, currentTimeSeconds: 185, totalTimeSeconds: 195 } },
        ] as const
      ).map(({ overrides }) => (
        <View key={overrides.status + String(overrides.activeParagraphIndex)} style={{ height: 160, position: 'relative' }}>
          <NarrationControlBar
            narration={makeMockNarration(overrides)}
            isVisible={true}
          />
        </View>
      ))}
    </View>
  ),
}
