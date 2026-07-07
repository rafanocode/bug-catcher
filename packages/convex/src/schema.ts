import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export default defineSchema({
  submissions: defineTable({
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
    linearStatus: v.union(v.literal('pending'), v.literal('created'), v.literal('failed')),
    linearIssueUrl: v.optional(v.string()),
    linearError: v.optional(v.string()),
  }),
})
