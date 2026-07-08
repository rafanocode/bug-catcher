import { v } from 'convex/values'
import { action, internalMutation } from './_generated/server'
import { internal, components } from './_generated/api'
import { RateLimiter } from '@convex-dev/rate-limiter'
import type { FunctionHandle, RegisteredAction } from 'convex/server'
import type { Id } from './_generated/dataModel'
import { createLinearIssue, buildIssueDescription } from './linear'
import { checkRateLimit } from './rateLimit'

type HandleSubmitArgs = {
  tokenIdentifier: string
  screenshot: string
  url: string
  userAgent: string
  consoleEntries: { level: string; args: unknown[]; timestamp: number }[]
  description: string
  authorizeHandle: string
  rateLimitConfig: { maxRequests: number; windowMinutes: number }
}

type HandleSubmitReturns = {
  submissionId: Id<'submissions'>
  linearStatus: 'created' | 'failed'
  linearIssueUrl: string | null
}

// `handleSubmit`'s handler calls `internal.submissions.insert` /
// `internal.submissions.updateLinearStatus` — i.e. it references this same
// module's own generated API from within itself. Without an explicit type
// annotation here, `tsc -p .` fails with "'handleSubmit' implicitly has type
// 'any' because it does not have a type annotation and is referenced
// directly or indirectly in its own initializer" (plus a matching TS2502 in
// `_generated/api.ts`): computing `typeof submissions` (needed to type
// `internal`) requires first inferring `handleSubmit`'s own type, which
// requires `internal`'s type — a genuine cycle, not a bug in the generated
// code. Annotating the export directly breaks it, since TS then uses the
// annotation instead of inferring from the initializer.

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

const rateLimiter = new RateLimiter(components.rateLimiter, {
  submit: { kind: 'fixed window', rate: 5, period: 10 * 60 * 1000 },
})

export const handleSubmit: RegisteredAction<'public', HandleSubmitArgs, Promise<HandleSubmitReturns>> = action({
  args: {
    // SECURITY: `tokenIdentifier` MUST be derived server-side from a
    // cryptographically-verified identity (e.g.
    // `(await ctx.auth.getUserIdentity())?.tokenIdentifier`) by whatever code
    // calls this action — never trust a client-supplied string for this
    // field. This action is a Convex Component action: it is only reachable
    // via `ctx.runAction(components.bugCatcher.submissions.handleSubmit, ...)`
    // from the consuming app's own server-side code (Convex Components have
    // no direct client-to-component RPC path), and the intended caller
    // (this package's `http.ts`) is expected to populate this from
    // `ctx.auth.getUserIdentity()`. If this action is ever wired up so that
    // a value from the request body flows into this field unverified, that
    // wiring is the bug, not this action.
    tokenIdentifier: v.string(),
    screenshot: v.string(),
    url: v.string(),
    userAgent: v.string(),
    consoleEntries: v.array(
      v.object({ level: v.string(), args: v.array(v.any()), timestamp: v.number() }),
    ),
    description: v.string(),
    authorizeHandle: v.string(),
    rateLimitConfig: v.object({ maxRequests: v.number(), windowMinutes: v.number() }),
  },
  returns: v.object({
    submissionId: v.id('submissions'),
    linearStatus: v.union(v.literal('created'), v.literal('failed')),
    linearIssueUrl: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const rateLimitResult = await checkRateLimit(ctx, rateLimiter, args.tokenIdentifier, args.rateLimitConfig)
    if (!rateLimitResult.ok) {
      throw new Error(`Rate limit exceeded, retry after ${rateLimitResult.retryAfter}ms`)
    }

    const authorizeFn = args.authorizeHandle as FunctionHandle<'query'>
    const isAuthorized = await ctx.runQuery(authorizeFn, {})
    if (!isAuthorized) {
      throw new Error('Forbidden: authorize() denied this request')
    }

    const base64Data = args.screenshot.replace(/^data:image\/png;base64,/, '')
    const bytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0))
    const screenshotId = await ctx.storage.store(new Blob([bytes], { type: 'image/png' }))

    // Durable-first: this insert must land before the Linear call below.
    const submissionId = await ctx.runMutation(internal.submissions.insert, {
      tokenIdentifier: args.tokenIdentifier,
      url: args.url,
      userAgent: args.userAgent,
      description: args.description,
      consoleEntries: args.consoleEntries,
      screenshotId,
    })

    // Everything from here on must never throw past this point — the
    // submission is already durably saved. A malformed console-entry
    // timestamp caused exactly this kind of violation in the Supabase
    // variant; buildIssueDescription's formatTimestamp already guards it,
    // but this try/catch is defense in depth for anything else.
    let linearResult
    try {
      // Read Linear's secrets from this component's own Convex-scoped
      // environment (set once at `app.use(bugCatcher, { env: { ... } })`
      // install time), never from a per-call argument — a per-call argument
      // would flow the API key through Convex's action-call
      // logging/observability surface on every submission.
      const linearConfig = {
        apiKey: process.env.LINEAR_API_KEY!,
        teamId: process.env.LINEAR_TEAM_ID!,
        projectId: process.env.LINEAR_PROJECT_ID,
      }
      const screenshotUrl = await ctx.storage.getUrl(screenshotId)
      linearResult = await createLinearIssue(linearConfig, {
        title: `Bug report: ${args.url}`,
        description: buildIssueDescription({
          description: args.description,
          url: args.url,
          userAgent: args.userAgent,
          screenshotUrl: screenshotUrl ?? '(screenshot URL unavailable)',
          consoleEntries: args.consoleEntries,
        }),
      })
    } catch (err) {
      linearResult = {
        status: 'failed' as const,
        issueUrl: null,
        error: err instanceof Error ? err.message : 'Unknown error',
      }
    }

    // This persistence step is itself covered by the durable-first
    // guarantee above: the submission is already saved and the Linear call
    // has already run to completion (linearResult is fully computed), so a
    // failure here (e.g. a transient Convex error) must never turn this
    // response into a non-200 — it just means the DB record keeps whatever
    // linearStatus `insert` set ('pending') instead of the real outcome.
    try {
      await ctx.runMutation(internal.submissions.updateLinearStatus, {
        submissionId,
        linearStatus: linearResult.status,
        linearIssueUrl: linearResult.issueUrl ?? undefined,
        linearError: linearResult.error ?? undefined,
      })
    } catch {
      // Swallow: the caller still gets the accurate Linear outcome below,
      // even though it couldn't be persisted.
    }

    return { submissionId, linearStatus: linearResult.status, linearIssueUrl: linearResult.issueUrl }
  },
})
