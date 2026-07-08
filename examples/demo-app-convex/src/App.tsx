import { BugCatcherBubble } from 'bug-catcher-react-convex'

// A real app would use its actual Convex Auth/Clerk/etc. hook here.
// This demo assumes a `window.__DEMO_CONVEX_TOKEN__` set after sign-in,
// to keep the demo focused on the bug-catcher integration itself rather
// than a full auth setup.
async function getAuthToken(): Promise<string> {
  const token = (window as unknown as { __DEMO_CONVEX_TOKEN__?: string }).__DEMO_CONVEX_TOKEN__
  if (!token) throw new Error('Not signed in')
  return token
}

export function App() {
  return (
    <div style={{ padding: 40, fontFamily: 'sans-serif' }}>
      <h1>bug-catcher Convex demo</h1>
      <p>Click the bubble in the bottom-right corner to file a bug report.</p>

      <BugCatcherBubble
        convexSiteUrl={import.meta.env.VITE_CONVEX_SITE_URL}
        getAuthToken={getAuthToken}
        onSubmitted={(result) => console.log('Bug report submitted', result)}
      />
    </div>
  )
}
