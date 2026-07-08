import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { captureContext, createConsoleBuffer } from 'bug-catcher-core'

export interface SubmitResult {
  submissionId: string
  linearStatus: 'created' | 'failed'
  linearIssueUrl: string | null
}

export interface BugCatcherBubbleProps {
  convexSiteUrl: string
  getAuthToken: () => Promise<string>
  position?: 'bottom-right' | 'bottom-left'
  primaryColor?: string
  consoleBufferSize?: number
  onSubmitted?: (result: SubmitResult) => void
}

type Status = 'idle' | 'open' | 'submitting' | 'success' | 'error'

export function BugCatcherBubble({
  convexSiteUrl,
  getAuthToken,
  position = 'bottom-right',
  primaryColor = '#6366f1',
  consoleBufferSize = 50,
  onSubmitted,
}: BugCatcherBubbleProps) {
  const consoleBuffer = useMemo(() => createConsoleBuffer(consoleBufferSize), [consoleBufferSize])
  const [status, setStatus] = useState<Status>('idle')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    consoleBuffer.start()
    return () => consoleBuffer.stop()
  }, [consoleBuffer])

  async function handleSubmit() {
    setStatus('submitting')
    setError(null)
    try {
      const token = await getAuthToken()
      const context = await captureContext(consoleBuffer.entries)

      const response = await fetch(`${convexSiteUrl}/bug-catcher-submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...context, description }),
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({}) as { error?: string })
        throw new Error(body.error ?? `Request failed with status ${response.status}`)
      }

      const result = (await response.json()) as SubmitResult
      setStatus('success')
      onSubmitted?.(result)
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Submission failed')
    }
  }

  const wrapperStyle: CSSProperties = {
    position: 'fixed',
    zIndex: 999999,
    ...(position === 'bottom-right' ? { bottom: 16, right: 16 } : { bottom: 16, left: 16 }),
  }

  if (status === 'idle') {
    return (
      <div style={wrapperStyle}>
        <button
          type="button"
          aria-label="Report a bug"
          onClick={() => setStatus('open')}
          style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            border: 'none',
            backgroundColor: primaryColor,
            color: '#fff',
            fontSize: 24,
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
          }}
        >
          🐞
        </button>
      </div>
    )
  }

  if (status === 'success') {
    return (
      <div style={wrapperStyle}>
        <div role="dialog" aria-label="Bug report submitted" style={panelStyle}>
          <p>Report saved. Thank you!</p>
          <button type="button" onClick={() => setStatus('idle')}>
            Close
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={wrapperStyle}>
      <div role="dialog" aria-label="Report a bug" style={panelStyle}>
        <textarea
          aria-label="What were you doing? What went wrong?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={status === 'submitting'}
          rows={4}
          style={{ width: '100%' }}
        />
        {status === 'error' && (
          <p role="alert" style={{ color: '#dc2626' }}>
            {error}
          </p>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={status === 'submitting' || description.trim().length === 0}
            style={{ backgroundColor: primaryColor, color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 4 }}
          >
            {status === 'submitting' ? 'Submitting…' : 'Submit'}
          </button>
          <button type="button" onClick={() => setStatus('idle')} disabled={status === 'submitting'}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

const panelStyle: CSSProperties = {
  background: '#fff',
  color: '#111',
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  padding: 12,
  boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
  width: 280,
}
