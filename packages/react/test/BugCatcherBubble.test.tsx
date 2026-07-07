import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BugCatcherBubble } from '../src/BugCatcherBubble'

const getSession = vi.fn()
const createClientMock = vi.fn(() => ({ auth: { getSession } }))

vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}))

const captureContext = vi.fn()
const submitReport = vi.fn()

vi.mock('bug-catcher-core', () => ({
  createConsoleBuffer: () => ({ entries: [], start: vi.fn(), stop: vi.fn() }),
  captureContext: (...args: unknown[]) => captureContext(...args),
  submitReport: (...args: unknown[]) => submitReport(...args),
}))

describe('BugCatcherBubble', () => {
  beforeEach(() => {
    getSession.mockReset().mockResolvedValue({ data: { session: { access_token: 'jwt-token' } } })
    captureContext.mockReset().mockResolvedValue({
      screenshot: 'data:image/png;base64,abc',
      url: 'https://app.example.com',
      userAgent: 'test-agent',
      consoleEntries: [],
    })
    submitReport.mockReset()
  })

  it('opens the form on bubble click, submits, and shows success', async () => {
    submitReport.mockResolvedValue({ submissionId: 'sub_1', linearStatus: 'created', linearIssueUrl: 'https://linear.app/issue/1' })
    const onSubmitted = vi.fn()

    render(
      <BugCatcherBubble supabaseUrl="https://xyz.supabase.co" supabaseAnonKey="anon-key" onSubmitted={onSubmitted} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Report a bug' }))
    fireEvent.change(screen.getByLabelText('What were you doing? What went wrong?'), {
      target: { value: 'it crashed' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

    await waitFor(() => expect(screen.getByText('Report saved. Thank you!')).toBeInTheDocument())

    expect(submitReport).toHaveBeenCalledWith(
      expect.objectContaining({
        functionUrl: 'https://xyz.supabase.co/functions/v1/bug-catcher-submit',
        supabaseAnonKey: 'anon-key',
        accessToken: 'jwt-token',
      }),
      expect.objectContaining({ description: 'it crashed' }),
    )
    expect(onSubmitted).toHaveBeenCalledWith({
      submissionId: 'sub_1',
      linearStatus: 'created',
      linearIssueUrl: 'https://linear.app/issue/1',
    })
  })

  it('shows an error message when there is no active Supabase session', async () => {
    getSession.mockResolvedValue({ data: { session: null } })

    render(<BugCatcherBubble supabaseUrl="https://xyz.supabase.co" supabaseAnonKey="anon-key" />)

    fireEvent.click(screen.getByRole('button', { name: 'Report a bug' }))
    fireEvent.change(screen.getByLabelText('What were you doing? What went wrong?'), {
      target: { value: 'it crashed' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('No active Supabase session'))
  })
})
