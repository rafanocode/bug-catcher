import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BugCatcherBubble } from '../src/BugCatcherBubble'

const captureContext = vi.fn()

vi.mock('bug-catcher-core', () => ({
  createConsoleBuffer: () => ({ entries: [], start: vi.fn(), stop: vi.fn() }),
  captureContext: (...args: unknown[]) => captureContext(...args),
}))

describe('BugCatcherBubble', () => {
  beforeEach(() => {
    captureContext.mockReset().mockResolvedValue({
      screenshot: 'data:image/png;base64,abc',
      url: 'https://app.example.com',
      userAgent: 'test-agent',
      consoleEntries: [],
    })
  })

  it('opens the form, submits via fetch to convexSiteUrl, and shows success', async () => {
    const getAuthToken = vi.fn().mockResolvedValue('convex-jwt-token')
    const onSubmitted = vi.fn()
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ submissionId: 'sub_1', linearStatus: 'created', linearIssueUrl: 'https://linear.app/issue/1' }),
    }) as unknown as typeof fetch

    render(
      <BugCatcherBubble
        convexSiteUrl="https://exuberant-deployment.convex.site"
        getAuthToken={getAuthToken}
        onSubmitted={onSubmitted}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Report a bug' }))
    fireEvent.change(screen.getByLabelText('What were you doing? What went wrong?'), {
      target: { value: 'it crashed' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

    await waitFor(() => expect(screen.getByText('Report saved. Thank you!')).toBeInTheDocument())

    expect(global.fetch).toHaveBeenCalledWith(
      'https://exuberant-deployment.convex.site/bug-catcher-submit',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer convex-jwt-token' }),
      }),
    )
    expect(onSubmitted).toHaveBeenCalledWith({
      submissionId: 'sub_1',
      linearStatus: 'created',
      linearIssueUrl: 'https://linear.app/issue/1',
    })
  })

  it('shows an error when getAuthToken rejects (no session)', async () => {
    const getAuthToken = vi.fn().mockRejectedValue(new Error('not signed in'))

    render(<BugCatcherBubble convexSiteUrl="https://exuberant-deployment.convex.site" getAuthToken={getAuthToken} />)

    fireEvent.click(screen.getByRole('button', { name: 'Report a bug' }))
    fireEvent.change(screen.getByLabelText('What were you doing? What went wrong?'), {
      target: { value: 'it crashed' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('not signed in'))
  })
})
