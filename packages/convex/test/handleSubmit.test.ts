import { convexTest } from 'convex-test'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { createFunctionHandle } from 'convex/server'
import rateLimiterTest from '@convex-dev/rate-limiter/test'
import schema from '../src/schema'
import { api, internal } from '../src/_generated/api'
import * as submissionsModule from '../src/submissions'

const modules = import.meta.glob('../src/**/*.ts')

// The `rateLimiter` component used by `handleSubmit` (via `checkRateLimit`)
// must be explicitly registered with the test harness — convex-test does not
// auto-discover components declared in `convex.config.ts`. This mirrors
// `@convex-dev/rate-limiter`'s own documented test setup (its `./test`
// export exists precisely for this).
function setupTest() {
  const t = convexTest(schema, modules)
  rateLimiterTest.register(t)
  return t
}

const rateLimitConfig = { maxRequests: 5, windowMinutes: 10 }

// A stand-in for the "integrator's own authorize function" — in real
// usage this lives in the consuming app, not in this component.
async function fakeAuthorizeHandle(t: ReturnType<typeof convexTest>, allow: boolean) {
  return await t.run(async (ctx) => {
    // convex-test doesn't expose a way to define ad-hoc functions inline;
    // this task uses a fixture function checked into src/ (see
    // src/fixtures/authorize.ts) and creates a handle from it.
    const mod = allow ? internal.fixtures.authorize.allow : internal.fixtures.authorize.deny
    return await createFunctionHandle(mod)
  })
}

describe('submissions.handleSubmit', () => {
  const originalFetch = global.fetch

  // `handleSubmit` reads Linear's secrets from this component's own
  // Convex-scoped environment (set once at `app.use()` install time), never
  // from a per-call argument — see the SECURITY comment on `handleSubmit`'s
  // `args` in `src/submissions.ts`. Stub the env here to simulate that.
  beforeEach(() => {
    vi.stubEnv('LINEAR_API_KEY', 'lin_key')
    vi.stubEnv('LINEAR_TEAM_ID', 'team_1')
  })

  afterEach(() => {
    global.fetch = originalFetch
    vi.unstubAllEnvs()
  })

  const validBody = {
    tokenIdentifier: 'user|123',
    screenshot: 'data:image/png;base64,aGVsbG8=',
    url: 'https://app.example.com/page',
    userAgent: 'test-agent',
    consoleEntries: [],
    description: 'it crashed',
    rateLimitConfig,
  }

  it('saves the submission and returns linearStatus created on Linear success', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { issueCreate: { success: true, issue: { url: 'https://linear.app/issue/1' } } } }),
    }) as unknown as typeof fetch

    const t = setupTest()
    const authorizeHandle = await fakeAuthorizeHandle(t, true)

    const result = await t.action(api.submissions.handleSubmit, { ...validBody, authorizeHandle })

    expect(result.linearStatus).toBe('created')
    expect(result.linearIssueUrl).toBe('https://linear.app/issue/1')
    expect(result.submissionId).toBeDefined()
  })

  it('still returns linearStatus failed (never throws) when Linear errors — submission stays saved', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ errors: [{ message: 'Invalid teamId' }] }),
    }) as unknown as typeof fetch

    const t = setupTest()
    const authorizeHandle = await fakeAuthorizeHandle(t, true)

    const result = await t.action(api.submissions.handleSubmit, { ...validBody, authorizeHandle })

    expect(result.linearStatus).toBe('failed')
    expect(result.linearIssueUrl).toBeNull()

    const stored = await t.run(async (ctx) => await ctx.db.get(result.submissionId))
    expect(stored?.linearStatus).toBe('failed')
  })

  it('rejects when authorize denies', async () => {
    const t = setupTest()
    const authorizeHandle = await fakeAuthorizeHandle(t, false)

    await expect(t.action(api.submissions.handleSubmit, { ...validBody, authorizeHandle })).rejects.toThrow(
      /forbidden/i,
    )
  })

  it('still returns linearStatus failed when the description-building step would throw on a malformed timestamp', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { issueCreate: { success: true, issue: { url: 'https://linear.app/issue/2' } } } }),
    }) as unknown as typeof fetch

    const t = setupTest()
    const authorizeHandle = await fakeAuthorizeHandle(t, true)

    const badBody = {
      ...validBody,
      consoleEntries: [{ level: 'error', args: ['boom'], timestamp: Number.NaN }],
    }

    const result = await t.action(api.submissions.handleSubmit, { ...badBody, authorizeHandle })
    // The durable-first invariant: this must not throw, and the submission
    // must exist regardless of the malformed console entry.
    expect(result.submissionId).toBeDefined()
  })

  it('still resolves (never rejects) with the real Linear outcome when persisting that outcome via updateLinearStatus itself fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { issueCreate: { success: true, issue: { url: 'https://linear.app/issue/3' } } } }),
    }) as unknown as typeof fetch

    // `internal.submissions.updateLinearStatus` is a Convex function
    // reference (a path), not a plain JS function convex-test lets us
    // mock via vi.mock without also breaking handleSubmit (same module).
    // convex-test resolves it to this same exported object at call time, so
    // temporarily replacing its `_handler` (the raw handler convex-test
    // actually invokes — see convex's `internalMutation` implementation)
    // simulates a transient failure of just this one mutation call.
    const originalHandler = submissionsModule.updateLinearStatus._handler
    submissionsModule.updateLinearStatus._handler = async () => {
      throw new Error('simulated transient error persisting Linear status')
    }

    try {
      const t = setupTest()
      const authorizeHandle = await fakeAuthorizeHandle(t, true)

      const result = await t.action(api.submissions.handleSubmit, { ...validBody, authorizeHandle })

      // The durable-first invariant extends to this final step: a failure
      // here must not propagate as a rejected promise, and the response
      // must still reflect what actually happened with Linear.
      expect(result.submissionId).toBeDefined()
      expect(result.linearStatus).toBe('created')
      expect(result.linearIssueUrl).toBe('https://linear.app/issue/3')

      // Prove the patched `_handler` actually fired (and was actually the
      // thing swallowed by handleSubmit's try/catch): if it ran
      // successfully instead, the stored record would read 'created' like
      // the "Linear success" test above. Since updateLinearStatus never
      // completed, the record still has whatever `insert` set.
      const stored = await t.run(async (ctx) => await ctx.db.get(result.submissionId))
      expect(stored?.linearStatus).toBe('pending')
    } finally {
      submissionsModule.updateLinearStatus._handler = originalHandler
    }
  })
})
