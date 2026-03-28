import React, { useRef, useState } from 'react'
import { Pressable, View } from 'react-native'
import ViewShot from 'react-native-view-shot'
import * as Haptics from 'expo-haptics'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  withSpring,
} from 'react-native-reanimated'

// ImprovementSubmitSheet will be imported once it exists
let ImprovementSubmitSheet: React.ComponentType<ImprovementSubmitSheetProps> | null = null
try {
   
  ImprovementSubmitSheet = require('./ImprovementSubmitSheet').ImprovementSubmitSheet
} catch {
  // Sheet not yet implemented — wrapper still captures screenshots and manages state
}

interface ImprovementSubmitSheetProps {
  visible: boolean
  onClose: () => void
  screenshotUri: string | undefined
  sourceComponent: string | undefined
}

export interface ImprovementLongPressWrapperProps {
  children: React.ReactNode
  /** Identifier for the component being reported (e.g. "ArticleCard", "ChatBubble") */
  sourceComponent?: string
  /** Disable long-press trigger entirely */
  disabled?: boolean
  /** Milliseconds before long-press fires (default: 400) */
  delayLongPress?: number
  testID?: string
}

/**
 * ImprovementLongPressWrapper
 *
 * Wraps any UI element so a long-press:
 *   1. Fires a haptic impact
 *   2. Pulses the wrapped content with a subtle scale animation
 *   3. Captures a screenshot of the wrapped content via ViewShot
 *   4. Opens ImprovementSubmitSheet with the screenshot pre-attached
 *
 * Usage:
 *   <ImprovementLongPressWrapper sourceComponent="ArticleCard">
 *     <ArticleCard ... />
 *   </ImprovementLongPressWrapper>
 */
export function ImprovementLongPressWrapper({
  children,
  sourceComponent,
  disabled = false,
  delayLongPress = 400,
  testID,
}: ImprovementLongPressWrapperProps) {
  const viewShotRef = useRef<ViewShot>(null)
  const [screenshotUri, setScreenshotUri] = useState<string | undefined>(undefined)
  const [sheetVisible, setSheetVisible] = useState(false)

  const scale = useSharedValue(1)

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }))

  const handleLongPress = async () => {
    if (disabled) return

    // 1. Haptic feedback
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)

    // 2. Scale pulse
    scale.value = withSequence(
      withTiming(0.97, { duration: 100 }),
      withSpring(1, { damping: 15, stiffness: 200 })
    )

    // 3. Capture screenshot
    const uri = await viewShotRef.current?.capture?.()

    // 4. Open sheet
    setScreenshotUri(uri)
    setSheetVisible(true)
  }

  const handleClose = () => {
    setSheetVisible(false)
    setScreenshotUri(undefined)
  }

  return (
    <View>
      <Pressable
        onLongPress={handleLongPress}
        delayLongPress={delayLongPress}
        disabled={disabled}
        testID={testID ?? 'improvement-long-press-wrapper'}
      >
        <Animated.View style={animatedStyle}>
          <ViewShot ref={viewShotRef} options={{ format: 'png', quality: 0.8 }}>
            {children}
          </ViewShot>
        </Animated.View>
      </Pressable>

      {sheetVisible && ImprovementSubmitSheet && (
        <ImprovementSubmitSheet
          visible={sheetVisible}
          onClose={handleClose}
          screenshotUri={screenshotUri}
          sourceComponent={sourceComponent}
        />
      )}
    </View>
  )
}
