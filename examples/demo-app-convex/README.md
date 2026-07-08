# bug-catcher Convex demo

A minimal reference integration showing how a real app wires up
[`bug-catcher-convex`](../../packages/convex) and
[`bug-catcher-react-convex`](../../packages/react-convex) together.

## Setup

1. Install dependencies from the repo root: `pnpm install`

2. Bootstrap this app's own Convex deployment and generate `convex/_generated/`
   (not checked into git — regenerate it locally):
   ```sh
   cd examples/demo-app-convex
   npx convex dev --once
   ```

3. Set the Linear secrets on **this app's own deployment**, before any
   further push — `convex/convex.config.ts` binds `LINEAR_API_KEY` /
   `LINEAR_TEAM_ID` by reference (`app.env.X`) to this deployment's env-var
   store, not to a local `process.env` snapshot. See
   `packages/convex/README.md` for why the ordering matters:
   ```sh
   npx convex env set LINEAR_API_KEY ...
   npx convex env set LINEAR_TEAM_ID ...
   npx convex dev --once
   ```

4. Copy `.env.example` to `.env.local` and set `VITE_CONVEX_SITE_URL` to
   the `.convex.site` URL printed by `npx convex dev`.

5. Run the app: `pnpm dev`

## Auth

This demo has no real sign-in flow — `src/App.tsx`'s `getAuthToken` reads a
`window.__DEMO_CONVEX_TOKEN__` global that you'd set after wiring in your
own Convex Auth / Clerk / etc. provider. `convex/bugCatcherAuthorize.ts`
shows where to put your actual access-control check (the real security
boundary bug-catcher-convex delegates to).
