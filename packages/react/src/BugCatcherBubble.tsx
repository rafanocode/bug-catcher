import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { captureContext, createConsoleBuffer, submitReport, type SubmitResult } from 'bug-catcher-core'
import { BubbleButton } from './BubbleButton'
import { ReportForm } from './ReportForm'
import { GLOBAL_STYLES, accentVars } from './styles'

export interface BugCatcherBubbleProps {
  supabaseUrl: string
  supabaseAnonKey: string
  functionName?: string
  position?: 'bottom-right' | 'bottom-left'
  primaryColor?: string
  consoleBufferSize?: number
  onSubmitted?: (result: SubmitResult) => void
}

type Status = 'idle' | 'open' | 'submitting' | 'success' | 'error'

export function BugCatcherBubble({
  supabaseUrl,
  supabaseAnonKey,
  functionName = 'bug-catcher-submit',
  position = 'bottom-right',
  primaryColor = '#6366f1',
  consoleBufferSize = 50,
  onSubmitted,
}: BugCatcherBubbleProps) {
  const supabase = useMemo(() => createClient(supabaseUrl, supabaseAnonKey), [supabaseUrl, supabaseAnonKey])
  const consoleBuffer = useMemo(() => createConsoleBuffer(consoleBufferSize), [consoleBufferSize])
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    consoleBuffer.start()
    return () => consoleBuffer.stop()
  }, [consoleBuffer])

  async function handleSubmit(description: string) {
    setStatus('submitting')
    setError(null)
    try {
      const { data } = await supabase.auth.getSession()
      const accessToken = data.session?.access_token
      if (!accessToken) throw new Error('No active Supabase session')

      const context = await captureContext(consoleBuffer.entries)
      const result = await submitReport(
        {
          functionUrl: `${supabaseUrl}/functions/v1/${functionName}`,
          supabaseAnonKey,
          accessToken,
        },
        { ...context, description },
      )
      setStatus('success')
      onSubmitted?.(result)
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Submission failed')
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        zIndex: 999999,
        ...(position === 'bottom-right' ? { bottom: 16, right: 16 } : { bottom: 16, left: 16 }),
        ...accentVars(primaryColor),
      }}
    >
      <style>{GLOBAL_STYLES}</style>
      {status === 'idle' ? (
        <BubbleButton primaryColor={primaryColor} onClick={() => setStatus('open')} />
      ) : (
        <ReportForm
          status={status}
          error={error}
          primaryColor={primaryColor}
          onSubmit={handleSubmit}
          onClose={() => setStatus('idle')}
        />
      )}
    </div>
  )
}
