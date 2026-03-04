/**
 * Task Timeout Worker Edge Function
 *
 * Cron job worker that marks stuck tasks as errored.
 * - POST: Runs timeout_stuck_tasks() RPC to mark long-running tasks as errors
 * - Requires CRON_SECRET header for security
 *
 * This function should be called by a Supabase cron job on a regular interval
 * (e.g., every 5-10 minutes) to clean up tasks that have been running too long.
 *
 * Default timeout: 60 minutes (configurable via request body)
 *
 * @see US-XXX - Long Running Tasks
 * @see supabase/migrations/20260304_create_long_running_tasks.sql
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { log } from '../_shared/logging/index.ts'

// ============================================================
// Types
// ============================================================

interface TimeoutRequest {
  timeout_minutes?: number
}

interface TimeoutResponse {
  timed_out_count: number
  timeout_minutes: number
}

interface ErrorResponse {
  error: string
}

// ============================================================
// Response Helper
// ============================================================

function jsonResponse<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// ============================================================
// Main Handler
// ============================================================

Deno.serve(async (req: Request) => {
  const logger = log('task-timeout-worker')

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  // Only accept POST
  if (req.method !== 'POST') {
    logger.warn('Method not allowed', { method: req.method })
    return jsonResponse<ErrorResponse>({ error: 'Method not allowed' }, 405)
  }

  // Verify CRON_SECRET header
  const cronSecret = req.headers.get('CRON_SECRET')
  const expectedSecret = Deno.env.get('CRON_SECRET')

  if (!cronSecret || !expectedSecret || cronSecret !== expectedSecret) {
    logger.warn('Unauthorized cron access attempt', {
      hasSecret: !!cronSecret,
      expectedSecretSet: !!expectedSecret,
    })
    return jsonResponse<ErrorResponse>({ error: 'Unauthorized' }, 401)
  }

  // Get environment variables
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    logger.error('Server configuration error', {
      hasUrl: !!supabaseUrl,
      hasKey: !!supabaseServiceRoleKey,
    })
    return jsonResponse<ErrorResponse>({ error: 'Server configuration error' }, 500)
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

  // Parse request body (optional)
  let timeoutMinutes = 60 // Default 60 minutes

  try {
    const body = await req.json() as TimeoutRequest
    if (body.timeout_minutes && typeof body.timeout_minutes === 'number') {
      timeoutMinutes = body.timeout_minutes
    }
  } catch {
    // Use default timeout if body is missing or invalid JSON
  }

  logger.info('Starting task timeout check', { timeoutMinutes })

  try {
    // Call timeout_stuck_tasks RPC function
    // @ts-ignore - Supabase type inference issue
    const { data, error } = await (supabase as any).rpc('timeout_stuck_tasks', {
      p_timeout_minutes: timeoutMinutes,
    })

    if (error) {
      logger.error('RPC call failed', { error: error.message, timeoutMinutes })
      return jsonResponse<ErrorResponse>({ error: 'Failed to timeout tasks' }, 500)
    }

    const timedOutCount = data as number || 0

    logger.info('Task timeout check complete', {
      timedOutCount,
      timeoutMinutes,
    })

    return jsonResponse<TimeoutResponse>({
      timed_out_count: timedOutCount,
      timeout_minutes: timeoutMinutes,
    })

  } catch (err) {
    logger.error('Request failed', { error: err, timeoutMinutes })
    return jsonResponse<ErrorResponse>({ error: 'Internal server error' }, 500)
  }
})
