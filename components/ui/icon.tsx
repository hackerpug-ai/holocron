import { cn } from '@/lib/utils';
import type { LucideIcon, LucideProps } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

// Lucide Icon Props
type LucideIconProps = LucideProps & {
  as: LucideIcon;
};

// Expo Icon Props - extract props from MaterialCommunityIcons component
type MaterialCommunityIconProps = ComponentProps<typeof MaterialCommunityIcons>;

type ExpoIconProps = MaterialCommunityIconProps & {
  as: typeof MaterialCommunityIcons;
};

// Combined Icon Props
type UnifiedIconProps = LucideIconProps | ExpoIconProps;

// Lucide Icon Implementation
function LucideIconImpl({ as: IconComponent, ...props }: LucideIconProps) {
  return <IconComponent {...props} />;
}

cssInterop(LucideIconImpl, {
  className: {
    target: 'style',
    nativeStyleToProp: {
      color: 'color',
      height: 'size',
      width: 'size',
    },
  },
});

// Expo Icon Implementation with className support
function ExpoIconImpl({ as: IconComponent, className, style, ...props }: ExpoIconProps) {
  return <IconComponent className={className} style={style} {...props} />;
}

cssInterop(ExpoIconImpl, {
  className: {
    target: 'style',
    nativeStyleToProp: {
      color: 'color',
      height: 'size',
      width: 'size',
    },
  },
});

/**
 * A unified wrapper component for both Lucide icons and Expo vector icons with Nativewind `className` support.
 *
 * **Prefer importing icons directly from `@/components/ui/icons` instead.**
 * This component is useful when you need the `as` pattern (e.g. for dynamic icon selection).
 *
 * @component
 * @example
 * ```tsx
 * // Prefer: direct import from icons barrel (has cssInterop built in)
 * import { ArrowRight } from '@/components/ui/icons';
 * <ArrowRight size={16} className="text-primary" />
 *
 * // Alternative: Icon wrapper for dynamic icon selection
 * import { Icon } from '@/components/ui/icon';
 * import { ArrowRight } from '@/components/ui/icons';
 * <Icon as={ArrowRight} className="text-primary" size={16} />
 *
 * // Expo vector icon (requires Icon wrapper)
 * import { Icon, MaterialCommunityIcon } from '@/components/ui/icon';
 * <Icon as={MaterialCommunityIcon} name="home" size={24} className="text-primary" />
 * ```
 */
function Icon({ as: IconComponent, className, size = 14, ...props }: UnifiedIconProps) {
  // Check if it's a Lucide icon (has displayName indicating lucide-react-native)
  const isLucide = 'displayName' in IconComponent && String(IconComponent.displayName).includes('lucide');

  if (isLucide) {
    return (
      <LucideIconImpl
        as={IconComponent as LucideIcon}
        className={cn('text-foreground', className)}
        size={size}
        {...(props as LucideProps)}
      />
    );
  }

  // Expo vector icon
  return (
    <ExpoIconImpl
      as={IconComponent as typeof MaterialCommunityIcons}
      className={className}
      size={typeof size === 'number' ? size : undefined}
      {...(props as Omit<ExpoIconProps, 'as' | 'size'>)}
    />
  );
}

// Export Expo icon components for convenience
export const MaterialCommunityIcon = MaterialCommunityIcons;

export { Icon };
