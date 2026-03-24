import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { cn } from '@/lib/utils'
import { AlertTriangle } from '@/components/ui/icons'
import type { ViewProps } from 'react-native'

export interface ConcurrencyLimitAlertProps extends ViewProps {
  /** Number of active tasks currently running */
  activeTaskCount?: number
  /** Maximum concurrent tasks allowed */
  maxConcurrentTasks?: number
  /** Optional className for styling */
  className?: string
}

/**
 * ConcurrencyLimitAlert displays a warning when task concurrency limit is exceeded.
 *
 * Shows an alert with:
 * - Title: "Too many active tasks"
 * - Description with dynamic count of running tasks
 * - Warning icon with appropriate styling
 *
 * @example
 * ```tsx
 * <ConcurrencyLimitAlert activeTaskCount={3} />
 * ```
 */
export function ConcurrencyLimitAlert({
  activeTaskCount = 3,
  maxConcurrentTasks = 3,
  className,
  ...props
}: ConcurrencyLimitAlertProps) {
  return (
    <Alert
      testID="concurrency-limit-alert"
      className={cn('bg-card', className)}
      icon={AlertTriangle}
      {...props}
    >
      <AlertTitle className="text-foreground">
        Too many active tasks
      </AlertTitle>
      <AlertDescription>
        You have {activeTaskCount} task{activeTaskCount !== 1 ? 's' : ''} running. Please wait for {activeTaskCount !== 1 ? 'them' : 'it'} to complete before starting a new one.
      </AlertDescription>
    </Alert>
  )
}
