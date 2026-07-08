import { v } from 'convex/values'
import { internalQuery } from '../_generated/server'

export const allow = internalQuery({
  args: {},
  returns: v.boolean(),
  handler: async () => true,
})

export const deny = internalQuery({
  args: {},
  returns: v.boolean(),
  handler: async () => false,
})
