import { describe, expect, it, vi } from 'vitest'
import { captureContext } from '../src/capture'
import type { ConsoleEntry } from '../src/types'

vi.mock('modern-screenshot', () => ({
  domToPng: vi.fn().mockResolvedValue('data:image/png;base64,fake-screenshot-data'),
}))

describe('captureContext', () => {
  it('returns screenshot, url, userAgent, and the given console entries', async () => {
    const consoleEntries: ConsoleEntry[] = [{ level: 'log', args: ['hi'], timestamp: 123 }]

    const result = await captureContext(consoleEntries)

    expect(result.screenshot).toBe('data:image/png;base64,fake-screenshot-data')
    expect(result.url).toBe(window.location.href)
    expect(result.userAgent).toBe(navigator.userAgent)
    expect(result.consoleEntries).toEqual(consoleEntries)
  })

  it('copies the console entries array rather than holding a live reference', async () => {
    const consoleEntries: ConsoleEntry[] = [{ level: 'log', args: ['hi'], timestamp: 123 }]

    const result = await captureContext(consoleEntries)
    consoleEntries.push({ level: 'error', args: ['later'], timestamp: 456 })

    expect(result.consoleEntries).toHaveLength(1)
  })
})
