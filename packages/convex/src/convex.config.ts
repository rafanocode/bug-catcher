import { defineComponent } from 'convex/server'
import { v } from 'convex/values'
import rateLimiter from '@convex-dev/rate-limiter/convex.config.js'

const component = defineComponent('bugCatcher', {
  env: {
    LINEAR_API_KEY: v.string(),
    LINEAR_TEAM_ID: v.string(),
    LINEAR_PROJECT_ID: v.optional(v.string()),
  },
})
component.use(rateLimiter)

export default component
