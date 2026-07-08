import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { captureContext, createConsoleBuffer } from 'bug-catcher-core'
import { Spinner } from './Spinner'
import {
  GLOBAL_STYLES,
  accentVars,
  alertStyle,
  panelStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
  successIconWrapStyle,
  textareaStyle,
  titleStyle,
} from './styles'

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
  const [isFocused, setIsFocused] = useState(false)

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
    ...accentVars(primaryColor),
  }

  if (status === 'idle') {
    return (
      <div style={wrapperStyle}>
        <style>{GLOBAL_STYLES}</style>
        <button
          type="button"
          aria-label="Report a bug"
          onClick={() => setStatus('open')}
          className="bug-catcher-bubble-btn"
          style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            border: 'none',
            backgroundColor: primaryColor,
            color: '#fff',
            fontSize: 24,
            lineHeight: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(0,0,0,0.25), 0 1px 3px rgba(0,0,0,0.15)',
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
        <style>{GLOBAL_STYLES}</style>
        <div role="dialog" aria-label="Bug report submitted" className="bug-catcher-panel" style={panelStyle}>
          <div style={successIconWrapStyle} aria-hidden="true">
            ✓
          </div>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: '#374151' }}>Report saved. Thank you!</p>
          <button
            type="button"
            onClick={() => setStatus('idle')}
            className="bug-catcher-btn-secondary"
            style={secondaryButtonStyle(false)}
          >
            Close
          </button>
        </div>
      </div>
    )
  }

  const submitDisabled = status === 'submitting' || description.trim().length === 0

  return (
    <div style={wrapperStyle}>
      <style>{GLOBAL_STYLES}</style>
      <div role="dialog" aria-label="Report a bug" className="bug-catcher-panel" style={panelStyle}>
        <p style={titleStyle}>🐞 Report a bug</p>
        <textarea
          aria-label="What were you doing? What went wrong?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          disabled={status === 'submitting'}
          rows={4}
          className="bug-catcher-textarea"
          style={textareaStyle(isFocused)}
        />
        {status === 'error' && (
          <p role="alert" style={alertStyle}>
            <span aria-hidden="true">⚠️</span> {error}
          </p>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitDisabled}
            className="bug-catcher-btn-primary"
            style={primaryButtonStyle(primaryColor, submitDisabled)}
          >
            {status === 'submitting' && <Spinner />}
            {status === 'submitting' ? 'Submitting…' : 'Submit'}
          </button>
          <button
            type="button"
            onClick={() => setStatus('idle')}
            disabled={status === 'submitting'}
            className="bug-catcher-btn-secondary"
            style={secondaryButtonStyle(status === 'submitting')}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
