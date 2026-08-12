/**
 * Client for the SentinelAI FastAPI backend.
 *
 * Set `VITE_API_URL` to your Render (or other) backend URL in production.
 * Local dev defaults to http://localhost:8000.
 */

import { formatApiError } from './formatApiError'

const configuredUrl = (import.meta.env.VITE_API_URL as string | undefined)?.trim()?.replace(/\/$/, '')

export const API_URL = configuredUrl || (import.meta.env.DEV ? 'http://localhost:8000' : '')

export const isApiConfigured = Boolean(API_URL)

function requireApiUrl(): string {
  if (!API_URL) {
    throw new Error(
      'Backend URL is not configured. Set VITE_API_URL to your Render backend URL in Vercel project settings, then redeploy.',
    )
  }
  return API_URL
}

export type IncidentAnalysis = {
  likely_cause: string
  confidence: number
  most_relevant_commit: string
  affected_services: string[]
  suggested_runbook: string
  next_steps: string[]
}

export type RunbookMatch = {
  id: string
  title: string
  content: string
  distance: number | null
}

export type RunbookValidateResult = {
  valid: boolean
  missing_sections: string[]
}

export type GithubValidateResult = {
  valid: boolean
  owner: string
  name: string
  full_name: string
  private: boolean
}

export type SlackValidateResult = {
  valid: boolean
}

export type IncidentResponse = {
  analysis: IncidentAnalysis
  slack_posted: boolean
  slack_error?: string | null
  scanned_commits: number
  runbook_matches: RunbookMatch[]
}

export type AnalyzeInput = {
  github_repo: string
  description?: string
  slack_webhook_url?: string | null
  deployment?: string | null
  post_to_slack?: boolean
}

export class ApiRequestError extends Error {
  readonly status: number
  readonly url: string
  readonly detail: string
  readonly responseBody: unknown

  constructor(opts: {
    message: string
    status: number
    url: string
    detail: string
    responseBody?: unknown
  }) {
    super(opts.message)
    this.name = 'ApiRequestError'
    this.status = opts.status
    this.url = opts.url
    this.detail = opts.detail
    this.responseBody = opts.responseBody ?? null
  }
}

function extractDetail(body: unknown): string {
  if (!body || typeof body !== 'object') return ''
  const detail = (body as { detail?: unknown }).detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object' && 'msg' in item) {
          const loc = 'loc' in item && Array.isArray(item.loc) ? item.loc.join('.') : ''
          return loc ? `${loc}: ${item.msg}` : String(item.msg)
        }
        return JSON.stringify(item)
      })
      .join('; ')
  }
  return ''
}

function formatHttpErrorMessage(
  status: number,
  statusText: string,
  url: string,
  detail: string,
): string {
  const path = (() => {
    try {
      return new URL(url).pathname
    } catch {
      return url
    }
  })()

  if (status === 404 && (!detail || detail === 'Not Found')) {
    return (
      `Backend route ${path} was not found (HTTP 404). ` +
      `Check VITE_API_URL (currently ${API_URL || 'unset'}) and rebuild the backend: ` +
      '`cd backend && docker compose up --build`.'
    )
  }

  if (status === 0) {
    return detail || `Could not reach backend at ${API_URL || 'unset'}.`
  }

  if (status === 429) {
    return formatApiError(`429 RESOURCE_EXHAUSTED ${detail || statusText}`)
  }

  if ((status === 502 || status === 503) && !detail) {
    return `Backend unavailable (HTTP ${status} ${statusText}). Is the backend running?`
  }

  if (detail) return formatApiError(detail)

  return `Request failed (HTTP ${status} ${statusText}) for ${path}`
}

export async function readApiError(res: Response, url: string): Promise<ApiRequestError> {
  let responseBody: unknown = null
  let rawText = ''

  try {
    rawText = await res.text()
    if (rawText) {
      try {
        responseBody = JSON.parse(rawText)
      } catch {
        responseBody = rawText
      }
    }
  } catch {
    // ignore read failures
  }

  const detail =
    extractDetail(responseBody) ||
    (typeof responseBody === 'string' ? responseBody : '') ||
    res.statusText

  const message = formatHttpErrorMessage(res.status, res.statusText, url, detail)

  return new ApiRequestError({
    message,
    status: res.status,
    url,
    detail,
    responseBody,
  })
}

async function parseError(res: Response, url?: string): Promise<string> {
  const err = await readApiError(res, url ?? res.url)
  return err.message
}

async function fetchBackend(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init)
  } catch (err) {
    throw new ApiRequestError({
      message: `Could not reach backend at ${API_URL}. Start it with \`cd backend && docker compose up --build\`.`,
      status: 0,
      url,
      detail: err instanceof Error ? err.message : String(err),
    })
  }
}

/** Log structured validation / API errors for debugging in the browser console. */
export function logApiError(scope: string, err: unknown): void {
  if (err instanceof ApiRequestError) {
    console.error(`[SentinelAI] ${scope}`, {
      message: err.message,
      status: err.status,
      url: err.url,
      detail: err.detail,
      responseBody: err.responseBody,
    })
    return
  }
  console.error(`[SentinelAI] ${scope}`, err)
}

/** Run the full incident pipeline: GitHub + runbooks + Gemini, then post to Slack. */
export async function analyzeIncident(input: AnalyzeInput): Promise<IncidentResponse> {
  const res = await fetch(`${requireApiUrl()}/api/incidents/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export type PostmortemPayload = {
  slack_webhook_url: string
  incident_number: number
  title: string
  started_at: string
  resolved_at: string
  reported_by: string
  assigned_to: string | null
  impact: string
  root_cause: string
  root_cause_evidence: string[]
  runbook_sections: string[]
  github_evidence: string[]
  recommended_remediation: string[]
  resolution: {
    engineer: string
    submitted_at: string
    description: string
  }
  verification: {
    rejections: Array<{
      rejected_by: string
      rejected_at: string
      reason: string
    }>
    verified_by: string | null
    verified_at: string | null
  }
  closure: {
    closed_by: string
    closed_at: string
  }
  timeline: Array<{
    timestamp: string
    label: string
  }>
}

export type PostmortemResponse = {
  slack_posted: boolean
  slack_error?: string | null
}

/** Post a structured postmortem to Slack after an incident is resolved. */
export async function postIncidentPostmortem(payload: PostmortemPayload): Promise<PostmortemResponse> {
  const url = `${requireApiUrl()}/api/incidents/postmortem`
  const res = await fetchBackend(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw await readApiError(res, url)
  return res.json()
}

/** Confirm a GitHub repository exists and is readable by the backend. */
export async function validateGithubRepo(repo: string): Promise<GithubValidateResult> {
  const params = new URLSearchParams({ repo: repo.trim() })
  const url = `${requireApiUrl()}/api/github/validate?${params}`
  const res = await fetchBackend(url)
  if (!res.ok) throw await readApiError(res, url)
  return res.json()
}

/** Confirm a Slack Incoming Webhook URL is active. */
export async function validateSlackWebhook(webhookUrl: string): Promise<SlackValidateResult> {
  const url = `${requireApiUrl()}/api/slack/validate`
  const res = await fetchBackend(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ webhook_url: webhookUrl.trim() }),
  })
  if (!res.ok) throw await readApiError(res, url)
  return res.json()
}

/** Semantic validation — checks required runbook sections via the backend. */
export async function validateRunbookFile(file: File): Promise<RunbookValidateResult> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${requireApiUrl()}/api/runbooks/validate-file`, {
    method: 'POST',
    body: form,
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

/** Index a .md or .pdf runbook file into ChromaDB (server parses PDFs). */
export async function indexRunbookFile(
  file: File,
  meta: { id: string; title: string; projectId?: string },
): Promise<void> {
  const form = new FormData()
  form.append('file', file)
  form.append('runbook_id', meta.id)
  form.append('title', meta.title)
  if (meta.projectId) form.append('project_id', meta.projectId)

  const res = await fetch(`${requireApiUrl()}/api/runbooks/index-file`, {
    method: 'POST',
    body: form,
  })
  if (!res.ok) throw new Error(await parseError(res))
}

/** Index a single runbook for semantic search (plain-text / markdown content). */
export async function indexRunbook(runbook: {
  id: string
  title: string
  content: string
  metadata?: Record<string, string>
}): Promise<void> {
  const res = await fetch(`${requireApiUrl()}/api/runbooks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(runbook),
  })
  if (!res.ok) throw new Error(await parseError(res))
}
