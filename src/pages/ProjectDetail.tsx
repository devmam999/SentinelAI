import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { analyzeIncident, indexRunbookFile, type IncidentAnalysis } from '../lib/api'

type Project = {
  id: string
  name: string
  github_repo: string | null
  slack_webhook: string | null
  runbooks: string | null
  created_at: string
}

type Incident = {
  id: number
  title: string
  status: 'active' | 'resolved'
  analysis?: IncidentAnalysis
  slackPosted?: boolean
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

  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [incidents, setIncidents] = useState<Incident[]>([])
  const [nextId, setNextId] = useState(101)
  const [alertText, setAlertText] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let active = true

    async function loadProject() {
      if (!isSupabaseConfigured) {
        setError('Supabase is not configured yet. Add your credentials to .env.local and restart the dev server.')
        setLoading(false)
        return
      }
      const { data, error } = await supabase.from('projects').select('*').eq('id', id).single()
      if (!active) return
      if (error) setError(error.message)
      else setProject(data)
      setLoading(false)
    }

    loadProject()
    return () => {
      active = false
    }
  }, [id])

  const activeIncidents = incidents.filter((i) => i.status === 'active')
  const recentIncidents = incidents.filter((i) => i.status === 'resolved')
  const isHealthy = activeIncidents.length === 0

  // Best-effort: push this project's runbooks (.md and .pdf) into ChromaDB so
  // Sentinel's semantic search has content to match. PDFs are parsed server-side.
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
    if (!project) return
    if (!project.github_repo) {
      setAnalyzeError('Add a GitHub repository to this project before analyzing.')
      return
    }
    setAnalyzing(true)
    setAnalyzeError(null)
    try {
      await indexRunbooksBestEffort()
      const result = await analyzeIncident({
        github_repo: project.github_repo,
        description: alertText.trim() || 'A production alert fired.',
        slack_webhook_url: project.slack_webhook,
        post_to_slack: Boolean(project.slack_webhook),
      })
      const { analysis } = result
      setIncidents((current) => [
        {
          id: nextId,
          title: analysis.likely_cause || analysis.most_relevant_commit || 'Production incident',
          status: 'active',
          analysis,
          slackPosted: result.slack_posted,
        },
        ...current,
      ])
      setNextId((n) => n + 1)
      setAlertText('')
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : 'Analysis failed. Is the backend running?')
    } finally {
      setAnalyzing(false)
    }
  }

  const resolveIncident = (incidentId: number) => {
    setIncidents((current) => current.map((i) => (i.id === incidentId ? { ...i, status: 'resolved' } : i)))
  }

  // Runbooks are private storage paths — mint a short-lived signed URL to open one.
  const openRunbook = async (path: string) => {
    const { data, error } = await supabase.storage.from('runbooks').createSignedUrl(path, 60)
    if (error || !data?.signedUrl) {
      window.alert(`Could not open runbook: ${error?.message ?? 'unknown error'}`)
      return
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  const runbookFiles = parseRunbooks(project?.runbooks ?? null)

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)', color: 'var(--foreground)' }}>
      {/* Top bar */}
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
            {/* Title + status */}
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
            </div>

            {/* Integration status grid */}
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
              <StatCard label="Alert Source" value="AI Analysis" good />
            </div>

            {/* Current incidents */}
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
                      onResolve={() => resolveIncident(incident.id)}
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

            {/* Recent incidents */}
            <SectionHeading style={{ marginTop: 40 }}>Recent Incidents</SectionHeading>
            {recentIncidents.length === 0 ? (
              <div style={emptyRowStyle}>No recent incidents.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {recentIncidents.map((incident) => (
                  <div key={incident.id} style={incidentRowStyle}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={monoMuted}>#{incident.id}</span>
                      <span style={{ fontFamily: 'var(--font-inter)', fontSize: '0.9rem', color: 'var(--foreground)' }}>
                        {incident.title}
                      </span>
                    </span>
                    <StatusTag kind="resolved">Resolved</StatusTag>
                  </div>
                ))}
              </div>
            )}

            {/* Project overview */}
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

            {/* Edit shortcut */}
            <button
              onClick={() => navigate(`/edit-project/${project.id}`)}
              style={{ ...resolveButtonStyle, marginTop: 24 }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--primary)')}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
            >
              Edit project
            </button>
          </>
        )}
      </main>
    </div>
  )
}

/* ── small presentational helpers ─────────────────────────────────────────── */

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

function ActiveIncidentCard({ incident, onResolve }: { incident: Incident; onResolve: () => void }) {
  const a = incident.analysis
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={monoMuted}>#{incident.id}</span>
          <span style={{ fontFamily: 'var(--font-inter)', fontSize: '0.95rem', fontWeight: 600, color: 'var(--foreground)' }}>
            {incident.title}
          </span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <StatusTag kind="active">Active</StatusTag>
          <button
            onClick={onResolve}
            style={resolveButtonStyle}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--primary)')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
          >
            Resolve
          </button>
        </span>
      </div>

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
          {incident.slackPosted && (
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

/* ── shared inline styles ─────────────────────────────────────────────────── */

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
