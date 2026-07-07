export type ConsoleLevel = 'log' | 'warn' | 'error' | 'info' | 'debug'

export interface ConsoleEntry {
  level: ConsoleLevel
  args: unknown[]
  timestamp: number
}

export interface CaptureContext {
  screenshot: string
  url: string
  userAgent: string
  consoleEntries: ConsoleEntry[]
}

export interface SubmitConfig {
  functionUrl: string
  supabaseAnonKey: string
  accessToken: string
}

export type LinearStatus = 'created' | 'failed'

export interface SubmitResult {
  submissionId: string
  linearStatus: LinearStatus
  linearIssueUrl: string | null
}

export interface SubmitReport extends CaptureContext {
  description: string
}
