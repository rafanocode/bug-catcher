import { assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { checkRateLimit } from '../rate-limit.ts'

function fakeClient(rpcResult: { data: unknown; error: { message: string } | null }): SupabaseClient {
  return {
    rpc: async (_fn: string, _args: Record<string, unknown>) => rpcResult,
  } as unknown as SupabaseClient
}

Deno.test('returns true when the RPC reports the request is within limits', async () => {
  const allowed = await checkRateLimit(fakeClient({ data: true, error: null }), 'user_1', {
    maxRequests: 5,
    windowMinutes: 10,
  })
  assertEquals(allowed, true)
})

Deno.test('returns false when the RPC reports the limit is exceeded', async () => {
  const allowed = await checkRateLimit(fakeClient({ data: false, error: null }), 'user_1', {
    maxRequests: 5,
    windowMinutes: 10,
  })
  assertEquals(allowed, false)
})

Deno.test('throws when the RPC call itself errors', async () => {
  await assertRejects(
    () => checkRateLimit(fakeClient({ data: null, error: { message: 'connection refused' } }), 'user_1', {
      maxRequests: 5,
      windowMinutes: 10,
    }),
    Error,
    'Rate limit check failed: connection refused',
  )
})
