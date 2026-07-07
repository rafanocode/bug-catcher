import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { createConsoleBuffer } from '../src/console-buffer'

describe('createConsoleBuffer', () => {
  const originalLog = console.log
  const originalWarn = console.warn

  afterEach(() => {
    console.log = originalLog
    console.warn = originalWarn
  })

  it('captures entries after start() is called', () => {
    const buffer = createConsoleBuffer(50)
    buffer.start()

    console.log('hello', 42)
    console.warn('careful')

    expect(buffer.entries).toHaveLength(2)
    expect(buffer.entries[0]).toMatchObject({ level: 'log', args: ['hello', 42] })
    expect(buffer.entries[1]).toMatchObject({ level: 'warn', args: ['careful'] })
    expect(typeof buffer.entries[0].timestamp).toBe('number')

    buffer.stop()
  })

  it('trims to the configured ring size', () => {
    const buffer = createConsoleBuffer(3)
    buffer.start()

    for (let i = 0; i < 5; i++) console.log(`entry-${i}`)

    expect(buffer.entries).toHaveLength(3)
    expect(buffer.entries.map((e) => e.args[0])).toEqual(['entry-2', 'entry-3', 'entry-4'])

    buffer.stop()
  })

  it('stop() restores the original console methods', () => {
    const buffer = createConsoleBuffer(50)
    const spy = vi.fn()
    console.log = spy

    buffer.start()
    buffer.stop()

    console.log('after stop')
    expect(spy).toHaveBeenCalledWith('after stop')
    expect(buffer.entries).toHaveLength(0)
  })

  it('still forwards to the original console method while capturing', () => {
    const spy = vi.fn()
    console.log = spy
    const buffer = createConsoleBuffer(50)

    buffer.start()
    console.log('forwarded')

    expect(spy).toHaveBeenCalledWith('forwarded')
    buffer.stop()
  })
})
