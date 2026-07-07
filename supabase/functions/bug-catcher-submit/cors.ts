export interface CorsConfig {
  allowedOrigins: string[]
}

export function corsHeaders(origin: string | null, config: CorsConfig): Record<string, string> {
  const allowOrigin = origin && config.allowedOrigins.includes(origin) ? origin : config.allowedOrigins[0]
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  }
}

export function handleOptions(req: Request, config: CorsConfig): Response | null {
  if (req.method !== 'OPTIONS') return null
  return new Response(null, { status: 204, headers: corsHeaders(req.headers.get('origin'), config) })
}
