/**
 * ImprovementPreviewThumbnail — real fixture dimensions for attach preview (S-UPLOAD-01 AC-4).
 *
 * Renders the picked image URI at the provided natural dimensions (e.g. 800×600).
 * Empty-attach prompt is only shown when uri is empty.
 */

import { Image, StyleSheet, View } from 'react-native';
import { radius, spacing } from '@/lib/theme';

export type ImprovementPreviewThumbnailProps = {
  uri: string;
  width: number;
  height: number;
  testID?: string;
};

export function ImprovementPreviewThumbnail({
  uri,
  width,
  height,
  testID = 'attach-preview',
}: ImprovementPreviewThumbnailProps) {
  if (!uri) {
    return <View testID="attach-prompt-empty" />;
  }

  const safeWidth = width > 0 ? width : 1;
  const safeHeight = height > 0 ? height : 1;
  const aspectRatio = safeWidth / safeHeight;
  // Cap height so submit controls stay visible on small screens / Maestro.
  const maxHeight = spacing['4xl'] * 2 + spacing['2xl'];

  return (
    <View
      testID={`${testID}-frame`}
      style={[styles.frame, { maxHeight, marginBottom: spacing.sm, borderRadius: radius.lg }]}
    >
      <Image
        source={{ uri }}
        resizeMode="contain"
        testID={testID}
        accessibilityLabel={`Image preview ${safeWidth}x${safeHeight}`}
        className="border border-border"
        style={[
          styles.preview,
          {
            aspectRatio,
            maxHeight,
            borderRadius: radius.lg,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    overflow: 'hidden',
  },
  preview: {
    width: '100%',
  },
});
