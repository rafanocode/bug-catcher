import { describe, expect, it, vi, afterEach } from 'vitest'
import { createLinearIssue, buildIssueDescription } from '../src/linear'

const config = { apiKey: 'lin_api_key', teamId: 'team_1' }

describe('createLinearIssue', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('returns created + issueUrl on success', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { issueCreate: { success: true, issue: { url: 'https://linear.app/issue/1' } } } }),
    }) as unknown as typeof fetch

    const result = await createLinearIssue(config, { title: 'Bug', description: 'desc' })

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.linear.app/graphql',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'lin_api_key' }),
      }),
    )
    expect(result).toEqual({ status: 'created', issueUrl: 'https://linear.app/issue/1', error: null })
  })

  it('returns failed + error message on a GraphQL error, never throws', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ errors: [{ message: 'Invalid teamId' }] }),
    }) as unknown as typeof fetch

    const result = await createLinearIssue(config, { title: 'Bug', description: 'desc' })
    expect(result).toEqual({ status: 'failed', issueUrl: null, error: 'Invalid teamId' })
  })

  it('returns failed when fetch itself throws (network error), never throws', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network unreachable')) as unknown as typeof fetch

    const result = await createLinearIssue(config, { title: 'Bug', description: 'desc' })
    expect(result.status).toBe('failed')
    expect(result.error).toBe('network unreachable')
  })
})

describe('buildIssueDescription', () => {
  it('embeds the screenshot, context, and console log', () => {
    const description = buildIssueDescription({
      description: 'the button does nothing',
      url: 'https://app.example.com/page',
      userAgent: 'test-agent',
      screenshotUrl: 'https://exuberant-deployment.convex.cloud/api/storage/abc123',
      consoleEntries: [{ level: 'error', args: ['boom'], timestamp: 1700000000000 }],
    })

    expect(description).toContain('the button does nothing')
    expect(description).toContain('![screenshot](https://exuberant-deployment.convex.cloud/api/storage/abc123)')
    expect(description).toContain('https://app.example.com/page')
    expect(description).toContain('test-agent')
    expect(description).toContain('error: boom')
  })

  it('falls back to a placeholder instead of throwing on a malformed timestamp', () => {
    const description = buildIssueDescription({
      description: 'x',
      url: 'https://example.com',
      userAgent: 'ua',
      screenshotUrl: 'https://example.com/shot.png',
      consoleEntries: [{ level: 'error', args: ['boom'], timestamp: Number.NaN }],
    })

    expect(description).toContain('(invalid timestamp)')
  })
})
