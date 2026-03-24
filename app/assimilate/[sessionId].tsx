/**
 * Assimilation Plan Detail View
 *
 * Full-screen view of the assimilation plan content with approve/reject actions.
 * Follows the document viewer pattern for markdown rendering.
 *
 * Route: /assimilate/[sessionId]
 */

import { useLocalSearchParams, useRouter } from 'expo-router'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import {
  ActivityIndicator,
  ScrollView,
  TextInput,
  View,
} from 'react-native'
import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { ScreenLayout } from '@/components/ui/screen-layout'
import { MarkdownView } from '@/components/markdown/MarkdownView'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useState } from 'react'

/** Human-readable label for each session status. */
function statusLabel(status: string): string {
  switch (status) {
    case 'pending_approval': return 'Pending Approval'
    case 'approved': return 'Approved'
    case 'rejected': return 'Rejected'
    case 'planning': return 'Planning'
    case 'in_progress': return 'In Progress'
    case 'synthesizing': return 'Synthesizing'
    case 'completed': return 'Completed'
    case 'failed': return 'Failed'
    case 'cancelled': return 'Cancelled'
    default: return status
  }
}

/** Tailwind className for the status badge background + text. */
function statusBadgeClass(status: string): string {
  switch (status) {
    case 'pending_approval': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
    case 'approved':
    case 'completed': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
    case 'rejected':
    case 'failed':
    case 'cancelled': return 'bg-destructive/10 text-destructive'
    case 'in_progress':
    case 'synthesizing': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
    default: return 'bg-muted text-muted-foreground'
  }
}

export default function AssimilationPlanRoute() {
  const router = useRouter()
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>()
  const insets = useSafeAreaInsets()

  const [showRejectInput, setShowRejectInput] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const approve = useMutation(api.assimilate.mutations.approveAssimilationPlan)
  const reject = useMutation(api.assimilate.mutations.rejectAssimilationPlan)

  const isValidId = sessionId && sessionId !== 'undefined' && sessionId.length > 0

  const session = useQuery(
    api.assimilate.queries.getAssimilationSession,
    isValidId ? { sessionId: sessionId as Id<'assimilationSessions'> } : 'skip'
  )

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back()
    } else {
      router.navigate('/')
    }
  }

  const handleApprove = async () => {
    if (!isValidId || isSubmitting) return
    setIsSubmitting(true)
    try {
      await approve({ sessionId: sessionId as Id<'assimilationSessions'> })
      router.back()
    } catch (err) {
      console.warn('[AssimilationPlanRoute] Approve error:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRejectTap = () => {
    setShowRejectInput(true)
  }

  const handleSubmitFeedback = async () => {
    if (!isValidId || isSubmitting) return
    setIsSubmitting(true)
    try {
      await reject({
        sessionId: sessionId as Id<'assimilationSessions'>,
        feedback: feedback.trim() || undefined,
      })
      router.back()
    } catch (err) {
      console.warn('[AssimilationPlanRoute] Reject error:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCancelReject = () => {
    setShowRejectInput(false)
    setFeedback('')
  }

  // Loading state
  if (isValidId && session === undefined) {
    return (
      <ScreenLayout
        header={{ title: 'Assimilation Plan', showBack: true, onBack: handleBack }}
        edges="bottom"
        testID="assimilation-plan-loading-layout"
      >
        <View className="flex-1 items-center justify-center" testID="assimilation-plan-loading">
          <ActivityIndicator size="large" testID="assimilation-plan-loading-indicator" />
        </View>
      </ScreenLayout>
    )
  }

  // Error: invalid ID
  if (!isValidId) {
    return (
      <ScreenLayout
        header={{ title: 'Not Found', showBack: true, onBack: handleBack }}
        edges="bottom"
        testID="assimilation-plan-invalid-id-layout"
      >
        <View className="flex-1 items-center justify-center p-6" testID="assimilation-plan-invalid-id">
          <Text className="text-muted-foreground text-center text-lg">
            Invalid session ID.
          </Text>
        </View>
      </ScreenLayout>
    )
  }

  // Error: not found
  if (session === null) {
    return (
      <ScreenLayout
        header={{ title: 'Not Found', showBack: true, onBack: handleBack }}
        edges="bottom"
        testID="assimilation-plan-error-layout"
      >
        <View className="flex-1 items-center justify-center p-6" testID="assimilation-plan-error">
          <Text className="text-muted-foreground text-center text-lg">
            Session not found.
          </Text>
          <Button onPress={handleBack} className="mt-4">
            <Text>Go Back</Text>
          </Button>
        </View>
      </ScreenLayout>
    )
  }

  const isPendingApproval = session.status === 'pending_approval'
  const bottomBarHeight = isPendingApproval ? (showRejectInput ? 180 : 100) : 0

  return (
    <ScreenLayout
      header={{
        title: 'Assimilation Plan',
        showBack: true,
        onBack: handleBack,
      }}
      edges="none"
      testID="assimilation-plan-layout"
    >
      <View style={{ flex: 1 }}>
        <ScrollView
          className="flex-1"
          contentContainerClassName="p-6"
          contentContainerStyle={{
            paddingBottom: bottomBarHeight + insets.bottom + 24,
          }}
          testID="assimilation-plan-scroll"
          showsVerticalScrollIndicator
        >
          {/* Repo name + status badge */}
          <View className="mb-4 flex-row flex-wrap items-center gap-3">
            {session.repositoryName ? (
              <Text className="text-foreground font-semibold text-base">
                {session.repositoryName}
              </Text>
            ) : null}
            <View
              className={`rounded-full px-2.5 py-0.5 ${statusBadgeClass(session.status)}`}
              testID="assimilation-plan-status-badge"
            >
              <Text className="text-xs font-medium">
                {statusLabel(session.status)}
              </Text>
            </View>
          </View>

          {/* Plan summary (if present) */}
          {session.planSummary ? (
            <Text className="text-muted-foreground mb-4 text-sm leading-relaxed">
              {session.planSummary}
            </Text>
          ) : null}

          {/* Plan content as markdown */}
          {session.planContent ? (
            <MarkdownView
              content={session.planContent}
              contentOnly
              testID="assimilation-plan-markdown"
            />
          ) : (
            <Text className="text-muted-foreground text-sm italic">
              No plan content available yet.
            </Text>
          )}
        </ScrollView>

        {/* Sticky bottom action bar — only when pending_approval */}
        {isPendingApproval && (
          <View
            className="border-t border-border bg-background px-4 pt-3"
            style={{ paddingBottom: insets.bottom + 12 }}
            testID="assimilation-plan-action-bar"
          >
            {showRejectInput ? (
              /* Reject feedback input */
              <View className="gap-3" testID="assimilation-plan-reject-input-area">
                <TextInput
                  className="border border-border rounded-md bg-input px-3 py-2 text-foreground text-sm min-h-[64px]"
                  placeholder="Optional: describe what to revise…"
                  placeholderTextColor="#9ca3af"
                  value={feedback}
                  onChangeText={setFeedback}
                  multiline
                  testID="assimilation-plan-feedback-input"
                  accessibilityLabel="Rejection feedback"
                />
                <View className="flex-row gap-3">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onPress={handleCancelReject}
                    disabled={isSubmitting}
                    testID="assimilation-plan-cancel-reject-button"
                  >
                    <Text>Cancel</Text>
                  </Button>
                  <Button
                    variant="destructive"
                    className="flex-1"
                    onPress={handleSubmitFeedback}
                    disabled={isSubmitting}
                    testID="assimilation-plan-submit-feedback-button"
                  >
                    {isSubmitting ? (
                      <ActivityIndicator size="small" color="white" />
                    ) : (
                      <Text>Submit Feedback</Text>
                    )}
                  </Button>
                </View>
              </View>
            ) : (
              /* Approve / Reject buttons */
              <View className="flex-row gap-3" testID="assimilation-plan-approve-reject-area">
                <Button
                  variant="outline"
                  className="flex-1"
                  onPress={handleRejectTap}
                  disabled={isSubmitting}
                  testID="assimilation-plan-reject-button"
                >
                  <Text>Reject</Text>
                </Button>
                <Button
                  className="flex-1"
                  onPress={handleApprove}
                  disabled={isSubmitting}
                  testID="assimilation-plan-approve-button"
                >
                  {isSubmitting ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <Text>Approve</Text>
                  )}
                </Button>
              </View>
            )}
          </View>
        )}
      </View>
    </ScreenLayout>
  )
}
