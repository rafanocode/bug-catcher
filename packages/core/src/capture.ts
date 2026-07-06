import { domToPng } from 'modern-screenshot'
import type { CaptureContext, ConsoleEntry } from './types'

export async function captureContext(consoleEntries: ConsoleEntry[]): Promise<CaptureContext> {
  const screenshot = await domToPng(document.documentElement)
  return {
    screenshot,
    url: window.location.href,
    userAgent: navigator.userAgent,
    consoleEntries: [...consoleEntries],
  }
}
