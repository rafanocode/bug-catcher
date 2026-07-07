export interface LinearConfig {
  apiKey: string
  teamId: string
  projectId?: string
  labelIds?: string[]
}

export interface LinearIssueInput {
  title: string
  description: string
}

export interface LinearResult {
  status: 'created' | 'failed'
  issueUrl: string | null
  error: string | null
}

const LINEAR_API_URL = 'https://api.linear.app/graphql'

const ISSUE_CREATE_MUTATION = `
  mutation IssueCreate($input: IssueCreateInput!) {
    issueCreate(input: $input) {
      success
      issue { url }
    }
  }
`

export async function createLinearIssue(config: LinearConfig, input: LinearIssueInput): Promise<LinearResult> {
  try {
    const response = await fetch(LINEAR_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Linear expects the raw API key here, with no "Bearer " prefix.
        Authorization: config.apiKey,
      },
      body: JSON.stringify({
        query: ISSUE_CREATE_MUTATION,
        variables: {
          input: {
            teamId: config.teamId,
            projectId: config.projectId,
            labelIds: config.labelIds,
            title: input.title,
            description: input.description,
          },
        },
      }),
    })

    const json = await response.json()
    if (!response.ok || json.errors || !json.data?.issueCreate?.success) {
      const message = json.errors?.[0]?.message ?? `Linear API responded with status ${response.status}`
      return { status: 'failed', issueUrl: null, error: message }
    }

    return { status: 'created', issueUrl: json.data.issueCreate.issue.url, error: null }
  } catch (err) {
    return { status: 'failed', issueUrl: null, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// A malformed console-entry timestamp must never throw here: this function runs
// after the submission has already been durably inserted, so any exception it
// raises would surface as a false failure even though the report was saved.
function formatTimestamp(timestamp: number): string {
  try {
    return new Date(timestamp).toISOString()
  } catch {
    return '(invalid timestamp)'
  }
}

function safeStringify(args: unknown[]): string {
  return args
    .map((a) => {
      if (typeof a === 'string') return a
      try {
        return JSON.stringify(a)
      } catch {
        return String(a)
      }
    })
    .join(' ')
}

export function buildIssueDescription(params: {
  description: string
  url: string
  userAgent: string
  screenshotUrl: string
  consoleEntries: { level: string; args: unknown[]; timestamp: number }[]
}): string {
  const consoleBlock = params.consoleEntries
    .map((e) => `[${formatTimestamp(e.timestamp)}] ${e.level}: ${safeStringify(e.args)}`)
    .join('\n')

  return [
    '## Report',
    params.description,
    '',
    '## Screenshot',
    `![screenshot](${params.screenshotUrl})`,
    '',
    '## Context',
    `- URL: ${params.url}`,
    `- User agent: ${params.userAgent}`,
    '',
    '## Console log',
    '```',
    consoleBlock || '(no console entries captured)',
    '```',
  ].join('\n')
}
