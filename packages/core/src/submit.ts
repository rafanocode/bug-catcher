import type { SubmitConfig, SubmitReport, SubmitResult } from './types'

export class SubmitError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'SubmitError'
    this.status = status
  }
}

export async function submitReport(config: SubmitConfig, report: SubmitReport): Promise<SubmitResult> {
  const response = await fetch(config.functionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.accessToken}`,
      apikey: config.supabaseAnonKey,
    },
    body: JSON.stringify(report),
  })

  if (!response.ok) {
    const body = await response.json().catch(() => ({}) as { error?: string })
    throw new SubmitError(response.status, body.error ?? `Request failed with status ${response.status}`)
  }

  return response.json() as Promise<SubmitResult>
}
