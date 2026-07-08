import { describe, expect, it, vi } from 'vitest'
import { checkRateLimit } from '../src/rateLimit'

describe('checkRateLimit', () => {
  it('returns ok: true when the underlying limiter allows the request', async () => {
    const fakeCtx = {}
    const fakeLimiter = { limit: vi.fn().mockResolvedValue({ ok: true, retryAfter: undefined }) }
    const result = await checkRateLimit(fakeCtx as never, fakeLimiter as never, 'user_1', {
      maxRequests: 5,
      windowMinutes: 10,
    })
    expect(result).toEqual({ ok: true, retryAfter: undefined })
    expect(fakeLimiter.limit).toHaveBeenCalledWith(
      fakeCtx,
      'submit',
      expect.objectContaining({ key: 'user_1' }),
    )
  })

  it('returns ok: false with retryAfter when the limiter denies the request', async () => {
    const fakeLimiter = { limit: vi.fn().mockResolvedValue({ ok: false, retryAfter: 30000 }) }
    const result = await checkRateLimit({} as never, fakeLimiter as never, 'user_1', {
      maxRequests: 5,
      windowMinutes: 10,
    })
    expect(result).toEqual({ ok: false, retryAfter: 30000 })
  })
})
