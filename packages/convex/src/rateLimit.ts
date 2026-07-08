import { RateLimiter, MINUTE } from '@convex-dev/rate-limiter'
import type { RunMutationCtx } from '@convex-dev/rate-limiter'

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
// `ctx` must be the real Convex action/mutation context — `.limit()` calls
// `ctx.runMutation` internally to persist the counter, so a placeholder
// object here would throw at runtime, not just fail a type check.
export async function checkRateLimit(
  ctx: RunMutationCtx,
  limiter: RateLimiter,
  tokenIdentifier: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const status = await limiter.limit(ctx, 'submit', {
    key: tokenIdentifier,
    config: { kind: 'fixed window', rate: config.maxRequests, period: config.windowMinutes * MINUTE },
  })
  return { ok: status.ok, retryAfter: status.retryAfter }
}
