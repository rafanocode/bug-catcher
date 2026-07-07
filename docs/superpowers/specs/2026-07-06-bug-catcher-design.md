# bug-catcher — Design Spec

Date: 2026-07-06
Status: Approved (v1 scope)

## Summary

A lightweight, self-hostable bug-reporting widget for web apps. A React bubble
component captures a screenshot, browser/OS info, current URL, and a rolling
console-log buffer, lets the reporter add free text, and submits it to a
Supabase Edge Function the integrator deploys into their own Supabase
project. The function durably persists the submission first, then creates a
Linear issue (via the integrator's own Linear API key) with the screenshot
embedded as a signed-URL Markdown image. Zero SaaS dependency: the only
external services involved are ones the integrator already owns (their
Supabase project, their Linear workspace).

Positioning: "the 5-minute, no-subscription Linear bug reporter" for teams
already on Supabase + Linear.

## Hard lessons baked in from a prior internal implementation

- **Screenshot delivery must not go through Linear's own upload flow in
  either direction.** Server-side upload via Linear's fileUpload/
  attachmentCreate GraphQL flow reliably fails in Supabase Edge Functions
  with a GCS "MalformedSecurityHeader" rejection on the content-type header —
  reproducible only in the real deployed environment (isolated across Deno,
  Node, and the exact edge-runtime Docker image; never reproduces locally).
  Client-side direct upload to Linear's bucket is also not viable — Linear's
  GCS bucket doesn't return `Access-Control-Allow-Origin` on preflight, so
  browsers block it unconditionally.
- **The working approach:** upload the screenshot to the integrator's own
  Supabase Storage, generate a long-lived (1 year) signed URL, and embed it
  as a Markdown image directly in the Linear issue's description. This uses
  only well-established first-party APIs on both sides and sidesteps both
  failure modes entirely.
- **CORS must be handled explicitly from day one** in the Edge Function
  (`OPTIONS` + `Access-Control-Allow-*` headers) — untested-until-a-real-
  browser-hits-it CORS gaps cost real time previously.
- **CSP:** ship a documented checklist of required `connect-src` (and
  `img-src`) entries for consumers.
- **Auth/authorization:** hiding the bubble client-side by role is UX only.
  The real security boundary is server-side — verify the caller's Supabase
  JWT, then run a pluggable, required `authorize(user, req)` check before
  any write happens.
- **Durable-first design:** always persist the submission to the
  integrator's own Postgres table *before* attempting the Linear API call. A
  Linear-side failure must never mean the report is lost — it's flagged
  (`linear_status = 'failed'`) for manual follow-up, and the end user still
  sees "report saved."
- **Rate limiting** on the submission endpoint, configurable, implemented
  without assuming in-memory state survives across Edge Function
  invocations.

## Repo layout

pnpm workspaces monorepo. Packages are unscoped on npm (`bug-catcher-core`,
`bug-catcher-react`) — the `@bug-catcher` npm scope was never claimed as an
organization, so v1 publishes without it:

```
bug-catcher/
├── packages/
│   ├── core/                 bug-catcher-core
│   │   src/capture.ts        screenshot + console buffer + browser/OS info
│   │   src/submit.ts         submitReport() client
│   │   src/types.ts
│   └── react/                bug-catcher-react
│       src/BugCatcherBubble.tsx
├── supabase/
│   ├── migrations/           bug_catcher_submissions, bug_catcher_rate_limits
│   └── functions/
│       └── bug-catcher-submit/   Deno Edge Function template (copied, not
│                                  imported, into the integrator's own
│                                  supabase/functions/ dir — not an npm
│                                  package, see Global Constraints below)
├── examples/
│   └── demo-app/             Vite + React integration example (not published)
├── docs/
│   └── superpowers/specs/    this file
├── pnpm-workspace.yaml
├── package.json
├── LICENSE                   MIT
└── README.md
```

`bug-catcher-core` is framework-agnostic (no React dependency) so future
Vue/Svelte wrappers can reuse it. `bug-catcher-react` is a thin wrapper
rendering the built-in bubble UI on top of core.
The Edge Function ships as a scaffold-able template, not an npm package —
Supabase Edge Functions are deployed source, not an npm runtime dependency,
so v1 provides a copyable template plus migrations, not an installable
package in the traditional sense.

## Data flow

1. Reporter clicks the bubble (`<BugCatcherBubble />`, client-side React).
2. Client captures context via `bug-catcher-core`:
   - Screenshot: `modern-screenshot`, DOM-rendering based, base64 PNG. No
     native screen-capture API, so no permission prompt.
   - `navigator.userAgent`, current URL.
   - Rolling console-log buffer: `console.*` methods are patched once on
     widget mount into a fixed-size ring buffer (default 50 entries,
     configurable), capturing `{ level, args, timestamp }` for
     log/warn/error/info/debug. Only captures activity after widget mount.
3. Reporter adds free-text description of what they were doing / what went
   wrong.
4. Client calls `submitReport()`, which does:
   `POST /functions/v1/bug-catcher-submit` with
   `Authorization: Bearer <Supabase JWT>` (the app's existing Supabase
   session — `@supabase/supabase-js` is a peer dependency of
   `bug-catcher-react`).
5. Edge Function (`bug-catcher-submit`), in order:
   a. Verifies the JWT → resolves `user`. `401` if invalid/missing.
   b. Checks the Postgres-backed rate limit for this user. `429` if
      exceeded.
   c. Runs the integrator-supplied `authorize(user, req)`. `403` if false.
   d. Uploads the screenshot to a private `bug-catcher-screenshots` Storage
      bucket.
   e. Generates a 1-year signed URL for the uploaded screenshot.
   f. **Inserts** a row into `bug_catcher_submissions` with
      `linear_status = 'pending'` — durable, before any Linear call.
   g. Calls the Linear GraphQL API (`issueCreate`) with a description
      containing the reporter's text, browser/OS/URL info, the console log
      block, and the screenshot embedded as
      `![screenshot](<signed_url>)`.
   h. Updates the row: `linear_status = 'created'` + `linear_issue_url`, or
      `linear_status = 'failed'` + `linear_error` on failure.
   i. Returns `{ submissionId, linearStatus, linearIssueUrl }`.

The invariant: step (f) always happens before step (g), and a Linear
failure is reflected internally (`linear_status`) but never surfaces to the
end user as a failed submission — the widget shows "report saved"
regardless, since durability to the integrator's own Supabase project is the
actual success condition the reporter cares about.

## Package APIs

### `bug-catcher-core`

```ts
captureContext(): Promise<{
  screenshot: string          // base64 PNG, via modern-screenshot
  url: string
  userAgent: string
  consoleEntries: ConsoleEntry[]
}>

createConsoleBuffer(size = 50): {
  entries: ConsoleEntry[]     // { level, args, timestamp }
  start(): void               // patches console.* methods
  stop(): void                // restores originals
}

submitReport(config: {
  functionUrl: string
  supabaseAnonKey: string
  accessToken: string         // caller's Supabase session JWT
}, report: {
  description: string
} & Awaited<ReturnType<typeof captureContext>>): Promise<{
  submissionId: string
  linearStatus: 'created' | 'failed'
  linearIssueUrl: string | null
}>
```

### `bug-catcher-react`

```tsx
<BugCatcherBubble
  supabaseUrl="https://xyz.supabase.co"
  supabaseAnonKey="..."
  functionName="bug-catcher-submit"   // default; override if renamed
  position="bottom-right"             // 'bottom-right' | 'bottom-left'
  primaryColor="#6366f1"              // optional light theming
  consoleBufferSize={50}              // optional, default 50
  onSubmitted={(result) => {}}        // optional callback
/>
```

No client-side `authorize` prop — enforcement is server-side only. A
client-side authorization-flavored prop would misleadingly suggest otherwise.

## Edge Function contract

```
POST /functions/v1/bug-catcher-submit
Headers: Authorization: Bearer <Supabase JWT>
Body: {
  screenshot: string,       // base64 PNG
  url: string,
  userAgent: string,
  consoleEntries: {level, args, timestamp}[],
  description: string
}

200 OK
{
  submissionId: string,
  linearStatus: 'created' | 'failed',
  linearIssueUrl: string | null
}

401 Unauthorized  -- invalid/missing JWT
403 Forbidden     -- authorize() returned false
429 Too Many Requests
400 Bad Request   -- validation failure
```

Integrator-supplied config (`supabase/functions/bug-catcher-submit/config.ts`,
edited directly since this is a template, not an installed dependency):

```ts
export const config = {
  linearTeamId: Deno.env.get('LINEAR_TEAM_ID')!,
  linearProjectId: Deno.env.get('LINEAR_PROJECT_ID'),   // optional
  linearLabelIds: [],                                    // optional
  allowedOrigins: ['https://app.example.com'],           // required, for CORS
  rateLimit: { maxRequests: 5, windowMinutes: 10 },       // configurable
  authorize: async (user, req) => {
    // REQUIRED — no default. Function refuses to start without it.
    return user.app_metadata?.role !== 'guest'
  },
}
```

Required env vars: `LINEAR_API_KEY`, `LINEAR_TEAM_ID`, `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY` (submissions insert + rate-limit table bypass
RLS server-side), `SUPABASE_ANON_KEY` (JWT verification).

Routing to Linear team/project is fixed via config for v1 (not resolved
per-submission) — matches the single-tenant, "your own Linear API key"
model described in the brief.

## Database schema

```sql
create table bug_catcher_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  url text not null,
  user_agent text not null,
  description text not null,
  console_entries jsonb not null,
  screenshot_path text not null,        -- Storage object path
  linear_status text not null default 'pending',  -- 'pending' | 'created' | 'failed'
  linear_issue_url text,
  linear_error text,
  created_at timestamptz not null default now()
);

create table bug_catcher_rate_limits (
  user_id uuid not null,
  window_start timestamptz not null,
  request_count int not null default 1,
  primary key (user_id, window_start)
);
```

`bug-catcher-screenshots` is a private Storage bucket. Signed URLs (1 year
expiry) are generated per-submission at creation time; if one ever expires
in an old Linear issue, a small documented script can re-sign and re-embed
it — not an automated feature in v1.

## Security, CORS, CSP

- **Security boundary:** server-side only. JWT verification →
  `authorize(user, req)` → only then any write. Hiding the bubble
  client-side by role is UX, not enforcement.
- **CORS:** the function handles `OPTIONS` explicitly and returns
  `Access-Control-Allow-Origin` etc. for the configured `allowedOrigins`.
- **CSP checklist** (shipped in the README, for the integrator's own app):
  - `connect-src`: their Supabase project domain, for both the function call
    and Storage.
  - `img-src`: same Supabase domain, for completeness (screenshot display).
  - No third-party domains — the "zero SaaS dependency" pitch made concrete.

## Rate limiting

Postgres-backed sliding window: a Postgres function checks/increments
`bug_catcher_rate_limits` per user within a configurable time window
(default 5 requests / 10 minutes). Durable and correct across concurrent
Edge Function invocations, no extra infra, consistent with "zero SaaS
dependency."

## Error handling

- A screenshot is required for v1: if client-side screenshot capture fails,
  submission is blocked with a clear error rather than proceeding without
  it. Console entries are just an in-memory ring buffer (no async capture
  step), so there's no equivalent failure mode to guard against there.
- `401`/`403`/`429`/`400` map to distinct user-facing messages in the
  bubble's UI.
- Linear failures never surface as a failed submission to the end user;
  `linear_status` is a maintainer-facing detail for manual follow-up
  (queried directly, e.g. `where linear_status = 'failed'`) — no automated
  retry in v1.

## Testing

- `bug-catcher-core`: Vitest unit tests for the console ring buffer,
  capture context assembly, and the submit client (mocked fetch).
- `bug-catcher-react`: Vitest + Testing Library for bubble open/close, form
  states (idle/loading/success/error), prop wiring.
- The Edge Function (`supabase/functions/bug-catcher-submit`): Deno test suite for JWT verification,
  the `authorize` gate (allow/deny), rate-limit window logic, and the
  durable-insert-before-Linear-call ordering (mocked Linear API including a
  simulated failure, asserting the row still lands with
  `linear_status='failed'` and the response reflects it).
- `examples/demo-app`: manual smoke-test target, not automated.

## v1 scope

1. `bug-catcher-core` — capture + submit logic
2. `bug-catcher-react` — `<BugCatcherBubble />`
3. `supabase/functions/bug-catcher-submit` — Edge Function template + migrations
4. `examples/demo-app` — Vite + React integration example
5. README: 5-minute setup, env vars, required Linear API key (a personal
   API key from Linear Settings → API — Linear's personal keys grant full
   workspace access and aren't scoped, so no narrower scope to select; an
   OAuth app with `issues:create`/`read` scopes would be the only way to
   narrow this, out of scope for v1), the signed-URL screenshot rationale
   (linking the GCS/CORS lesson above), CSP checklist
6. MIT license

**Explicitly not in v1:** hosted/managed version, Jira/GitHub Issues
support, team analytics dashboard, automated Linear retry, non-React
framework wrappers. (Business-model context: open-source core free
forever; a possible future paid tier covers these — not part of this
build.)
