import { v } from 'convex/values'
import { internalQuery } from './_generated/server'

// This is the real security boundary — replace with your own role/org
// check. For the demo, any signed-in user is authorized.
export const authorize = internalQuery({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    return identity != null
  },
})
