import type { SupabaseClient, User } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, handleOptions, type CorsConfig } from './cors.ts'
import { verifyRequestUser } from './auth.ts'
import { checkRateLimit, type RateLimitConfig } from './rate-limit.ts'
import { createLinearIssue, buildIssueDescription, type LinearConfig } from './linear.ts'

export interface HandlerDeps {
  anonClient: SupabaseClient
  serviceClient: SupabaseClient
  corsConfig: CorsConfig
  rateLimitConfig: RateLimitConfig
  linearConfig: LinearConfig
  authorize: (user: User, req: Request) => boolean | Promise<boolean>
}

interface SubmitBody {
  screenshot: string
  url: string
  userAgent: string
  consoleEntries: { level: string; args: unknown[]; timestamp: number }[]
  description: string
}

function jsonResponse(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers })
}

export function createHandler(deps: HandlerDeps): (req: Request) => Promise<Response> {
  return async function handle(req: Request): Promise<Response> {
    const preflight = handleOptions(req, deps.corsConfig)
    if (preflight) return preflight

    const headers = {
      ...corsHeaders(req.headers.get('origin'), deps.corsConfig),
      'Content-Type': 'application/json',
    }

    if (req.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, 405, headers)
    }

    const { user, error: authError } = await verifyRequestUser(req, deps.anonClient)
    if (!user) {
      return jsonResponse({ error: authError }, 401, headers)
    }

    const allowed = await checkRateLimit(deps.serviceClient, user.id, deps.rateLimitConfig)
    if (!allowed) {
      return jsonResponse({ error: 'Rate limit exceeded' }, 429, headers)
    }

    const isAuthorized = await deps.authorize(user, req)
    if (!isAuthorized) {
      return jsonResponse({ error: 'Forbidden' }, 403, headers)
    }

    let body: SubmitBody
    try {
      body = (await req.json()) as SubmitBody
      if (!body.description || !body.screenshot || !body.url) {
        throw new Error('Missing required field')
      }
    } catch {
      return jsonResponse({ error: 'Invalid request body' }, 400, headers)
    }

    const base64Data = body.screenshot.replace(/^data:image\/png;base64,/, '')
    const screenshotBytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0))
    const screenshotPath = `${user.id}/${crypto.randomUUID()}.png`

    const { error: uploadError } = await deps.serviceClient.storage
      .from('bug-catcher-screenshots')
      .upload(screenshotPath, screenshotBytes, { contentType: 'image/png' })

    if (uploadError) {
      return jsonResponse({ error: `Screenshot upload failed: ${uploadError.message}` }, 500, headers)
    }

    const { data: signedUrlData, error: signedUrlError } = await deps.serviceClient.storage
      .from('bug-catcher-screenshots')
      .createSignedUrl(screenshotPath, 60 * 60 * 24 * 365)

    if (signedUrlError || !signedUrlData) {
      return jsonResponse({ error: 'Failed to generate screenshot URL' }, 500, headers)
    }

    // Durable-first: this insert must land before the Linear call below.
    const { data: inserted, error: insertError } = await deps.serviceClient
      .from('bug_catcher_submissions')
      .insert({
        user_id: user.id,
        url: body.url,
        user_agent: body.userAgent,
        description: body.description,
        console_entries: body.consoleEntries,
        screenshot_path: screenshotPath,
        linear_status: 'pending',
      })
      .select('id')
      .single()

    if (insertError || !inserted) {
      return jsonResponse({ error: `Failed to save submission: ${insertError?.message}` }, 500, headers)
    }

    const submissionId = inserted.id as string

    const linearResult = await createLinearIssue(deps.linearConfig, {
      title: `Bug report: ${body.url}`,
      description: buildIssueDescription({
        description: body.description,
        url: body.url,
        userAgent: body.userAgent,
        screenshotUrl: signedUrlData.signedUrl,
        consoleEntries: body.consoleEntries,
      }),
    })

    await deps.serviceClient
      .from('bug_catcher_submissions')
      .update({
        linear_status: linearResult.status,
        linear_issue_url: linearResult.issueUrl,
        linear_error: linearResult.error,
      })
      .eq('id', submissionId)

    // A Linear failure is never a submission failure: the report is already durable.
    return jsonResponse(
      { submissionId, linearStatus: linearResult.status, linearIssueUrl: linearResult.issueUrl },
      200,
      headers,
    )
  }
}
