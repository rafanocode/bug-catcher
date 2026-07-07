import type { ConsoleEntry, ConsoleLevel } from './types'

const LEVELS: ConsoleLevel[] = ['log', 'warn', 'error', 'info', 'debug']

export interface ConsoleBuffer {
  entries: ConsoleEntry[]
  start(): void
  stop(): void
}

export function createConsoleBuffer(size = 50): ConsoleBuffer {
  const entries: ConsoleEntry[] = []
  const originals: Partial<Record<ConsoleLevel, (...args: unknown[]) => void>> = {}
  let started = false

  function push(level: ConsoleLevel, args: unknown[]) {
    entries.push({ level, args, timestamp: Date.now() })
    if (entries.length > size) entries.shift()
  }

  return {
    entries,
    start() {
      if (started) return
      started = true
      for (const level of LEVELS) {
        originals[level] = console[level].bind(console)
        console[level] = (...args: unknown[]) => {
          push(level, args)
          originals[level]!(...args)
        }
      }
    },
    stop() {
      if (!started) return
      started = false
      for (const level of LEVELS) {
        if (originals[level]) console[level] = originals[level]!
      }
      entries.length = 0
    },
  }
}
