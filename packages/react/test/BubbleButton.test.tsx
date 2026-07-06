import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BubbleButton } from '../src/BubbleButton'

describe('BubbleButton', () => {
  it('renders an accessible button and calls onClick when clicked', () => {
    const onClick = vi.fn()
    render(<BubbleButton primaryColor="#6366f1" onClick={onClick} />)

    const button = screen.getByRole('button', { name: 'Report a bug' })
    fireEvent.click(button)

    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('applies the given primaryColor as the background color', () => {
    render(<BubbleButton primaryColor="#ff0000" onClick={() => {}} />)

    const button = screen.getByRole('button', { name: 'Report a bug' })
    expect(button).toHaveStyle({ backgroundColor: '#ff0000' })
  })
})
