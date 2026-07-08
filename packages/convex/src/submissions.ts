import { v } from 'convex/values'
import { internalMutation } from './_generated/server'

export const insert = internalMutation({
  args: {
    tokenIdentifier: v.string(),
    url: v.string(),
    userAgent: v.string(),
    description: v.string(),
    consoleEntries: v.array(
      v.object({
        level: v.string(),
        args: v.array(v.any()),
        timestamp: v.number(),
      }),
    ),
    screenshotId: v.id('_storage'),
  },
  returns: v.id('submissions'),
  handler: async (ctx, args) => {
    return await ctx.db.insert('submissions', {
      ...args,
      linearStatus: 'pending',
    })
  },
})

export const updateLinearStatus = internalMutation({
  args: {
    submissionId: v.id('submissions'),
    linearStatus: v.union(v.literal('created'), v.literal('failed')),
    linearIssueUrl: v.optional(v.string()),
    linearError: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.submissionId, {
      linearStatus: args.linearStatus,
      linearIssueUrl: args.linearIssueUrl,
      linearError: args.linearError,
    })
    return null
  },
})
