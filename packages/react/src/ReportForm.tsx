import { useState } from 'react'
import { Spinner } from './Spinner'
import {
  alertStyle,
  panelStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
  successIconWrapStyle,
  textareaStyle,
  titleStyle,
} from './styles'

export interface ReportFormProps {
  status: 'open' | 'submitting' | 'success' | 'error'
  error: string | null
  primaryColor: string
  onSubmit: (description: string) => void
  onClose: () => void
}

export function ReportForm({ status, error, primaryColor, onSubmit, onClose }: ReportFormProps) {
  const [description, setDescription] = useState('')
  const [isFocused, setIsFocused] = useState(false)

  if (status === 'success') {
    return (
      <div role="dialog" aria-label="Bug report submitted" className="bug-catcher-panel" style={panelStyle}>
        <div style={successIconWrapStyle} aria-hidden="true">
          ✓
        </div>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: '#374151' }}>Report saved. Thank you!</p>
        <button
          type="button"
          onClick={onClose}
          className="bug-catcher-btn-secondary"
          style={secondaryButtonStyle(false)}
        >
          Close
        </button>
      </div>
    )
  }

  const submitDisabled = status === 'submitting' || (status !== 'error' && description.trim().length === 0)

  return (
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
          onClick={() => onSubmit(description)}
          disabled={submitDisabled}
          className="bug-catcher-btn-primary"
          style={primaryButtonStyle(primaryColor, submitDisabled)}
        >
          {status === 'submitting' && <Spinner />}
          {status === 'submitting' ? 'Submitting…' : 'Submit'}
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={status === 'submitting'}
          className="bug-catcher-btn-secondary"
          style={secondaryButtonStyle(status === 'submitting')}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
