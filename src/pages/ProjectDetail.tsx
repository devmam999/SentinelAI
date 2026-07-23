import { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { analyzeIncident, indexRunbookFile } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import ProjectTeamModal from '../components/ProjectTeamModal'
import LeaveProjectModal from '../components/LeaveProjectModal'
import ProjectEditRequestsSection from '../components/ProjectEditRequestsSection'
import ResolveIncidentModal from '../components/ResolveIncidentModal'
import {
  canAutoResolveIncidents,
  canManageTeam,
  canReviewFixes,
  createProjectIncident,
  fetchIncidentFixes,
  fetchPendingEditRequests,
  fetchProjectIncidents,
  fetchProjectInvitations,
  fetchProjectTeam,
  getMyProjectRole,
  reviewIncidentFix,
  roleLabel,
  submitIncidentFix,
  type IncidentFix,
  type ProjectEditRequest,
  type ProjectInvitation,
  type ProjectRole,
  type StoredIncident,
  type TeamMember,
} from '../lib/projectTeam'

type Project = {
  id: string
  name: string
  github_repo: string | null
  slack_webhook: string | null
  runbooks: string | null
  created_at: string
}

type IncidentWithFix = StoredIncident & {
  pendingFix?: IncidentFix | null
  latestFix?: IncidentFix | null
}

function parseRunbooks(runbooks: string | null): string[] {
  if (!runbooks) return []
  return runbooks
    .split(/\n+/)
    .map((r) => r.trim())
    .filter(Boolean)
}

function baseName(path: string): string {
  return path.split('/').pop() || path
}

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user, profile } = useAuth()

  const [project, setProject] = useState<Project | null>(null)
  const [myRole, setMyRole] = useState<ProjectRole | null>(null)
  const [team, setTeam] = useState<TeamMember[]>([])
  const [invitations, setInvitations] = useState<ProjectInvitation[]>([])
  const [editRequests, setEditRequests] = useState<ProjectEditRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [incidents, setIncidents] = useState<IncidentWithFix[]>([])
  const [alertText, setAlertText] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)
  const [resolveTarget, setResolveTarget] = useState<IncidentWithFix | null>(null)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const [reviewingFixId, setReviewingFixId] = useState<string | null>(null)
  const [teamModalOpen, setTeamModalOpen] = useState(false)
  const [leaveModalOpen, setLeaveModalOpen] = useState(false)

  const isOwner = myRole === 'owner'
  const canReview = canReviewFixes(myRole)
  const canManage = canManageTeam(myRole)
  const canAutoResolve = canAutoResolveIncidents(myRole)

  const reloadTeam = useCallback(async () => {
    if (!id) return
    const [{ data }, nextTeam, nextInvitations, nextEditRequests] = await Promise.all([
      supabase.from('projects').select('*').eq('id', id).single(),
      fetchProjectTeam(id),
      fetchProjectInvitations(id),
      fetchPendingEditRequests(id),
    ])
    if (data) setProject(data)
    setTeam(nextTeam)
    setInvitations(nextInvitations)
    setEditRequests(nextEditRequests)
    const role = await getMyProjectRole(id)
    setMyRole(role)
  }, [id])

  const reloadIncidents = useCallback(async () => {
    if (!id) return
    const [nextIncidents, fixes] = await Promise.all([fetchProjectIncidents(id), fetchIncidentFixes(id)])
    const fixesByIncident = new Map<string, IncidentFix[]>()
    for (const fix of fixes) {
      const list = fixesByIncident.get(fix.incident_id) ?? []
      list.push(fix)
      fixesByIncident.set(fix.incident_id, list)
    }

    setIncidents(
      nextIncidents.map((incident) => {
        const incidentFixes = fixesByIncident.get(incident.id) ?? []
        const pendingFix = incidentFixes.find((fix) => fix.status === 'pending') ?? null
        const latestFix = incidentFixes[0] ?? null
        return { ...incident, pendingFix, latestFix }
      }),
    )
  }, [id])

  useEffect(() => {
    if (!id) return
    let active = true

    async function loadProject() {
      if (!isSupabaseConfigured) {
        setError('Supabase is not configured yet. Add your credentials to .env.local and restart the dev server.')
        setLoading(false)
        return
      }

      const [{ data, error: projectError }, role] = await Promise.all([
        supabase.from('projects').select('*').eq('id', id).single(),
        getMyProjectRole(id!),
      ])

      if (!active) return

      if (projectError) {
        setError(projectError.message)
        setLoading(false)
        return
      }

      if (!role) {
        setError('You do not have access to this project.')
        setLoading(false)
        return
      }

      setProject(data)
      setMyRole(role)
      await Promise.all([reloadTeam(), reloadIncidents()])
      if (active) setLoading(false)
    }

    loadProject()
    return () => {
      active = false
    }
  }, [id, reloadIncidents, reloadTeam])

  const activeIncidents = incidents.filter((i) => i.status === 'active')
  const recentIncidents = incidents.filter((i) => i.status === 'resolved')
  const pendingFixes = incidents
    .map((incident) => incident.pendingFix)
    .filter((fix): fix is IncidentFix => Boolean(fix))
  const isHealthy = activeIncidents.length === 0

  const indexRunbooksBestEffort = async () => {
    if (!project) return
    const runbookPaths = parseRunbooks(project.runbooks).filter((p) => /\.(md|pdf)$/i.test(p))
    await Promise.all(
      runbookPaths.map(async (path) => {
        try {
          const { data } = await supabase.storage.from('runbooks').createSignedUrl(path, 60)
          if (!data?.signedUrl) return
          const blob = await fetch(data.signedUrl).then((r) => r.blob())
          const file = new File([blob], baseName(path), {
            type: blob.type || (/\.pdf$/i.test(path) ? 'application/pdf' : 'text/markdown'),
          })
          await indexRunbookFile(file, {
            id: `${project.id}/${path}`,
            title: baseName(path),
            projectId: project.id,
          })
        } catch {
          /* best-effort */
        }
      }),
    )
  }

  const triggerAnalysis = async () => {
    if (!project || !user) return
    if (!project.github_repo) {
      setAnalyzeError('Add a GitHub repository to this project before analyzing.')
      return
    }
    setAnalyzing(true)
    setAnalyzeError(null)
    try {
      await indexRunbooksBestEffort()
      const alertDescription = alertText.trim() || 'A production alert fired.'
      const result = await analyzeIncident({
        github_repo: project.github_repo,
        description: alertDescription,
        slack_webhook_url: project.slack_webhook,
        post_to_slack: Boolean(project.slack_webhook),
      })
      const { analysis } = result
      const { incident, error: saveError } = await createProjectIncident({
        projectId: project.id,
        title: analysis.likely_cause || analysis.most_relevant_commit || 'Production incident',
        alertDescription,
        analysis,
        slackPosted: result.slack_posted,
        createdBy: user.id,
      })
      if (saveError || !incident) {
        setAnalyzeError(saveError ?? 'Could not save incident.')
        return
      }
      await reloadIncidents()
      setAlertText('')
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : 'Analysis failed. Is the backend running?')
    } finally {
      setAnalyzing(false)
    }
  }

  const handleSubmitFix = async (fixDescription: string) => {
    if (!resolveTarget) return
    const { error: submitError } = await submitIncidentFix(resolveTarget.id, fixDescription)
    if (submitError) throw new Error(submitError)
    setResolveTarget(null)
    await reloadIncidents()
  }

  const handleReviewFix = async (fixId: string, approve: boolean) => {
    setReviewError(null)
    setReviewingFixId(fixId)
    const { error: reviewErr } = await reviewIncidentFix(fixId, approve)
    setReviewingFixId(null)
    if (reviewErr) {
      setReviewError(reviewErr)
      return
    }
    await reloadIncidents()
  }

  const openRunbook = async (path: string) => {
    const { data, error: signedUrlError } = await supabase.storage.from('runbooks').createSignedUrl(path, 60)
    if (signedUrlError || !data?.signedUrl) {
      window.alert(`Could not open runbook: ${signedUrlError?.message ?? 'unknown error'}`)
      return
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  const runbookFiles = parseRunbooks(project?.runbooks ?? null)

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)', color: 'var(--foreground)' }}>
      <header
        className="flex items-center justify-between px-6 md:px-10"
        style={{
          height: 64,
          borderBottom: '1px solid var(--border)',
          background: 'rgba(6,10,6,0.85)',
          backdropFilter: 'blur(12px)',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <Link to="/dashboard" className="flex items-center gap-2.5" style={{ textDecoration: 'none' }}>
          <div
            className="flex items-center justify-center"
            style={{ width: 28, height: 28, background: 'var(--primary)', borderRadius: 4 }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 1L14 4.5V11.5L8 15L2 11.5V4.5L8 1Z" stroke="#060a06" strokeWidth="1.5" fill="none" />
              <circle cx="8" cy="8" r="2" fill="#060a06" />
            </svg>
          </div>
          <span
            style={{
              fontFamily: 'var(--font-inter)',
              fontWeight: 700,
              fontSize: '1.05rem',
              letterSpacing: '-0.02em',
              color: 'var(--foreground)',
            }}
          >
            SentinelAI
          </span>
        </Link>

        {!loading && !error && project && user && myRole && (canManage || myRole === 'member') && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              onClick={() => setTeamModalOpen(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                fontFamily: 'var(--font-inter)',
                fontWeight: 700,
                fontSize: '0.85rem',
                color: canManage ? 'var(--primary-foreground)' : 'var(--foreground)',
                background: canManage ? 'var(--primary)' : 'transparent',
                border: canManage ? 'none' : '1px solid var(--border)',
                borderRadius: 5,
                cursor: 'pointer',
                padding: '9px 16px',
                transition: 'opacity 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.88')}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
            >
              {canManage ? (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <circle cx="5.5" cy="4.75" r="2.25" stroke="currentColor" strokeWidth="1.35" />
                  <path
                    d="M1.5 12.75c0-2.21 1.79-4 4-4s4 1.79 4 4"
                    stroke="currentColor"
                    strokeWidth="1.35"
                    strokeLinecap="round"
                  />
                  <path
                    d="M11.25 5.25v3.5M9.5 7h3.5"
                    stroke="currentColor"
                    strokeWidth="1.35"
                    strokeLinecap="round"
                  />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <circle cx="8" cy="5.25" r="2.35" stroke="currentColor" strokeWidth="1.35" />
                  <path
                    d="M3.25 13.25c0-2.63 2.13-4.75 4.75-4.75s4.75 2.12 4.75 4.75"
                    stroke="currentColor"
                    strokeWidth="1.35"
                    strokeLinecap="round"
                  />
                </svg>
              )}
              {canManage ? 'Invite' : 'Team'}
            </button>

            {myRole !== 'owner' && (
              <button
                type="button"
                onClick={() => setLeaveModalOpen(true)}
                style={{
                  fontFamily: 'var(--font-inter)',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  color: '#ff8a8a',
                  background: 'transparent',
                  border: '1px solid rgba(255,95,95,0.25)',
                  borderRadius: 5,
                  cursor: 'pointer',
                  padding: '9px 16px',
                  transition: 'opacity 0.15s, border-color 0.15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255,95,95,0.45)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255,95,95,0.25)'
                }}
              >
                Leave project
              </button>
            )}
          </div>
        )}
      </header>

      <main className="animate-fade-down" style={{ maxWidth: 820, margin: '0 auto', padding: '40px 24px 80px' }}>
        <Link
          to="/dashboard"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontFamily: 'var(--font-inter)',
            fontSize: '0.85rem',
            color: 'var(--muted-foreground)',
            textDecoration: 'none',
            marginBottom: 22,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M10 3.5L5.5 8L10 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back to Projects
        </Link>

        {loading ? (
          <div style={loadingStyle}>Loading project…</div>
        ) : error ? (
          <div style={errorStyle}>{error}</div>
        ) : !project ? (
          <div style={loadingStyle}>Project not found.</div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-4" style={{ marginBottom: 28 }}>
              <h1
                style={{
                  fontFamily: 'var(--font-inter)',
                  fontWeight: 800,
                  fontSize: 'clamp(1.6rem, 4vw, 2.2rem)',
                  letterSpacing: '-0.03em',
                }}
              >
                {project.name}
              </h1>
              <StatusPill healthy={isHealthy} />
              {myRole && (
                <span
                  style={{
                    fontFamily: 'var(--font-jetbrains)',
                    fontSize: '0.68rem',
                    fontWeight: 600,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: isOwner || myRole === 'admin' ? 'var(--primary)' : 'var(--muted-foreground)',
                    background: isOwner || myRole === 'admin' ? 'rgba(0,214,143,0.09)' : 'var(--muted)',
                    border: `1px solid ${isOwner || myRole === 'admin' ? 'rgba(0,214,143,0.22)' : 'var(--border)'}`,
                    borderRadius: 4,
                    padding: '3px 8px',
                  }}
                >
                  {roleLabel(myRole)}
                </span>
              )}
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: 12,
                marginBottom: 36,
              }}
            >
              <StatCard label="GitHub" value={project.github_repo ? '✓ Connected' : 'Not connected'} good={Boolean(project.github_repo)} />
              <StatCard label="Slack" value={project.slack_webhook ? '✓ Connected' : 'Not connected'} good={Boolean(project.slack_webhook)} />
              <StatCard
                label="Runbooks"
                value={runbookFiles.length > 0 ? `${runbookFiles.length} Uploaded` : 'None uploaded'}
                good={runbookFiles.length > 0}
              />
              <StatCard label="Alert Source" value="Manual trigger" good />
            </div>

            {isOwner && editRequests.length > 0 && (
              <ProjectEditRequestsSection requests={editRequests} onReviewed={reloadTeam} />
            )}

            {canReview && pendingFixes.length > 0 && (
              <>
                <SectionHeading>Pending fix reviews</SectionHeading>
                {reviewError && <div style={{ ...errorStyle, marginBottom: 12 }}>{reviewError}</div>}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
                  {pendingFixes.map((fix) => (
                    <div
                      key={fix.id}
                      style={{
                        background: 'var(--card)',
                        border: '1px solid rgba(240,192,64,0.25)',
                        borderRadius: 10,
                        padding: '16px 18px',
                      }}
                    >
                      <div
                        style={{
                          fontFamily: 'var(--font-inter)',
                          fontSize: '0.92rem',
                          fontWeight: 700,
                          marginBottom: 6,
                        }}
                      >
                        #{fix.incident_number} {fix.incident_title}
                      </div>
                      <div
                        style={{
                          fontFamily: 'var(--font-jetbrains)',
                          fontSize: '0.72rem',
                          color: 'var(--muted-foreground)',
                          marginBottom: 10,
                        }}
                      >
                        Submitted by {fix.submitter_username || 'teammate'}
                      </div>
                      <p
                        style={{
                          fontFamily: 'var(--font-inter)',
                          fontSize: '0.88rem',
                          lineHeight: 1.55,
                          color: 'var(--foreground)',
                          marginBottom: 14,
                        }}
                      >
                        {fix.fix_description}
                      </p>
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() => handleReviewFix(fix.id, true)}
                          disabled={reviewingFixId === fix.id}
                          style={{ ...simulateButtonStyle, opacity: reviewingFixId === fix.id ? 0.6 : 1 }}
                        >
                          Accept fix
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReviewFix(fix.id, false)}
                          disabled={reviewingFixId === fix.id}
                          style={{ ...resolveButtonStyle, opacity: reviewingFixId === fix.id ? 0.6 : 1 }}
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            <SectionHeading>Current Incidents</SectionHeading>
            <div style={{ marginBottom: 16 }}>
              {activeIncidents.length === 0 ? (
                <div style={emptyRowStyle}>No active incidents.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {activeIncidents.map((incident) => (
                    <ActiveIncidentCard
                      key={incident.id}
                      incident={incident}
                      isAdmin={canAutoResolve}
                      onResolve={() => setResolveTarget(incident)}
                    />
                  ))}
                </div>
              )}
            </div>

            {analyzeError && <div style={{ ...errorStyle, marginBottom: 12 }}>{analyzeError}</div>}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
              <input
                type="text"
                value={alertText}
                onChange={(e) => setAlertText(e.target.value)}
                placeholder="Describe the alert (optional) — e.g. 5xx spike on API gateway"
                disabled={analyzing}
                style={{
                  flex: 1,
                  minWidth: 240,
                  fontFamily: 'var(--font-inter)',
                  fontSize: '0.875rem',
                  color: 'var(--foreground)',
                  background: 'var(--background)',
                  border: '1px solid var(--border)',
                  borderRadius: 5,
                  padding: '10px 12px',
                  outline: 'none',
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--primary)')}
                onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !analyzing) triggerAnalysis()
                }}
              />
              <button
                onClick={triggerAnalysis}
                disabled={analyzing}
                style={{
                  ...simulateButtonStyle,
                  opacity: analyzing ? 0.6 : 1,
                  cursor: analyzing ? 'default' : 'pointer',
                }}
                onMouseEnter={(e) => !analyzing && (e.currentTarget.style.opacity = '0.85')}
                onMouseLeave={(e) => !analyzing && (e.currentTarget.style.opacity = '1')}
              >
                {analyzing ? 'Analyzing…' : 'Analyze Incident'}
              </button>
            </div>

            <SectionHeading style={{ marginTop: 40 }}>Recent Incidents</SectionHeading>
            {recentIncidents.length === 0 ? (
              <div style={emptyRowStyle}>No recent incidents.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {recentIncidents.map((incident) => (
                  <div key={incident.id} style={incidentRowStyle}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <span style={monoMuted}>#{incident.incident_number}</span>
                      <span
                        style={{
                          fontFamily: 'var(--font-inter)',
                          fontSize: '0.9rem',
                          color: 'var(--foreground)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {incident.title}
                      </span>
                    </span>
                    <StatusTag kind="resolved">Resolved</StatusTag>
                  </div>
                ))}
              </div>
            )}

            <SectionHeading style={{ marginTop: 40 }}>Project Overview</SectionHeading>
            <div
              style={{
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: '4px 20px',
              }}
            >
              <OverviewRow label="GitHub Repository">
                <LinkOrText value={project.github_repo} />
              </OverviewRow>
              <OverviewRow label="Slack webhook">
                <LinkOrText value={project.slack_webhook} />
              </OverviewRow>
              <OverviewRow label="Runbooks" last>
                {runbookFiles.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
                    {runbookFiles.map((path, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => openRunbook(path)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 8,
                          fontFamily: 'var(--font-jetbrains)',
                          fontSize: '0.84rem',
                          color: 'var(--primary)',
                          background: 'transparent',
                          border: 'none',
                          padding: 0,
                          cursor: 'pointer',
                          textDecoration: 'none',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
                        onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
                      >
                        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                          <path d="M4 2h5l3 3v9H4z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                          <path d="M9 2v3h3" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                        </svg>
                        {baseName(path)}
                      </button>
                    ))}
                  </div>
                ) : (
                  <span style={{ fontFamily: 'var(--font-inter)', fontSize: '0.85rem', fontStyle: 'italic', color: 'var(--muted-foreground)' }}>
                    None
                  </span>
                )}
              </OverviewRow>
            </div>

            {isOwner && (
              <button
                onClick={() => navigate(`/edit-project/${project.id}`)}
                style={{ ...resolveButtonStyle, marginTop: 24 }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--primary)')}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
              >
                Edit project
              </button>
            )}

            {myRole === 'admin' && (
              <button
                onClick={() => navigate(`/edit-project/${project.id}`)}
                style={{ ...resolveButtonStyle, marginTop: 24 }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--primary)')}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
              >
                Request project edit
              </button>
            )}
          </>
        )}
      </main>

      {teamModalOpen && user && myRole && project && (
        <ProjectTeamModal
          projectId={project.id}
          myRole={myRole}
          team={team}
          invitations={invitations}
          currentUserId={user.id}
          onClose={() => setTeamModalOpen(false)}
          onChanged={reloadTeam}
        />
      )}

      {leaveModalOpen && project && (
        <LeaveProjectModal
          projectId={project.id}
          projectName={project.name}
          username={profile?.username ?? null}
          onClose={() => setLeaveModalOpen(false)}
          onLeft={() => navigate('/dashboard')}
        />
      )}

      {resolveTarget && (
        <ResolveIncidentModal
          incidentTitle={resolveTarget.title}
          canAutoResolve={canAutoResolve}
          onClose={() => setResolveTarget(null)}
          onSubmit={handleSubmitFix}
        />
      )}
    </div>
  )
}

function StatusPill({ healthy }: { healthy: boolean }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        fontFamily: 'var(--font-inter)',
        fontSize: '0.82rem',
        fontWeight: 600,
        color: healthy ? 'var(--primary)' : '#f0c040',
        background: healthy ? 'rgba(0,214,143,0.09)' : 'rgba(240,192,64,0.1)',
        border: `1px solid ${healthy ? 'rgba(0,214,143,0.25)' : 'rgba(240,192,64,0.3)'}`,
        borderRadius: 20,
        padding: '5px 12px',
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: healthy ? 'var(--primary)' : '#f0c040',
          boxShadow: `0 0 6px ${healthy ? 'var(--primary)' : '#f0c040'}`,
        }}
      />
      {healthy ? 'Healthy' : 'Incident in progress'}
    </span>
  )
}

function StatCard({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px' }}>
      <div
        style={{
          fontFamily: 'var(--font-jetbrains)',
          fontSize: '0.66rem',
          fontWeight: 600,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--muted-foreground)',
          marginBottom: 7,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-inter)',
          fontSize: '0.9rem',
          fontWeight: 600,
          color: good ? 'var(--primary)' : 'var(--muted-foreground)',
        }}
      >
        {value}
      </div>
    </div>
  )
}

function ActiveIncidentCard({
  incident,
  isAdmin,
  onResolve,
}: {
  incident: IncidentWithFix
  isAdmin: boolean
  onResolve: () => void
}) {
  const a = incident.analysis
  const hasPendingFix = incident.pendingFix?.status === 'pending'

  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={monoMuted}>#{incident.incident_number}</span>
          <span style={{ fontFamily: 'var(--font-inter)', fontSize: '0.95rem', fontWeight: 600, color: 'var(--foreground)' }}>
            {incident.title}
          </span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {hasPendingFix ? (
            <StatusTag kind="active">Awaiting approval</StatusTag>
          ) : (
            <StatusTag kind="active">Active</StatusTag>
          )}
          {!hasPendingFix && (
            <button
              onClick={onResolve}
              style={resolveButtonStyle}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--primary)')}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
            >
              Resolve issue
            </button>
          )}
        </span>
      </div>

      {hasPendingFix && incident.pendingFix && (
        <div
          style={{
            marginTop: 14,
            padding: '12px 14px',
            borderRadius: 8,
            background: 'rgba(240,192,64,0.08)',
            border: '1px solid rgba(240,192,64,0.22)',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-jetbrains)',
              fontSize: '0.68rem',
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#f0c040',
              marginBottom: 6,
            }}
          >
            {isAdmin ? 'Fix waiting for your review' : 'Fix submitted — waiting for admin approval'}
          </div>
          <p
            style={{
              fontFamily: 'var(--font-inter)',
              fontSize: '0.86rem',
              lineHeight: 1.55,
              color: 'var(--foreground)',
              margin: 0,
            }}
          >
            {incident.pendingFix.fix_description}
          </p>
        </div>
      )}

      {a && (
        <div style={{ marginTop: 14, display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
            <AnalysisField label="Likely Cause" value={a.likely_cause} accent />
            <AnalysisField label="Confidence" value={`${a.confidence}%`} accent />
          </div>
          <AnalysisField label="Most Relevant Commit" value={a.most_relevant_commit} mono />
          <AnalysisField label="Affected Services" value={a.affected_services.join(', ') || '—'} />
          <AnalysisField label="Suggested Runbook" value={a.suggested_runbook} accent />
          <div>
            <FieldLabel>Next Steps</FieldLabel>
            {a.next_steps.length > 0 ? (
              <ol style={{ margin: '6px 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {a.next_steps.map((step, i) => (
                  <li key={i} style={{ fontFamily: 'var(--font-inter)', fontSize: '0.875rem', color: 'var(--foreground)' }}>
                    {step}
                  </li>
                ))}
              </ol>
            ) : (
              <div style={{ fontFamily: 'var(--font-inter)', fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>—</div>
            )}
          </div>
          {incident.slack_posted && (
            <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '0.72rem', color: 'var(--primary)' }}>
              ✓ Posted to Slack
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: 'var(--font-jetbrains)',
        fontSize: '0.64rem',
        fontWeight: 600,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: 'var(--muted-foreground)',
      }}
    >
      {children}
    </div>
  )
}

function AnalysisField({ label, value, accent, mono }: { label: string; value: string; accent?: boolean; mono?: boolean }) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div
        style={{
          marginTop: 4,
          fontFamily: mono ? 'var(--font-jetbrains)' : 'var(--font-inter)',
          fontSize: '0.9rem',
          fontWeight: accent ? 700 : 500,
          color: accent ? 'var(--primary)' : 'var(--foreground)',
          wordBreak: 'break-word',
        }}
      >
        {value}
      </div>
    </div>
  )
}

function SectionHeading({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, ...style }}>
      <span
        style={{
          fontFamily: 'var(--font-inter)',
          fontWeight: 700,
          fontSize: '1.05rem',
          letterSpacing: '-0.02em',
          color: 'var(--foreground)',
        }}
      >
        {children}
      </span>
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
    </div>
  )
}

function OverviewRow({ label, children, last }: { label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 12,
        padding: '16px 0',
        borderBottom: last ? 'none' : '1px solid var(--border)',
      }}
    >
      <div
        style={{
          width: 160,
          flexShrink: 0,
          fontFamily: 'var(--font-inter)',
          fontSize: '0.85rem',
          fontWeight: 600,
          color: 'var(--muted-foreground)',
        }}
      >
        {label}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  )
}

function LinkOrText({ value }: { value: string | null }) {
  if (!value) {
    return (
      <span style={{ fontFamily: 'var(--font-inter)', fontSize: '0.85rem', fontStyle: 'italic', color: 'var(--muted-foreground)' }}>
        Not connected
      </span>
    )
  }
  const isUrl = /^https?:\/\//i.test(value)
  const style: React.CSSProperties = {
    fontFamily: 'var(--font-jetbrains)',
    fontSize: '0.84rem',
    color: isUrl ? 'var(--primary)' : 'var(--foreground)',
    wordBreak: 'break-all',
    textDecoration: 'none',
  }
  return isUrl ? (
    <a href={value} target="_blank" rel="noreferrer" style={style}>
      {value}
    </a>
  ) : (
    <span style={style}>{value}</span>
  )
}

function StatusTag({ kind, children }: { kind: 'active' | 'resolved'; children: React.ReactNode }) {
  const isActive = kind === 'active'
  return (
    <span
      style={{
        fontFamily: 'var(--font-jetbrains)',
        fontSize: '0.68rem',
        fontWeight: 600,
        letterSpacing: '0.05em',
        color: isActive ? '#f0c040' : 'var(--primary)',
        background: isActive ? 'rgba(240,192,64,0.1)' : 'rgba(0,214,143,0.09)',
        border: `1px solid ${isActive ? 'rgba(240,192,64,0.3)' : 'rgba(0,214,143,0.22)'}`,
        borderRadius: 4,
        padding: '2px 8px',
      }}
    >
      {children}
    </span>
  )
}

const loadingStyle: React.CSSProperties = {
  fontFamily: 'var(--font-jetbrains)',
  fontSize: '0.85rem',
  color: 'var(--muted-foreground)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '28px 20px',
  textAlign: 'center',
}

const errorStyle: React.CSSProperties = {
  fontFamily: 'var(--font-inter)',
  fontSize: '0.88rem',
  color: '#ff8a8a',
  background: 'rgba(255,95,95,0.08)',
  border: '1px solid rgba(255,95,95,0.25)',
  borderRadius: 8,
  padding: '16px 18px',
}

const emptyRowStyle: React.CSSProperties = {
  fontFamily: 'var(--font-inter)',
  fontSize: '0.9rem',
  color: 'var(--muted-foreground)',
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '18px 18px',
}

const incidentRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '13px 16px',
}

const monoMuted: React.CSSProperties = {
  fontFamily: 'var(--font-jetbrains)',
  fontSize: '0.8rem',
  color: 'var(--muted-foreground)',
}

const simulateButtonStyle: React.CSSProperties = {
  fontFamily: 'var(--font-inter)',
  fontWeight: 700,
  fontSize: '0.875rem',
  color: 'var(--primary-foreground)',
  background: 'var(--primary)',
  border: 'none',
  cursor: 'pointer',
  padding: '10px 20px',
  borderRadius: 5,
  transition: 'opacity 0.15s',
}

const resolveButtonStyle: React.CSSProperties = {
  fontFamily: 'var(--font-inter)',
  fontWeight: 600,
  fontSize: '0.82rem',
  color: 'var(--foreground)',
  background: 'transparent',
  border: '1px solid var(--border)',
  cursor: 'pointer',
  padding: '7px 14px',
  borderRadius: 5,
  transition: 'border-color 0.15s',
}
