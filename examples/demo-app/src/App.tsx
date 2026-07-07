import { BugCatcherBubble } from '@bug-catcher/react'

export function App() {
  return (
    <div style={{ padding: 40, fontFamily: 'sans-serif' }}>
      <h1>bug-catcher demo app</h1>
      <p>Click the bubble in the bottom-right corner to file a bug report.</p>

      <BugCatcherBubble
        supabaseUrl={import.meta.env.VITE_SUPABASE_URL}
        supabaseAnonKey={import.meta.env.VITE_SUPABASE_ANON_KEY}
        onSubmitted={(result) => console.log('Bug report submitted', result)}
      />
    </div>
  )
}
