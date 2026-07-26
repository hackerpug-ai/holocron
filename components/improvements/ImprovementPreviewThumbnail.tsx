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

  return (
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
          borderRadius: radius.lg,
          marginBottom: spacing.sm,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  preview: {
    width: '100%',
  },
});
