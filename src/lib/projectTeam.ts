import type { IncidentAnalysis } from './api'
import { supabase } from './supabase'

export type ProjectRole = 'owner' | 'admin' | 'member'

export type TeamMember = {
  id: string | null
  user_id: string
  role: ProjectRole
  username: string | null
  email: string | null
}

export type ProjectInvitation = {
  id: string
  email: string
  role: 'admin' | 'member'
  status: string
  created_at: string
}

export type ProjectEditRequest = {
  id: string
  project_id: string
  requested_by: string
  name: string
  github_repo: string | null
  slack_webhook: string | null
  runbooks: string | null
  status: 'pending' | 'approved' | 'declined'
  created_at: string
  requester_username?: string | null
}

export type StoredIncident = {
  id: string
  project_id: string
  incident_number: number
  title: string
  status: 'active' | 'resolved'
  alert_description: string | null
  analysis: IncidentAnalysis | null
  slack_posted: boolean
  created_at: string
  resolved_at: string | null
}

export type IncidentFix = {
  id: string
  incident_id: string
  submitted_by: string
  fix_description: string
  status: 'pending' | 'approved' | 'declined'
  reviewed_by: string | null
  reviewed_at: string | null
  review_note: string | null
  created_at: string
  submitter_username?: string | null
  incident_number?: number
  incident_title?: string
}

export type DashboardProject = {
  id: string
  name: string
  github_repo: string | null
  slack_webhook: string | null
  runbooks: string | null
  created_at: string
  my_role: ProjectRole | null
}

export function roleLabel(role: ProjectRole | null | undefined): string {
  if (role === 'owner') return 'Owner'
  if (role === 'admin') return 'Admin'
  if (role === 'member') return 'User'
  return 'User'
}

export function canManageTeam(role: ProjectRole | null): boolean {
  return role === 'owner' || role === 'admin'
}

export function canReviewFixes(role: ProjectRole | null): boolean {
  return role === 'owner' || role === 'admin'
}

export function canAutoResolveIncidents(role: ProjectRole | null): boolean {
  return role === 'owner' || role === 'admin'
}

export async function getMyProjectRole(projectId: string): Promise<ProjectRole | null> {
  const { data, error } = await supabase.rpc('get_my_project_role', { p_project_id: projectId })
  if (error || !data) return null
  return data as ProjectRole
}

export async function fetchMyProjects(): Promise<{ projects: DashboardProject[]; error: string | null }> {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { projects: [], error: 'Not signed in' }

  const { data: owned, error: ownedError } = await supabase
    .from('projects')
    .select('id, name, github_repo, slack_webhook, runbooks, created_at')
    .eq('user_id', user.id)

  if (ownedError) return { projects: [], error: ownedError.message }

  const { data: memberships, error: memberError } = await supabase
    .from('project_members')
    .select('role, projects(id, name, github_repo, slack_webhook, runbooks, created_at, user_id)')
    .eq('user_id', user.id)

  if (memberError) return { projects: [], error: memberError.message }

  const byId = new Map<string, DashboardProject>()

  for (const project of owned ?? []) {
    byId.set(project.id, { ...project, my_role: 'owner' })
  }

  for (const row of memberships ?? []) {
    const project = row.projects as unknown as (Omit<DashboardProject, 'my_role'> & { user_id: string }) | null
    if (!project || byId.has(project.id)) continue
    byId.set(project.id, {
      id: project.id,
      name: project.name,
      github_repo: project.github_repo,
      slack_webhook: project.slack_webhook,
      runbooks: project.runbooks,
      created_at: project.created_at,
      my_role: row.role as ProjectRole,
    })
  }

  return {
    projects: Array.from(byId.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    ),
    error: null,
  }
}

async function profileForUser(userId: string) {
  const { data } = await supabase.from('profiles').select('username, email').eq('id', userId).maybeSingle()
  return { username: data?.username ?? null, email: data?.email ?? null }
}

export async function fetchProjectTeam(projectId: string): Promise<TeamMember[]> {
  const { data: project } = await supabase.from('projects').select('user_id').eq('id', projectId).single()
  const { data: members, error } = await supabase
    .from('project_members')
    .select('id, user_id, role')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })

  if (error) return []

  const team: TeamMember[] = []

  if (project?.user_id) {
    const ownerProfile = await profileForUser(project.user_id)
    team.push({
      id: null,
      user_id: project.user_id,
      role: 'owner',
      ...ownerProfile,
    })
  }

  for (const member of members ?? []) {
    if (member.user_id === project?.user_id) continue
    const profile = await profileForUser(member.user_id)
    team.push({
      id: member.id,
      user_id: member.user_id,
      role: member.role as ProjectRole,
      ...profile,
    })
  }

  return team
}

export async function fetchProjectInvitations(projectId: string): Promise<ProjectInvitation[]> {
  const { data, error } = await supabase
    .from('project_invitations')
    .select('id, email, role, status, created_at')
    .eq('project_id', projectId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  if (error || !data) return []
  return data.map((row) => ({ ...row, role: row.role as ProjectInvitation['role'] }))
}

export async function fetchPendingEditRequests(projectId: string): Promise<ProjectEditRequest[]> {
  const { data, error } = await supabase
    .from('project_edit_requests')
    .select('*')
    .eq('project_id', projectId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  if (error || !data) return []

  return Promise.all(
    data.map(async (row) => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', row.requested_by)
        .maybeSingle()
      return {
        ...row,
        status: row.status as ProjectEditRequest['status'],
        requester_username: profile?.username ?? null,
      }
    }),
  )
}

export type PendingInvitation = ProjectInvitation & { project_id: string; project_name: string }

type PendingInviteRow = {
  id: string
  email: string
  role: string
  status: string
  created_at: string
  project_id: string
  project_name: string
}

function mapPendingInviteRows(data: PendingInviteRow[]): PendingInvitation[] {
  return data.map((row) => ({
    id: row.id,
    email: row.email,
    role: row.role as ProjectInvitation['role'],
    status: row.status,
    created_at: row.created_at,
    project_id: row.project_id,
    project_name: row.project_name ?? 'Project',
  }))
}

async function fetchPendingInvitationsFallback(): Promise<PendingInvitation[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return []

  const emails = new Set<string>()
  if (user.email) emails.add(user.email.trim().toLowerCase())

  const { data: profile } = await supabase.from('profiles').select('email').eq('id', user.id).maybeSingle()
  if (profile?.email) emails.add(profile.email.trim().toLowerCase())

  if (emails.size === 0) return []

  const { data, error } = await supabase
    .from('project_invitations')
    .select('id, email, role, status, created_at, project_id')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  if (error || !data) return []

  return data
    .filter((row) => emails.has(row.email?.trim().toLowerCase() ?? ''))
    .map((row) => ({
      id: row.id,
      email: row.email,
      role: row.role as ProjectInvitation['role'],
      status: row.status,
      created_at: row.created_at,
      project_id: row.project_id,
      project_name: 'Project',
    }))
}

export async function fetchMyPendingInvitations(): Promise<PendingInvitation[]> {
  const { data, error } = await supabase.rpc('get_my_pending_invitations')

  if (!error && Array.isArray(data)) {
    return mapPendingInviteRows(data as PendingInviteRow[])
  }

  return fetchPendingInvitationsFallback()
}

export const INVITE_INVALID_USER_MESSAGE =
  'Invalid user/email. Please ask them to register to SentinelAI'

function normalizeInviteError(message: string | undefined | null): string | null {
  if (!message) return null
  if (
    message === INVITE_INVALID_USER_MESSAGE ||
    message.includes('No user found with that username') ||
    message.includes('Enter a valid email address')
  ) {
    return INVITE_INVALID_USER_MESSAGE
  }
  return message
}

export async function inviteProjectMember(
  projectId: string,
  identifier: string,
  role: ProjectInvitation['role'],
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('invite_project_member', {
    p_project_id: projectId,
    p_email: identifier.trim(),
    p_role: role,
  })
  return { error: normalizeInviteError(error?.message) }
}

export async function acceptProjectInvitation(invitationId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('accept_project_invitation', { p_invitation_id: invitationId })
  return { error: error?.message ?? null }
}

export async function declineProjectInvitation(invitationId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('decline_project_invitation', { p_invitation_id: invitationId })
  return { error: error?.message ?? null }
}

export async function revokeProjectInvitation(invitationId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('revoke_project_invitation', { p_invitation_id: invitationId })
  return { error: error?.message ?? null }
}

export async function removeProjectMember(memberId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('remove_project_member', { p_member_id: memberId })
  return { error: error?.message ?? null }
}

export async function setProjectMemberRole(
  memberId: string,
  role: 'admin' | 'member',
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('set_project_member_role', {
    p_member_id: memberId,
    p_role: role,
  })
  return { error: error?.message ?? null }
}

export async function leaveProject(projectId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('leave_project', { p_project_id: projectId })
  return { error: error?.message ?? null }
}

export async function transferProjectOwnership(
  projectId: string,
  newOwnerUserId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('transfer_project_ownership', {
    p_project_id: projectId,
    p_new_owner_user_id: newOwnerUserId,
  })
  return { error: error?.message ?? null }
}

export async function requestProjectEdit(input: {
  projectId: string
  name: string
  githubRepo: string
  slackWebhook: string
  runbooks: string | null
}): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('request_project_edit', {
    p_project_id: input.projectId,
    p_name: input.name.trim(),
    p_github_repo: input.githubRepo.trim(),
    p_slack_webhook: input.slackWebhook.trim(),
    p_runbooks: input.runbooks,
  })
  return { error: error?.message ?? null }
}

export async function reviewProjectEditRequest(
  requestId: string,
  approve: boolean,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('review_project_edit_request', {
    p_request_id: requestId,
    p_approve: approve,
  })
  return { error: error?.message ?? null }
}

export async function fetchProjectIncidents(projectId: string): Promise<StoredIncident[]> {
  const { data, error } = await supabase
    .from('incidents')
    .select('*')
    .eq('project_id', projectId)
    .order('incident_number', { ascending: false })

  if (error || !data) return []

  return data.map((row) => ({
    ...row,
    analysis: (row.analysis as IncidentAnalysis | null) ?? null,
    status: row.status as StoredIncident['status'],
  }))
}

export async function createProjectIncident(input: {
  projectId: string
  title: string
  alertDescription: string
  analysis: IncidentAnalysis
  slackPosted: boolean
  createdBy: string
}): Promise<{ incident: StoredIncident | null; error: string | null }> {
  const { data, error } = await supabase
    .from('incidents')
    .insert({
      project_id: input.projectId,
      title: input.title,
      alert_description: input.alertDescription,
      analysis: input.analysis,
      slack_posted: input.slackPosted,
      created_by: input.createdBy,
      status: 'active',
    })
    .select('*')
    .single()

  if (error || !data) return { incident: null, error: error?.message ?? 'Could not save incident' }

  return {
    incident: {
      ...data,
      analysis: (data.analysis as IncidentAnalysis | null) ?? null,
      status: data.status as StoredIncident['status'],
    },
    error: null,
  }
}

export async function fetchIncidentFixes(projectId: string): Promise<IncidentFix[]> {
  const { data: incidents, error: incidentError } = await supabase
    .from('incidents')
    .select('id, incident_number, title')
    .eq('project_id', projectId)

  if (incidentError || !incidents?.length) return []

  const incidentIds = incidents.map((i) => i.id)
  const incidentMap = new Map(incidents.map((i) => [i.id, i]))

  const { data: fixes, error } = await supabase
    .from('incident_fixes')
    .select('*')
    .in('incident_id', incidentIds)
    .order('created_at', { ascending: false })

  if (error || !fixes) return []

  return Promise.all(
    fixes.map(async (fix) => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', fix.submitted_by)
        .maybeSingle()

      const incident = incidentMap.get(fix.incident_id)
      return {
        ...fix,
        status: fix.status as IncidentFix['status'],
        submitter_username: profile?.username ?? null,
        incident_number: incident?.incident_number,
        incident_title: incident?.title,
      }
    }),
  )
}

export async function submitIncidentFix(
  incidentId: string,
  fixDescription: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('submit_incident_fix', {
    p_incident_id: incidentId,
    p_fix_description: fixDescription.trim(),
  })
  return { error: error?.message ?? null }
}

export async function reviewIncidentFix(
  fixId: string,
  approve: boolean,
  reviewNote?: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('review_incident_fix', {
    p_fix_id: fixId,
    p_approve: approve,
    p_review_note: reviewNote?.trim() || null,
  })
  return { error: error?.message ?? null }
}
