/**
 * Image upload status strip for ImprovementSubmitSheet (S-UPLOAD-01).
 * Renders progress / success / error+retry with stable testIDs.
 */

import { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/text';
import type { ImageUploadPhase } from '@/hooks/use-image-upload';
import { useTheme } from '@/hooks/use-theme';

export type ImageUploadStatusProps = {
  phase: ImageUploadPhase;
  error?: string | null;
  /** When true and phase is error, show the retry control. */
  canRetry?: boolean;
  onRetry?: () => void;
  /** Optional Zero-synced content hash label (post-finalize). */
  zeroContentHash?: string | null;
  zeroSynced?: boolean;
};

export function ImageUploadStatus({
  phase,
  error,
  canRetry = false,
  onRetry,
  zeroContentHash,
  zeroSynced = false,
}: ImageUploadStatusProps) {
  const { colors, spacing } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        statusRow: {
          alignItems: 'center',
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: spacing.sm,
          marginBottom: spacing.md,
        },
        errorBox: {
          gap: spacing.sm,
          marginBottom: spacing.md,
        },
      }),
    [spacing.md, spacing.sm]
  );

  if (phase === 'uploading') {
    return (
      <View testID="upload-progress" style={styles.statusRow}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text className="text-muted-foreground text-sm">Uploading image…</Text>
      </View>
    );
  }

  if (phase === 'success') {
    // ANTI-STUB: upload-success requires a real 64-hex CAS content hash.
    // Text-only submit must never claim upload success without CAS.
    const hasCas = typeof zeroContentHash === 'string' && /^[0-9a-f]{64}$/i.test(zeroContentHash);
    if (!hasCas) {
      return null;
    }
    return (
      <View testID="upload-success" style={styles.statusRow}>
        <Text className="text-success text-sm font-semibold">Upload complete</Text>
        <View
          testID="zero-file-object"
          accessibilityLabel={
            zeroSynced
              ? `Zero-synced file object ${zeroContentHash}`
              : `Observing file object ${zeroContentHash}`
          }
        >
          <Text className="text-muted-foreground text-xs">
            {zeroSynced ? `Synced ${zeroContentHash.slice(0, 12)}…` : 'Syncing…'}
          </Text>
        </View>
      </View>
    );
  }

  if (phase === 'error' && error) {
    return (
      <View testID="upload-error" style={styles.errorBox}>
        <Text className="text-destructive text-sm">{error}</Text>
        {canRetry ? (
          <Pressable
            testID="upload-retry"
            onPress={onRetry}
            accessibilityRole="button"
            accessibilityLabel="Retry image upload"
          >
            <Text className="text-primary text-sm font-semibold">Retry</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return null;
}
