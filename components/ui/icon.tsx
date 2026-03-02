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
      height: 'size',
      width: 'size',
    },
  },
});

// Expo Icon Implementation with className support
function ExpoIconImpl({ as: IconComponent, className, style, ...props }: ExpoIconProps) {
  return <IconComponent style={style} {...props} />;
}

cssInterop(ExpoIconImpl, {
  className: {
    target: 'style',
    nativeStyleToProp: {
      height: 'size',
      width: 'size',
    },
  },
});

/**
 * A unified wrapper component for both Lucide icons and Expo vector icons with Nativewind `className` support.
 *
 * This component allows you to render any Lucide or Expo vector icon while applying utility classes
 * using `nativewind`. For Expo vector icons, it wraps them to ensure web compatibility.
 *
 * @component
 * @example
 * ```tsx
 * // Lucide icon
 * import { ArrowRight } from 'lucide-react-native';
 * import { Icon } from '@/components/ui/icon';
 *
 * <Icon as={ArrowRight} className="text-red-500" size={16} />
 *
 * // Expo vector icon
 * import { Icon, MaterialCommunityIcon } from '@/components/ui/icon';
 *
 * <Icon as={MaterialCommunityIcon} name="home" size={24} color="#6750A4" />
 * ```
 *
 * @param {LucideIcon | typeof MaterialCommunityIcon} as - The icon component to render.
 * @param {string} className - Utility classes to style the icon using Nativewind.
 * @param {number} size - Icon size (defaults to 14 for Lucide, varies for Expo).
 * @param {...LucideProps | IconProps} ...props - Additional icon props passed to the "as" icon.
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
