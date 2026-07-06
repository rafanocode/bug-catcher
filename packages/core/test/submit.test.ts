import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { submitReport, SubmitError } from '../src/submit'
import type { SubmitConfig, SubmitReport } from '../src/types'

const config: SubmitConfig = {
  functionUrl: 'https://xyz.supabase.co/functions/v1/bug-catcher-submit',
  supabaseAnonKey: 'anon-key',
  accessToken: 'jwt-token',
}

const report: SubmitReport = {
  screenshot: 'data:image/png;base64,abc',
  url: 'https://app.example.com/page',
  userAgent: 'test-agent',
  consoleEntries: [],
  description: 'it broke',
}

describe('submitReport', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('POSTs to functionUrl with the JWT and apikey headers and returns the parsed result', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ submissionId: 'sub_1', linearStatus: 'created', linearIssueUrl: 'https://linear.app/issue/1' }),
    })
    global.fetch = mockFetch as unknown as typeof fetch

    const result = await submitReport(config, report)

    expect(mockFetch).toHaveBeenCalledWith(
      config.functionUrl,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer jwt-token',
          apikey: 'anon-key',
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify(report),
      }),
    )
    expect(result).toEqual({ submissionId: 'sub_1', linearStatus: 'created', linearIssueUrl: 'https://linear.app/issue/1' })
  })

  it('throws SubmitError with status and message on a non-ok response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: 'Forbidden' }),
    }) as unknown as typeof fetch

    await expect(submitReport(config, report)).rejects.toThrow(SubmitError)
    await expect(submitReport(config, report)).rejects.toMatchObject({ status: 403, message: 'Forbidden' })
  })
})
