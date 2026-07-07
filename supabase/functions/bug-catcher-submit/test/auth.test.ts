import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { verifyRequestUser } from '../auth.ts'

function fakeClient(getUserResult: { data: { user: unknown }; error: { message: string } | null }): SupabaseClient {
  return {
    auth: {
      getUser: async (_token: string) => getUserResult,
    },
  } as unknown as SupabaseClient
}

Deno.test('returns an error when the Authorization header is missing', async () => {
  const req = new Request('https://xyz.supabase.co/functions/v1/bug-catcher-submit', { method: 'POST' })
  const result = await verifyRequestUser(req, fakeClient({ data: { user: null }, error: null }))
  assertEquals(result.user, null)
  assertEquals(result.error, 'Missing or malformed Authorization header')
})

Deno.test('returns the user when the token is valid', async () => {
  const req = new Request('https://xyz.supabase.co/functions/v1/bug-catcher-submit', {
    method: 'POST',
    headers: { authorization: 'Bearer valid-jwt' },
  })
  const fakeUser = { id: 'user_1', app_metadata: {} }
  const result = await verifyRequestUser(req, fakeClient({ data: { user: fakeUser }, error: null }))
  assertEquals(result.user, fakeUser)
  assertEquals(result.error, null)
})

Deno.test('returns an error when the token is invalid', async () => {
  const req = new Request('https://xyz.supabase.co/functions/v1/bug-catcher-submit', {
    method: 'POST',
    headers: { authorization: 'Bearer bad-jwt' },
  })
  const result = await verifyRequestUser(
    req,
    fakeClient({ data: { user: null }, error: { message: 'invalid JWT' } }),
  )
  assertEquals(result.user, null)
  assertEquals(result.error, 'invalid JWT')
})
