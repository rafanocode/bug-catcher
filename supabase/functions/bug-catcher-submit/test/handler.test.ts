import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { createHandler, type HandlerDeps } from '../handler.ts'

const corsConfig = { allowedOrigins: ['https://app.example.com'] }
const rateLimitConfig = { maxRequests: 5, windowMinutes: 10 }
const linearConfig = { apiKey: 'lin_key', teamId: 'team_1' }

function fakeAnonClient(user: unknown): SupabaseClient {
  return { auth: { getUser: async () => ({ data: { user }, error: null }) } } as unknown as SupabaseClient
}

function fakeServiceClient(opts: {
  rateLimitAllowed?: boolean
  insertedId?: string
  uploadError?: { message: string } | null
}): SupabaseClient {
  const { rateLimitAllowed = true, insertedId = 'sub_1', uploadError = null } = opts
  return {
    rpc: async () => ({ data: rateLimitAllowed, error: null }),
    storage: {
      from: () => ({
        upload: async () => ({ error: uploadError }),
        createSignedUrl: async () => ({ data: { signedUrl: 'https://xyz.supabase.co/signed/screenshot.png' }, error: null }),
      }),
    },
    from: () => ({
      insert: () => ({
        select: () => ({
          single: async () => ({ data: { id: insertedId }, error: null }),
        }),
      }),
      update: () => ({
        eq: async () => ({ data: null, error: null }),
      }),
    }),
  } as unknown as SupabaseClient
}

function buildRequest(body: Record<string, unknown>, headers: Record<string, string> = {}): Request {
  return new Request('https://xyz.supabase.co/functions/v1/bug-catcher-submit', {
    method: 'POST',
    headers: { authorization: 'Bearer valid-jwt', origin: 'https://app.example.com', ...headers },
    body: JSON.stringify(body),
  })
}

const validBody = {
  screenshot: 'data:image/png;base64,aGVsbG8=',
  url: 'https://app.example.com/page',
  userAgent: 'test-agent',
  consoleEntries: [],
  description: 'it crashed',
}

Deno.test('returns 401 when the JWT is invalid', async () => {
  const deps: HandlerDeps = {
    anonClient: fakeAnonClient(null),
    serviceClient: fakeServiceClient({}),
    corsConfig,
    rateLimitConfig,
    linearConfig,
    authorize: async () => true,
  }
  const response = await createHandler(deps)(buildRequest(validBody))
  assertEquals(response.status, 401)
})

Deno.test('returns 429 when the rate limit is exceeded', async () => {
  const deps: HandlerDeps = {
    anonClient: fakeAnonClient({ id: 'user_1' }),
    serviceClient: fakeServiceClient({ rateLimitAllowed: false }),
    corsConfig,
    rateLimitConfig,
    linearConfig,
    authorize: async () => true,
  }
  const response = await createHandler(deps)(buildRequest(validBody))
  assertEquals(response.status, 429)
})

Deno.test('returns 403 when authorize() returns false', async () => {
  const deps: HandlerDeps = {
    anonClient: fakeAnonClient({ id: 'user_1' }),
    serviceClient: fakeServiceClient({}),
    corsConfig,
    rateLimitConfig,
    linearConfig,
    authorize: async () => false,
  }
  const response = await createHandler(deps)(buildRequest(validBody))
  assertEquals(response.status, 403)
})

Deno.test('returns 400 when the request body is missing required fields', async () => {
  const deps: HandlerDeps = {
    anonClient: fakeAnonClient({ id: 'user_1' }),
    serviceClient: fakeServiceClient({}),
    corsConfig,
    rateLimitConfig,
    linearConfig,
    authorize: async () => true,
  }
  const response = await createHandler(deps)(buildRequest({ description: 'only this' }))
  assertEquals(response.status, 400)
})

Deno.test('saves the submission and returns 200 with linearStatus created on success', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ data: { issueCreate: { success: true, issue: { url: 'https://linear.app/issue/1' } } } }))) as typeof fetch

  const deps: HandlerDeps = {
    anonClient: fakeAnonClient({ id: 'user_1' }),
    serviceClient: fakeServiceClient({ insertedId: 'sub_42' }),
    corsConfig,
    rateLimitConfig,
    linearConfig,
    authorize: async () => true,
  }
  const response = await createHandler(deps)(buildRequest(validBody))
  const json = await response.json()

  assertEquals(response.status, 200)
  assertEquals(json, { submissionId: 'sub_42', linearStatus: 'created', linearIssueUrl: 'https://linear.app/issue/1' })

  globalThis.fetch = originalFetch
})

Deno.test('still returns 200 with linearStatus failed when Linear errors — the submission is not lost', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () => new Response(JSON.stringify({ errors: [{ message: 'Invalid teamId' }] }))) as typeof fetch

  const deps: HandlerDeps = {
    anonClient: fakeAnonClient({ id: 'user_1' }),
    serviceClient: fakeServiceClient({ insertedId: 'sub_99' }),
    corsConfig,
    rateLimitConfig,
    linearConfig,
    authorize: async () => true,
  }
  const response = await createHandler(deps)(buildRequest(validBody))
  const json = await response.json()

  assertEquals(response.status, 200)
  assertEquals(json, { submissionId: 'sub_99', linearStatus: 'failed', linearIssueUrl: null })

  globalThis.fetch = originalFetch
})

Deno.test('returns 500 when the screenshot upload fails', async () => {
  const deps: HandlerDeps = {
    anonClient: fakeAnonClient({ id: 'user_1' }),
    serviceClient: fakeServiceClient({ uploadError: { message: 'bucket not found' } }),
    corsConfig,
    rateLimitConfig,
    linearConfig,
    authorize: async () => true,
  }
  const response = await createHandler(deps)(buildRequest(validBody))
  assertEquals(response.status, 500)
})

Deno.test('handles CORS preflight before authentication', async () => {
  const deps: HandlerDeps = {
    anonClient: fakeAnonClient(null),
    serviceClient: fakeServiceClient({}),
    corsConfig,
    rateLimitConfig,
    linearConfig,
    authorize: async () => true,
  }
  const req = new Request('https://xyz.supabase.co/functions/v1/bug-catcher-submit', {
    method: 'OPTIONS',
    headers: { origin: 'https://app.example.com' },
  })
  const response = await createHandler(deps)(req)
  assertEquals(response.status, 204)
})
