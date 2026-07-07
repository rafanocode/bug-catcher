import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

export interface RateLimitConfig {
  maxRequests: number
  windowMinutes: number
}

export async function checkRateLimit(
  supabase: SupabaseClient,
  userId: string,
  config: RateLimitConfig,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('bug_catcher_check_rate_limit', {
    p_user_id: userId,
    p_max_requests: config.maxRequests,
    p_window_minutes: config.windowMinutes,
  })

  if (error) throw new Error(`Rate limit check failed: ${error.message}`)
  return data as boolean
}
