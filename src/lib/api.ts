/**
 * Client for the SentinelAI FastAPI backend.
 *
 * The base URL comes from `VITE_API_URL` (see .env.example). It defaults to the
 * local backend so `npm run dev` + `uvicorn` work together out of the box.
 */

const API_URL =
  ((import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:8000').replace(/\/$/, '')

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

export type IncidentResponse = {
  analysis: IncidentAnalysis
  slack_posted: boolean
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

async function parseError(res: Response): Promise<string> {
  try {
    const body = await res.json()
    if (typeof body?.detail === 'string') return body.detail
  } catch {
    // fall through to status text
  }
  return `Request failed (${res.status} ${res.statusText})`
}

/** Run the full incident pipeline: GitHub + runbooks + Gemini, then post to Slack. */
export async function analyzeIncident(input: AnalyzeInput): Promise<IncidentResponse> {
  const res = await fetch(`${API_URL}/api/incidents/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

/** Semantic validation — checks required runbook sections via the backend. */
export async function validateRunbookFile(file: File): Promise<RunbookValidateResult> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${API_URL}/api/runbooks/validate-file`, {
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

  const res = await fetch(`${API_URL}/api/runbooks/index-file`, {
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
  const res = await fetch(`${API_URL}/api/runbooks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(runbook),
  })
  if (!res.ok) throw new Error(await parseError(res))
}

export { API_URL }
