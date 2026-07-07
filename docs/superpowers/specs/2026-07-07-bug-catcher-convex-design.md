# bug-catcher — Convex Backend Support — Design Spec

Date: 2026-07-07
Status: Approved (v1 scope)

## Summary

Extends bug-catcher with a Convex backend adapter, as an alternative to the
existing Supabase Edge Function backend. This is a concrete adapter for one
additional backend (Convex) — not a generic N-backend abstraction layer.
"Other databases" beyond Convex are explicitly out of scope for this
sub-project; if the Convex adapter's boundaries turn out to generalize
cleanly, that's a bonus, not a design goal.

Two new packages ship; nothing in the existing published packages
(`bug-catcher-core`, `bug-catcher-react`) is modified or re-published:

- **`bug-catcher-convex`** — an installable [Convex
  Component](https://docs.convex.dev/components) providing the backend:
  schema, HTTP Action, and Linear integration.
- **`bug-catcher-react-convex`** — the React bubble wired for Convex's
  client/auth conventions.

## Research findings that shaped this design

Verified against current Convex docs (2026-07), not assumed from training data:

- **HTTP Actions** (`convex/http.ts`, `httpAction`) are the Convex
  equivalent of a Supabase Edge Function: exposed at
  `https://<deployment>.convex.site/<path>`, standard Fetch `Request`/
  `Response`, with `ctx.auth`, `ctx.storage`, `ctx.scheduler` available in
  the handler.
- **Convex Storage has no signed/expiring URLs.**
  `ctx.storage.getUrl(storageId)` returns a URL that grants permanent
  public access to the file until the file itself is deleted — there is no
  built-in equivalent to Supabase's 1-year signed URL on a private bucket.
  (A Cloudflare R2 component exists for expiring URLs, but pulling in R2
  specifically to replicate Supabase's signed-URL behavior was evaluated
  and explicitly rejected for v1 — see "Screenshot storage" below.)
- **Convex has no bundled auth system.** `ctx.auth.getUserIdentity()`
  returns the JWT-derived identity (or `null`) regardless of which identity
  provider issued the token — Convex Auth, Clerk, Auth0, or a custom JWT
  provider all work via `convex/auth.config.ts`. This makes the backend
  naturally provider-agnostic without bug-catcher having to pick one.
- **Convex Components are real, npm-installable, sandboxed backend
  modules** — the Convex team's own examples for this mechanism explicitly
  include rate limiting and file storage, matching this project almost
  exactly. A component can't read data it isn't explicitly granted access
  to. This is a materially better distribution story than the Supabase
  variant's copy-a-template-into-your-own-directory approach.
- **`@convex-dev/rate-limiter` is an official, maintained Convex
  Component** — transactional, sharded rate limiting. Reusing it avoids
  reimplementing the fixed-window logic we hand-wrote in SQL for Supabase.

## Packages

### `bug-catcher-convex`

The installable Convex Component. An integrator adds it to their own
`convex/convex.config.ts` (standard Convex Component installation — not a
copy-pasted template, unlike the Supabase Edge Function). Contains:

- `schema.ts` — the component's own `submissions` table (see Data model).
- `http.ts` — the `bug-catcher-submit` HTTP Action.
- `linear.ts` — Linear GraphQL issue creation + description building. This
  is a **separate implementation from the Supabase variant's `linear.ts`**,
  not shared code — Convex's runtime and the Supabase Edge Function's Deno
  runtime are different execution environments, and forcing a shared module
  between a React/capture-focused package and a Convex backend package
  would mix concerns. Small deliberate duplication of the fetch-based
  GraphQL logic is simpler than cross-runtime sharing.
- Dependency: `@convex-dev/rate-limiter` (not hand-rolled).

### `bug-catcher-react-convex`

The React bubble for Convex. Imports `captureContext` and
`createConsoleBuffer` from `bug-catcher-core` — both are already
backend-agnostic (no Supabase dependency in either). Does **not** import
`bug-catcher-core`'s `submitReport`/`SubmitConfig`, since that shape
includes a Supabase-specific `supabaseAnonKey` field with no Convex
equivalent. Defines its own minimal submit call instead.

`bug-catcher-core` and `bug-catcher-react` are untouched — zero risk to
existing Supabase consumers.

## Screenshot storage

Flow: the HTTP Action receives the base64 screenshot, stores it via
`ctx.storage.store(blob)` to get a `storageId`, then calls
`ctx.storage.getUrl(storageId)` to get the URL embedded in the Linear
issue's Markdown description — same embedding mechanism as the Supabase
variant (`![screenshot](<url>)`).

**Deliberate, documented difference from the Supabase variant:** this URL
grants public access to the screenshot indefinitely, until the file is
deleted from Convex Storage. There is no bucket-privacy or signed-URL
equivalent. `bug-catcher-convex`'s README must state this plainly: if a
screenshot could contain sensitive on-screen data, the integrator should
know the link doesn't expire and isn't authenticated — the only way to
revoke access is deleting the storage object, and v1 doesn't automate that
(mirroring how the Supabase variant doesn't automate signed-URL
re-generation either, just for a different reason).

## Auth

The HTTP Action calls `ctx.auth.getUserIdentity()`. `null` → `401`. This
works with any identity provider the integrator has configured via
`convex/auth.config.ts` — Convex Auth, Clerk, Auth0, or custom JWT — with no
provider-specific code in `bug-catcher-convex`.

Client-side, `<BugCatcherBubble />` (from `bug-catcher-react-convex`) takes
a required prop:

```tsx
getAuthToken: () => Promise<string>
```

The integrator supplies this using whatever their auth provider's hook
returns (e.g. Convex Auth's `useAuthToken()`, or Clerk's `getToken()`). The
component never assumes a specific provider.

## Rate limiting

Uses `@convex-dev/rate-limiter` (official component) instead of a
hand-written fixed-window implementation. Same configurable shape as the
Supabase variant conceptually (`maxRequests`/`windowMinutes`, same default:
5 requests / 10 minutes), delegated to the component's own API rather than
reimplemented.

## `authorize`

Same principle as the Supabase variant: a pluggable, **required, no
default** function, run after identity verification and rate-limit check,
before any write. Receives the Convex `UserIdentity` object. The component
must fail to start if `authorize` is not supplied — hiding the bubble
client-side is UX only, this is the real security boundary, exactly as in
the Supabase design.

## Data model

```ts
// bug-catcher-convex's own schema.ts
submissions: defineTable({
  userId: v.string(),           // tokenIdentifier from ctx.auth.getUserIdentity()
  url: v.string(),
  userAgent: v.string(),
  description: v.string(),
  consoleEntries: v.array(v.object({
    level: v.string(),
    args: v.array(v.any()),
    timestamp: v.number(),
  })),
  screenshotId: v.id("_storage"),
  linearStatus: v.union(v.literal("pending"), v.literal("created"), v.literal("failed")),
  linearIssueUrl: v.optional(v.string()),
  linearError: v.optional(v.string()),
})
```

No separate rate-limit table — that's owned internally by the
`@convex-dev/rate-limiter` component.

## HTTP Action contract

```
POST https://<deployment>.convex.site/bug-catcher-submit
Body: {
  screenshot: string,        // base64 PNG
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

401 Unauthorized  -- no identity
403 Forbidden     -- authorize() returned false
429 Too Many Requests
400 Bad Request
```

Same request/response shape as the Supabase variant's Edge Function, so
`captureContext`'s output can be sent to either backend with the same
report body shape.

**Durable-first invariant, identical to the Supabase variant, including the
specific lesson learned from testing it there:** the `submissions` document
is inserted (`linearStatus: "pending"`) before the Linear call, and nothing
after that insert may produce anything other than a 200 response — this
explicitly includes protecting the Linear-description-building step from
throwing on malformed input (e.g. an invalid console-entry timestamp), the
exact bug a real end-to-end test caught in the Supabase variant.

## Testing

Convex has its own test harness (`convex-test`) that simulates the runtime
without a real deployment — the Convex-side equivalent of the fake-client
pattern used for the Supabase Edge Function's Deno tests. Minimum coverage:

- Auth: null identity → 401.
- `authorize`: allow/deny paths.
- Rate limiting: integration with `@convex-dev/rate-limiter` (exceeded →
  429).
- Linear description building, including the malformed-timestamp case
  (known real failure mode from the Supabase variant's testing).
- Full flow: insert-before-Linear-call ordering, and a simulated Linear
  failure that still returns 200.

## v1 scope

1. `bug-catcher-convex` — Convex Component (schema, HTTP Action, Linear
   integration, `@convex-dev/rate-limiter` dependency)
2. `bug-catcher-react-convex` — `<BugCatcherBubble />` for Convex, reusing
   `bug-catcher-core`'s capture/console-buffer logic
3. Demo app (new or updated) showing the Convex integration
4. `bug-catcher-convex`'s own README, explicitly documenting the
   permanent/unsigned screenshot URL difference and the required
   `authorize` function

**Explicitly not in v1:** a generic multi-backend abstraction layer, the R2
component for expiring screenshot URLs, bundling a specific auth provider.
