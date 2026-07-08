# bug-catcher-convex

Convex backend for [bug-catcher](https://github.com/rafanocode/bug-catcher) — a self-hostable bug-reporting widget that creates Linear issues.

## Important differences from the Supabase variant

- **Screenshot URLs are permanent, not signed/expiring.** Convex Storage's
  `getUrl()` grants public access to a file for as long as it exists —
  there is no bucket-privacy or 1-year-signed-URL equivalent here. If a
  screenshot could contain sensitive on-screen data, know that the link
  embedded in the Linear issue does not expire and isn't authenticated.
  The only way to revoke access is deleting the file from Convex Storage.
- **`authorize` requires a small amount of code in your own app** (a
  function handle), not just a config file edit. This is Convex's
  documented pattern for a component calling back into app-specific logic
  (the same mechanism Convex's own Migrations and Twilio components use).

## Setup

1. Install: `npm install bug-catcher-convex @convex-dev/rate-limiter`

2. In your `convex/convex.config.ts`, declare your app's own env vars and
   bind them to the component **by reference** (`app.env.X`), not by
   snapshotting a local `process.env` value. `EnvRef` bindings are resolved
   from the deployment's own env-var store (the one `npx convex env set`
   writes to in Step 5 below) — a `process.env.X!` literal here would
   instead snapshot whatever's in the *local shell* at push time, which is a
   different, disconnected value store:
   ```ts
   import { defineApp } from 'convex/server'
   import { v } from 'convex/values'
   import bugCatcher from 'bug-catcher-convex/convex.config.js'

   const app = defineApp({
     env: {
       LINEAR_API_KEY: v.string(),
       LINEAR_TEAM_ID: v.string(),
       LINEAR_PROJECT_ID: v.optional(v.string()),
     },
   })
   app.use(bugCatcher, {
     env: {
       LINEAR_API_KEY: app.env.LINEAR_API_KEY,
       LINEAR_TEAM_ID: app.env.LINEAR_TEAM_ID,
       LINEAR_PROJECT_ID: app.env.LINEAR_PROJECT_ID,
     },
   })

   export default app
   ```

3. Write your own `authorize` function — this is the real security
   boundary, required with no default:
   ```ts
   // convex/bugCatcherAuthorize.ts
   import { v } from 'convex/values'
   import { internalQuery } from './_generated/server'

   export const authorize = internalQuery({
     args: {},
     returns: v.boolean(),
     handler: async (ctx) => {
       const identity = await ctx.auth.getUserIdentity()
       return identity != null // replace with your own role/org check
     },
   })
   ```

4. Add the public HTTP route in your own `convex/http.ts`:
   ```ts
   import { httpRouter } from 'convex/server'
   import { httpAction } from './_generated/server'
   import { createFunctionHandle } from 'convex/server'
   import { components, internal } from './_generated/api'

   const http = httpRouter()

   http.route({
     path: '/bug-catcher-submit',
     method: 'POST',
     handler: httpAction(async (ctx, request) => {
       const identity = await ctx.auth.getUserIdentity()
       if (!identity) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

       const body = await request.json()
       const authorizeHandle = await createFunctionHandle(internal.bugCatcherAuthorize.authorize)

       try {
         const result = await ctx.runAction(components.bugCatcher.submissions.handleSubmit, {
           tokenIdentifier: identity.tokenIdentifier,
           screenshot: body.screenshot,
           url: body.url,
           userAgent: body.userAgent,
           consoleEntries: body.consoleEntries,
           description: body.description,
           authorizeHandle,
           rateLimitConfig: { maxRequests: 5, windowMinutes: 10 },
           // Linear's API key is NOT passed here — a security review of Task 4
           // found this would let a secret flow through Convex's own
           // action-call argument logging. handleSubmit reads
           // LINEAR_API_KEY/LINEAR_TEAM_ID directly from the component's own
           // environment instead (set via app.use(bugCatcher, { env: {...} })
           // in convex.config.ts below, matching how the Supabase variant of
           // this project reads Deno.env.get('LINEAR_API_KEY') server-side,
           // never as a request argument).
         })
         return new Response(JSON.stringify(result), { status: 200 })
       } catch (err) {
         const message = err instanceof Error ? err.message : 'Internal error'
         const status = message.toLowerCase().includes('forbidden') ? 403 : message.toLowerCase().includes('rate limit') ? 429 : 500
         return new Response(JSON.stringify({ error: message }), { status })
       }
     }),
   })

   export default http
   ```

5. Set the Linear secrets on your deployment, **then** deploy — in that
   order. The `env` values declared on `app` in Step 2 are `EnvRef`
   bindings, resolved from your deployment's own env-var store; a push
   fails with `MissingEnvironmentVariables` if the referenced vars aren't
   set on the deployment first:
   ```sh
   npx convex env set LINEAR_API_KEY ...
   npx convex env set LINEAR_TEAM_ID ...
   npx convex deploy
   ```

Your HTTP Action is now live at `https://<your-deployment>.convex.site/bug-catcher-submit`.

## Why the screenshot approach differs from the Supabase variant

The Supabase variant uses a 1-year signed URL on a private Storage bucket.
Convex Storage doesn't support expiring signed URLs (as of 2026-07) —
`storage.getUrl()` is permanent until the file is deleted. This is a
platform capability difference, not a design inconsistency.

## License

MIT
