import { httpRouter, createFunctionHandle } from 'convex/server'
import { httpAction } from './_generated/server'
import { components, internal } from './_generated/api'

const http = httpRouter()

http.route({
  path: '/bug-catcher-submit',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
    }

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
        // Linear's API key is NOT passed here — handleSubmit reads
        // LINEAR_API_KEY/LINEAR_TEAM_ID from the component's own environment
        // instead (see convex.config.ts's app.use(bugCatcher, { env: {...} })).
      })
      return new Response(JSON.stringify(result), { status: 200 })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal error'
      const status = message.toLowerCase().includes('forbidden')
        ? 403
        : message.toLowerCase().includes('rate limit')
          ? 429
          : 500
      return new Response(JSON.stringify({ error: message }), { status })
    }
  }),
})

export default http
