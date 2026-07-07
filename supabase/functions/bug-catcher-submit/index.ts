import { createClient } from 'npm:@supabase/supabase-js@2'
import { createHandler } from './handler.ts'
import { config } from './config.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const linearApiKey = Deno.env.get('LINEAR_API_KEY')!
const linearTeamId = Deno.env.get('LINEAR_TEAM_ID')!

const handler = createHandler({
  anonClient: createClient(supabaseUrl, supabaseAnonKey),
  serviceClient: createClient(supabaseUrl, supabaseServiceRoleKey),
  corsConfig: { allowedOrigins: config.allowedOrigins },
  rateLimitConfig: config.rateLimit,
  linearConfig: {
    apiKey: linearApiKey,
    teamId: linearTeamId,
    projectId: config.linearProjectId,
    labelIds: config.linearLabelIds,
  },
  authorize: config.authorize,
})

Deno.serve(handler)
