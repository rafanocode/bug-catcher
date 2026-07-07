import { RateLimiter, MINUTE } from '@convex-dev/rate-limiter'

export interface RateLimitConfig {
  maxRequests: number
  windowMinutes: number
}

export interface RateLimitResult {
  ok: boolean
  retryAfter?: number
}

// The limiter instance is created by the caller (submissions.ts), which has
// access to `components.rateLimiter` — this module only shapes the call.
export async function checkRateLimit(
  limiter: RateLimiter,
  tokenIdentifier: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const status = await limiter.limit({} as never, 'submit', {
    key: tokenIdentifier,
    config: { kind: 'fixed window', rate: config.maxRequests, period: config.windowMinutes * MINUTE },
  })
  return { ok: status.ok, retryAfter: status.retryAfter }
}
