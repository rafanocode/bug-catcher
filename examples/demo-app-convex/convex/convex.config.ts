import { defineApp } from 'convex/server'
import { v } from 'convex/values'
import bugCatcher from 'bug-catcher-convex/convex.config.js'

// `env` here declares bindings *by reference* (`app.env.X`), resolved from
// this deployment's own env-var store (the one `npx convex env set`
// writes to) — not a `process.env.X!` snapshot of the local shell. See
// bug-catcher-convex's README, Setup Step 2/3, for why this distinction
// matters: a `process.env` literal would bake in whatever's in the local
// shell at push time instead of staying live-bound to the deployment.
const app = defineApp({
  env: {
    LINEAR_API_KEY: v.string(),
    LINEAR_TEAM_ID: v.string(),
  },
})
app.use(bugCatcher, {
  env: {
    LINEAR_API_KEY: app.env.LINEAR_API_KEY,
    LINEAR_TEAM_ID: app.env.LINEAR_TEAM_ID,
  },
})

export default app
