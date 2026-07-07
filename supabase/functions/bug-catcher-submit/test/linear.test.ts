import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { createLinearIssue, buildIssueDescription } from '../linear.ts'

const config = { apiKey: 'lin_api_key', teamId: 'team_1' }

Deno.test('createLinearIssue returns created + issueUrl on success', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string)
    assertStringIncludes(body.query, 'issueCreate')
    assertEquals(init.headers, { 'Content-Type': 'application/json', Authorization: 'lin_api_key' })
    return new Response(
      JSON.stringify({ data: { issueCreate: { success: true, issue: { url: 'https://linear.app/issue/1' } } } }),
      { status: 200 },
    )
  }) as typeof fetch

  const result = await createLinearIssue(config, { title: 'Bug', description: 'desc' })
  assertEquals(result, { status: 'created', issueUrl: 'https://linear.app/issue/1', error: null })

  globalThis.fetch = originalFetch
})

Deno.test('createLinearIssue returns failed + error message on a GraphQL error', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ errors: [{ message: 'Invalid teamId' }] }), { status: 200 })) as typeof fetch

  const result = await createLinearIssue(config, { title: 'Bug', description: 'desc' })
  assertEquals(result.status, 'failed')
  assertEquals(result.issueUrl, null)
  assertEquals(result.error, 'Invalid teamId')

  globalThis.fetch = originalFetch
})

Deno.test('createLinearIssue returns failed when fetch itself throws (network error)', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () => {
    throw new Error('network unreachable')
  }) as typeof fetch

  const result = await createLinearIssue(config, { title: 'Bug', description: 'desc' })
  assertEquals(result.status, 'failed')
  assertEquals(result.error, 'network unreachable')

  globalThis.fetch = originalFetch
})

Deno.test('buildIssueDescription embeds the screenshot, context, and console log', () => {
  const description = buildIssueDescription({
    description: 'the button does nothing',
    url: 'https://app.example.com/page',
    userAgent: 'test-agent',
    screenshotUrl: 'https://xyz.supabase.co/storage/v1/object/sign/screenshot.png',
    consoleEntries: [{ level: 'error', args: ['boom'], timestamp: 1700000000000 }],
  })

  assertStringIncludes(description, 'the button does nothing')
  assertStringIncludes(description, '![screenshot](https://xyz.supabase.co/storage/v1/object/sign/screenshot.png)')
  assertStringIncludes(description, 'https://app.example.com/page')
  assertStringIncludes(description, 'test-agent')
  assertStringIncludes(description, 'error: boom')
})
