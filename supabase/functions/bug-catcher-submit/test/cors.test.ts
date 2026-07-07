import { assertEquals, assertExists } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { corsHeaders, handleOptions } from '../cors.ts'

const config = { allowedOrigins: ['https://app.example.com'] }

Deno.test('corsHeaders echoes the request origin when it is allowed', () => {
  const headers = corsHeaders('https://app.example.com', config)
  assertEquals(headers['Access-Control-Allow-Origin'], 'https://app.example.com')
})

Deno.test('corsHeaders falls back to the first allowed origin when the request origin is not allowed', () => {
  const headers = corsHeaders('https://evil.example.com', config)
  assertEquals(headers['Access-Control-Allow-Origin'], 'https://app.example.com')
})

Deno.test('handleOptions returns a 204 response for OPTIONS requests', () => {
  const req = new Request('https://xyz.supabase.co/functions/v1/bug-catcher-submit', {
    method: 'OPTIONS',
    headers: { origin: 'https://app.example.com' },
  })
  const response = handleOptions(req, config)
  assertExists(response)
  assertEquals(response!.status, 204)
  assertEquals(response!.headers.get('Access-Control-Allow-Origin'), 'https://app.example.com')
})

Deno.test('handleOptions returns null for non-OPTIONS requests', () => {
  const req = new Request('https://xyz.supabase.co/functions/v1/bug-catcher-submit', { method: 'POST' })
  const response = handleOptions(req, config)
  assertEquals(response, null)
})
