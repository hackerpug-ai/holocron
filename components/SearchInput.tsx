import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { Search, X } from 'lucide-react-native'
import { Pressable, View, type ViewProps } from 'react-native'

interface SearchInputProps extends Omit<ViewProps, 'children'> {
  /** Current search value */
  value: string
  /** Callback when value changes */
  onChangeText: (text: string) => void
  /** Placeholder text */
  placeholder?: string
  /** Callback when search is submitted */
  onSubmit?: () => void
  /** Callback when clear button is pressed */
  onClear?: () => void
  /** Whether the input is disabled */
  disabled?: boolean
  /** Whether to auto-focus the input */
  autoFocus?: boolean
}

/**
 * SearchInput provides a search field with icon and clear button.
 * Used for searching the knowledge base and filtering content.
 */
export function SearchInput({
  value,
  onChangeText,
  placeholder = 'Search...',
  onSubmit,
  onClear,
  disabled = false,
  autoFocus = false,
  className,
  ...props
}: SearchInputProps) {
  const handleClear = () => {
    onChangeText('')
    onClear?.()
  }

  return (
    <View
      className={cn('bg-input relative flex-row items-center rounded-lg', className)}
      testID="search-input-container"
      {...props}
    >
      <View className="absolute left-3 z-10">
        <Search size={18} className="text-muted-foreground" />
      </View>
      <Input
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        onSubmitEditing={onSubmit}
        editable={!disabled}
        autoFocus={autoFocus}
        className={cn(
          'border-0 bg-transparent pl-10 pr-10',
          disabled && 'opacity-50'
        )}
        testID="search-input"
        returnKeyType="search"
      />
      {value.length > 0 && (
        <Pressable
          onPress={handleClear}
          className="absolute right-3 z-10 rounded-full p-1 active:bg-black/5"
          testID="search-input-clear"
          disabled={disabled}
        >
          <X size={16} className="text-muted-foreground" />
        </Pressable>
      )}
    </View>
  )
}
