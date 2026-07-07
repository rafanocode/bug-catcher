# bug-catcher

A lightweight, self-hostable bug-reporting widget for web apps. Drop in a
React bubble; it captures a screenshot, browser/OS info, the current URL,
and recent console output, then creates a Linear issue — using **your own**
Supabase project and Linear API key. Zero SaaS dependency, zero
subscription.

## Packages

- `bug-catcher-core` — framework-agnostic capture + submit logic.
- `bug-catcher-react` — the `<BugCatcherBubble />` component.
- `supabase/functions/bug-catcher-submit` — the Edge Function template you deploy.

## 5-minute setup

1. **Install the React package:**
   ```bash
   npm install bug-catcher-react @supabase/supabase-js
   ```

2. **Copy the Edge Function into your own Supabase project:**
   ```bash
   cp -r supabase/functions/bug-catcher-submit YOUR_PROJECT/supabase/functions/
   cp supabase/migrations/0001_bug_catcher_schema.sql YOUR_PROJECT/supabase/migrations/
   cp YOUR_PROJECT/supabase/functions/bug-catcher-submit/config.example.ts \
      YOUR_PROJECT/supabase/functions/bug-catcher-submit/config.ts
   ```
   Edit `config.ts`: set `allowedOrigins` to your app's domain(s), and write
   your `authorize` check. **This is required — there is no default.**
   Hiding the bubble client-side is UX only; `authorize` is the real
   security boundary.

3. **Set required env vars** (`supabase secrets set` or your dashboard):
   - `LINEAR_API_KEY` — a **personal API key** from Linear (Settings → API). Linear's personal keys grant full workspace access and aren't scoped; there's no narrower scope to select. (An OAuth app with `issues:create`/`read` scopes would be the only way to narrow this — out of scope for this project.)
   - `LINEAR_TEAM_ID` — the Linear team the issue should be created in.

   `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` do
   **not** need to be set — they're reserved names that the Supabase Edge
   Functions runtime injects automatically into every deployed function
   (the Supabase CLI will reject any attempt to set a secret with a
   `SUPABASE_` prefix).

4. **Deploy the migration and function:**
   ```bash
   supabase db push
   supabase functions deploy bug-catcher-submit
   ```

5. **Drop the bubble into your app:**
   ```tsx
   import { BugCatcherBubble } from 'bug-catcher-react'

   <BugCatcherBubble
     supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL}
     supabaseAnonKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}
   />
   ```

See `examples/demo-app` for a complete working example.

## Why screenshots are embedded via a signed Supabase Storage URL

An earlier internal implementation tried two more "obvious" approaches, and
both failed in ways that only reproduced in a real deployed environment:

- Uploading the screenshot to Linear server-side via its
  `fileUpload`/`attachmentCreate` GraphQL flow fails from Supabase Edge
  Functions with a GCS "MalformedSecurityHeader" rejection on the
  content-type header.
- Uploading directly from the browser to Linear's own GCS bucket is blocked
  unconditionally — that bucket doesn't return
  `Access-Control-Allow-Origin` on preflight.

The approach here sidesteps both: the screenshot goes to **your own**
Supabase Storage bucket, a 1-year signed URL is generated, and that URL is
embedded as a Markdown image directly in the Linear issue's description.
Only well-established first-party APIs are used on both sides.

## CSP checklist

Add to your app's Content-Security-Policy:

- `connect-src`: your Supabase project domain (`https://YOUR_PROJECT.supabase.co`) — required for both the function call and Storage.
- `img-src`: same Supabase domain — only needed if you ever display a submitted screenshot back in your own app.

No third-party domains are required.

## Durability guarantee

Every submission is inserted into your `bug_catcher_submissions` table
**before** the Linear API call is attempted. If Linear creation fails, the
report is still saved (`linear_status = 'failed'`, `linear_error` holds the
message) — nothing is lost. There's no automated retry in v1; query
`where linear_status = 'failed'` to find submissions that need a manual
follow-up.

## Rate limiting

Configurable in `config.ts` (`rateLimit: { maxRequests, windowMinutes }`,
default 5 requests / 10 minutes per user), enforced via a Postgres-backed
fixed window — no external services required.

## Not in v1

Hosted/managed version, Jira/GitHub Issues support, team analytics
dashboard, automated Linear retry, non-React framework wrappers.

## License

MIT
