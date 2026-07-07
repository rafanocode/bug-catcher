import type { User } from 'npm:@supabase/supabase-js@2'

// Copy this file to config.ts and edit it — config.ts is gitignored so your
// authorization logic and Linear routing stay local to your deployment.
export const config = {
  allowedOrigins: ['https://your-app.example.com'],
  rateLimit: { maxRequests: 5, windowMinutes: 10 },
  linearProjectId: undefined as string | undefined,
  linearLabelIds: [] as string[],

  // REQUIRED — no default. This is the real security boundary: hiding the
  // bubble client-side is UX only. Replace this with your own check (a role
  // claim, an org-membership lookup, etc).
  authorize: async (user: User, _req: Request): Promise<boolean> => {
    return user.app_metadata?.role !== 'guest'
  },
}
