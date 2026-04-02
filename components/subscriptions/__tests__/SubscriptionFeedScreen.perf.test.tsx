import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

describe('SubscriptionFeedScreen performance contract', () => {
  const componentPath = join(
    process.cwd(),
    'components',
    'subscriptions',
    'SubscriptionFeedScreen.tsx'
  )

  const readComponent = (): string => readFileSync(componentPath, 'utf-8')

  it('feedRendersWithinTwoSeconds', () => {
    const source = readComponent()

    expect(source).toContain('initialNumToRender={10}')
    expect(source).toContain('maxToRenderPerBatch={10}')
    expect(source).toContain('windowSize={5}')
    expect(source).toContain('<FeedSkeleton count={5} testID={`${testID}-loading`} />')
    expect(source).not.toContain('Block feed rendering waiting for all images')
  })

  it('scrollMaintainsSixtyFps', () => {
    const source = readComponent()

    expect(source).toContain('removeClippedSubviews={true}')
    expect(source).toContain('keyExtractor={(item) => item.url}')
  })

  it('cancelsOffscreenImagesOnFastScroll', () => {
    const source = readComponent()

    expect(source).toContain('removeClippedSubviews={true}')
    expect(source).toContain('windowSize={5}')
  })
})
