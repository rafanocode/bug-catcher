import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ReportForm } from '../src/ReportForm'

describe('ReportForm', () => {
  it('disables Submit until a description is entered, then calls onSubmit with it', () => {
    const onSubmit = vi.fn()
    render(<ReportForm status="open" error={null} primaryColor="#6366f1" onSubmit={onSubmit} onClose={() => {}} />)

    const submitButton = screen.getByRole('button', { name: 'Submit' })
    expect(submitButton).toBeDisabled()

    const textarea = screen.getByLabelText('What were you doing? What went wrong?')
    fireEvent.change(textarea, { target: { value: 'the button does nothing' } })

    expect(submitButton).toBeEnabled()
    fireEvent.click(submitButton)

    expect(onSubmit).toHaveBeenCalledWith('the button does nothing')
  })

  it('shows the error message and re-enables the form when status is error', () => {
    render(
      <ReportForm status="error" error="Rate limit exceeded" primaryColor="#6366f1" onSubmit={() => {}} onClose={() => {}} />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Rate limit exceeded')
    expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled()
  })

  it('disables the form while submitting', () => {
    render(<ReportForm status="submitting" error={null} primaryColor="#6366f1" onSubmit={() => {}} onClose={() => {}} />)

    expect(screen.getByRole('button', { name: 'Submitting…' })).toBeDisabled()
    expect(screen.getByLabelText('What were you doing? What went wrong?')).toBeDisabled()
  })

  it('shows a success message and a Close button when status is success', () => {
    const onClose = vi.fn()
    render(<ReportForm status="success" error={null} primaryColor="#6366f1" onSubmit={() => {}} onClose={onClose} />)

    expect(screen.getByText('Report saved. Thank you!')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
