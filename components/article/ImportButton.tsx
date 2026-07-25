import { Plus } from 'lucide-react-native';
import { Pressable } from 'react-native';
import { useTheme } from '@/hooks/use-theme';
import { cn } from '@/lib/utils';

export interface ImportButtonProps {
  /** Callback when button is pressed */
  onPress?: () => void;
  /** Whether the button is disabled */
  disabled?: boolean;
  /** testID for testing */
  testID?: string;
  /** Optional className for styling */
  className?: string;
}

/**
 * ImportButton - A "+" button for importing text from external sources
 * Used in the articles screen to trigger the import modal
 */
export function ImportButton({
  onPress,
  disabled = false,
  testID = 'import-button',
  className,
}: ImportButtonProps) {
  const { colors: themeColors } = useTheme();

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel="Import article"
      className={cn(
        'items-center justify-center rounded-full',
        disabled ? 'opacity-50' : '',
        className
      )}
      style={{
        // A static native style is intentional: the previous Pressable style
        // callback was not painting in this screen, leaving the only import
        // affordance transparent and unreachable.
        backgroundColor: themeColors.primary,
        width: 36,
        height: 36,
        flexShrink: 0,
      }}
    >
      <Plus size={20} color={themeColors.primaryForeground} strokeWidth={2.5} />
    </Pressable>
  );
}
