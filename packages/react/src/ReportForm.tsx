import { useState, type CSSProperties } from 'react'

export interface ReportFormProps {
  status: 'open' | 'submitting' | 'success' | 'error'
  error: string | null
  primaryColor: string
  onSubmit: (description: string) => void
  onClose: () => void
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

export function ReportForm({ status, error, primaryColor, onSubmit, onClose }: ReportFormProps) {
  const [description, setDescription] = useState('')

  if (status === 'success') {
    return (
      <div role="dialog" aria-label="Bug report submitted" style={panelStyle}>
        <p>Report saved. Thank you!</p>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
    )
  }

  return (
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
          onClick={() => onSubmit(description)}
          disabled={status === 'submitting' || (status !== 'error' && description.trim().length === 0)}
          style={{ backgroundColor: primaryColor, color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 4 }}
        >
          {status === 'submitting' ? 'Submitting…' : 'Submit'}
        </button>
        <button type="button" onClick={onClose} disabled={status === 'submitting'}>
          Cancel
        </button>
      </div>
    </div>
  )
}
