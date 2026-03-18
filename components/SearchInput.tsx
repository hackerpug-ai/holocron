import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { Search, X } from 'lucide-react-native'
import { useRef, useEffect, useCallback } from 'react'
import { Pressable, View, type ViewProps, type TextInput, InteractionManager, KeyboardAvoidingView, Platform } from 'react-native'

interface SearchInputProps extends Omit<ViewProps, 'children'> {
  /** Current search value */
  value: string
  /** Callback when value changes */
  onChangeText: (_text: string) => void
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
 *
 * Uses a ref to track and preserve focus state across re-renders,
 * preventing keyboard dismissal during search operations.
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
  const inputRef = useRef<TextInput>(null)
  const wasFocusedRef = useRef(false)
  const isRestoringFocusRef = useRef(false)

  // Track focus state
  const handleFocus = useCallback(() => {
    wasFocusedRef.current = true
    isRestoringFocusRef.current = false
  }, [])

  const handleBlur = useCallback(() => {
    // Don't clear focus state if we're in the middle of restoring focus
    // This prevents the blur event from the re-render from clearing our flag
    if (!isRestoringFocusRef.current) {
      // Small delay to check if focus is being restored
      setTimeout(() => {
        if (!isRestoringFocusRef.current) {
          wasFocusedRef.current = false
        }
      }, 50)
    }
  }, [])

  // Restore focus after re-render if it was previously focused
  useEffect(() => {
    if (wasFocusedRef.current && inputRef.current) {
      isRestoringFocusRef.current = true
      // Use InteractionManager to wait for animations/transitions to complete
      // This is more reliable than requestAnimationFrame on React Native
      const handle = InteractionManager.runAfterInteractions(() => {
        if (inputRef.current && wasFocusedRef.current) {
          inputRef.current.focus()
        }
        isRestoringFocusRef.current = false
      })
      return () => handle.cancel()
    }
  })

  const handleClear = () => {
    onChangeText('')
    onClear?.()
    // Keep focus on input after clearing
    inputRef.current?.focus()
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <View
        className={cn('bg-input relative flex-row items-center rounded-lg', className)}
        testID="search-input-container"
        {...props}
      >
        <View className="absolute left-3 z-10">
          <Search size={18} className="text-muted-foreground" />
        </View>
        <Input
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          onSubmitEditing={onSubmit}
          onFocus={handleFocus}
          onBlur={handleBlur}
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
    </KeyboardAvoidingView>
  )
}
