import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { Pressable, type PressableProps } from "react-native";

interface FilterChipProps extends Omit<PressableProps, "children"> {
  /** The label to display */
  label: string;
  /** Whether the chip is currently selected */
  selected?: boolean;
  /** Test ID for the chip */
  testID?: string;
}

/**
 * FilterChip is a simple toggle chip for filtering.
 * Has only 2 visual states: selected and unselected.
 * Use for filter bars, not for labeling content.
 */
export function FilterChip({
  label,
  selected = false,
  disabled,
  className,
  testID,
  ...props
}: FilterChipProps) {
  return (
    <Pressable
      className={cn(
        // Base styles
        "rounded-full px-3 py-1.5 border",
        // State: Unselected (default)
        "bg-transparent border-border",
        // State: Selected
        selected && "bg-primary border-primary",
        // State: Disabled
        disabled && "opacity-50",
        className,
      )}
      disabled={disabled}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled: disabled ?? false }}
      {...props}
    >
      <Text
        className={cn(
          "text-xs font-medium",
          // Text color based on selection state
          selected ? "text-primary-foreground" : "text-muted-foreground",
        )}
      >
        {label}
      </Text>
    </Pressable>
  );
}
