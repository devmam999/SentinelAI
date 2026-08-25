import { API_URL, isApiConfigured, readApiError } from './api'

export type SentryOrg = {
  slug: string
  name: string
}

export type SentryProject = {
  slug: string
  name: string
}

export type SentryConnectionStatus = {
  connected: boolean
  org_slug: string | null
  org_name: string | null
  project_slug: string | null
  project_name: string | null
  connected_at: string | null
  pendingAttach?: boolean
  attachState?: string | null
}

export async function getSentryAuthorizeUrl(userId: string, projectId?: string | null): Promise<string> {
  if (!isApiConfigured) {
    throw new Error('Backend URL is not configured.')
  }
  const params = new URLSearchParams({ user_id: userId })
  if (projectId) params.set('project_id', projectId)
  const url = `${API_URL}/api/sentry/authorize?${params}`
  const res = await fetch(url)
  if (!res.ok) throw await readApiError(res, url)
  const body = (await res.json()) as { authorization_url: string }
  return body.authorization_url
}

export async function fetchSentryOrganizations(state: string): Promise<SentryOrg[]> {
  if (!isApiConfigured) throw new Error('Backend URL is not configured.')
  const params = new URLSearchParams({ state })
  const url = `${API_URL}/api/sentry/organizations?${params}`
  const res = await fetch(url)
  if (!res.ok) throw await readApiError(res, url)
  return res.json()
}

export async function fetchSentryProjects(state: string, orgSlug: string): Promise<SentryProject[]> {
  if (!isApiConfigured) throw new Error('Backend URL is not configured.')
  const params = new URLSearchParams({ state, org_slug: orgSlug })
  const url = `${API_URL}/api/sentry/projects?${params}`
  const res = await fetch(url)
  if (!res.ok) throw await readApiError(res, url)
  const body = (await res.json()) as { projects: SentryProject[] }
  return body.projects
}

export async function connectSentryProject(input: {
  state: string
  orgSlug: string
  projectSlug: string
}): Promise<SentryConnectionStatus> {
  if (!isApiConfigured) throw new Error('Backend URL is not configured.')
  const url = `${API_URL}/api/sentry/connect`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      state: input.state,
      org_slug: input.orgSlug,
      project_slug: input.projectSlug,
    }),
  })
  if (!res.ok) throw await readApiError(res, url)
  const body = await res.json()
  return {
    connected: true,
    org_slug: body.org_slug,
    org_name: body.org_name,
    project_slug: body.project_slug,
    project_name: body.project_name,
    connected_at: new Date().toISOString(),
    pendingAttach: Boolean(body.pending_attach),
    attachState: body.pending_attach ? input.state : null,
  }
}

export async function attachSentryToProject(input: {
  state: string
  projectId: string
  userId: string
}): Promise<SentryConnectionStatus> {
  if (!isApiConfigured) throw new Error('Backend URL is not configured.')
  const url = `${API_URL}/api/sentry/attach`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      state: input.state,
      project_id: input.projectId,
      user_id: input.userId,
    }),
  })
  if (!res.ok) throw await readApiError(res, url)
  const body = await res.json()
  return {
    connected: true,
    org_slug: body.org_slug,
    org_name: body.org_name,
    project_slug: body.project_slug,
    project_name: body.project_name,
    connected_at: new Date().toISOString(),
  }
}
