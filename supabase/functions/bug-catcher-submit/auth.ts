import type { SupabaseClient, User } from 'npm:@supabase/supabase-js@2'

export interface AuthResult {
  user: User | null
  error: string | null
}

export async function verifyRequestUser(req: Request, supabase: SupabaseClient): Promise<AuthResult> {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return { user: null, error: 'Missing or malformed Authorization header' }
  }

  const token = authHeader.slice('Bearer '.length)
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) {
    return { user: null, error: error?.message ?? 'Invalid token' }
  }

  return { user: data.user as User, error: null }
}
