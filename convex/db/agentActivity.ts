import { v } from 'convex/values'
import { query } from '../_generated/server'

export const get = query({
  args: {
    threadId: v.string(),
  },
  handler: async (_ctx, _args) => {
    // Stub — backend implementation in separate task
    return null
  },
})
