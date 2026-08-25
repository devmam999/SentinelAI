import { useEffect, useState } from 'react'
import {
  connectSentryProject,
  fetchSentryOrganizations,
  fetchSentryProjects,
  getSentryAuthorizeUrl,
  type SentryConnectionStatus,
} from '../lib/sentry'
import { isApiConfigured } from '../lib/api'
import { formatApiError } from '../lib/formatApiError'

type SentryAutonomousSetupProps = {
  projectId: string | null
  userId: string | null
  active: boolean
  oauthState: string | null
  initialStatus: SentryConnectionStatus | null
  onStatusChange: (status: SentryConnectionStatus) => void
  onClearOAuthState: () => void
  onChangeConnection?: () => void
}

function SentryMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 72 66" fill="none" aria-hidden="true">
      <path
        d="M29 2c-2 8-8 14-16 16 6 1 11 5 14 11-7-4-15-4-22 0 3 8 10 14 19 15-2 8-8 14-16 16 6 1 11 5 14 11 7-4 15-4 22 0-3-8-10-14-19-15 2-8 8-14 16-16-6-1-11-5-14-11 7 4 15 4 22 0-3-8-10-14-19-15z"
        fill="#362D59"
      />
      <path
        d="M29 2c-2 8-8 14-16 16 6 1 11 5 14 11-7-4-15-4-22 0 3 8 10 14 19 15-2 8-8 14-16 16 6 1 11 5 14 11 7-4 15-4 22 0-3-8-10-14-19-15 2-8 8-14 16-16-6-1-11-5-14-11 7 4 15 4 22 0-3-8-10-14-19-15z"
        fill="#6C5FC7"
        transform="translate(8 6)"
      />
    </svg>
  )
}

export default function SentryAutonomousSetup({
  projectId,
  userId,
  active,
  oauthState,
  initialStatus,
  onStatusChange,
  onClearOAuthState,
  onChangeConnection,
}: SentryAutonomousSetupProps) {
  const [status, setStatus] = useState<SentryConnectionStatus | null>(initialStatus)
  const [connecting, setConnecting] = useState(false)
  const [connectionHovered, setConnectionHovered] = useState(false)
  const [loadingOrgs, setLoadingOrgs] = useState(false)
  const [loadingProjects, setLoadingProjects] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [organizations, setOrganizations] = useState<Array<{ slug: string; name: string }>>([])
  const [projects, setProjects] = useState<Array<{ slug: string; name: string }>>([])
  const [selectedOrg, setSelectedOrg] = useState('')
  const [selectedProject, setSelectedProject] = useState('')

  useEffect(() => {
    setStatus(initialStatus)
  }, [initialStatus])

  const showSelection = Boolean(oauthState && active)
  const connected = Boolean(status?.connected)

  useEffect(() => {
    if (!showSelection || !oauthState) return
    let alive = true

    async function loadOrganizations() {
      setLoadingOrgs(true)
      setError(null)
      try {
        const orgs = await fetchSentryOrganizations(oauthState!)
        if (!alive) return
        setOrganizations(orgs)
        if (orgs.length === 1) setSelectedOrg(orgs[0].slug)
      } catch (err) {
        if (alive) {
          setError(err instanceof Error ? formatApiError(err.message) : 'Could not load Sentry organizations.')
        }
      } finally {
        if (alive) setLoadingOrgs(false)
      }
    }

    void loadOrganizations()
    return () => {
      alive = false
    }
  }, [oauthState, showSelection])

  useEffect(() => {
    if (!showSelection || !oauthState || !selectedOrg) {
      setProjects([])
      setSelectedProject('')
      return
    }
    let alive = true

    async function loadProjects() {
      setLoadingProjects(true)
      setError(null)
      try {
        const nextProjects = await fetchSentryProjects(oauthState!, selectedOrg)
        if (!alive) return
        setProjects(nextProjects)
        if (nextProjects.length === 1) setSelectedProject(nextProjects[0].slug)
      } catch (err) {
        if (alive) {
          setError(err instanceof Error ? formatApiError(err.message) : 'Could not load Sentry projects.')
        }
      } finally {
        if (alive) setLoadingProjects(false)
      }
    }

    void loadProjects()
    return () => {
      alive = false
    }
  }, [oauthState, selectedOrg, showSelection])

  const handleConnect = async () => {
    if (!active) return
    if (!userId) {
      setError('You must be signed in to connect Sentry.')
      return
    }
    if (!isApiConfigured) {
      setError('Backend URL is not configured.')
      return
    }

    setConnecting(true)
    setError(null)
    try {
      const url = await getSentryAuthorizeUrl(userId, projectId)
      window.location.href = url
    } catch (err) {
      setError(err instanceof Error ? formatApiError(err.message) : 'Could not start Sentry authorization.')
      setConnecting(false)
    }
  }

  const handleSaveSelection = async () => {
    if (!oauthState || !selectedOrg || !selectedProject) return
    setSaving(true)
    setError(null)
    try {
      const nextStatus = await connectSentryProject({
        state: oauthState,
        orgSlug: selectedOrg,
        projectSlug: selectedProject,
      })
      setStatus(nextStatus)
      onStatusChange(nextStatus)
      onClearOAuthState()
    } catch (err) {
      setError(err instanceof Error ? formatApiError(err.message) : 'Could not save Sentry connection.')
    } finally {
      setSaving(false)
    }
  }

  const handleChangeProject = async () => {
    setError(null)
    setSelectedOrg('')
    setSelectedProject('')
    onChangeConnection?.()
    setStatus(null)
    await handleConnect()
  }

  if (!active) return null

  return (
    <div
      style={{
        marginTop: 12,
        padding: '12px 14px',
        borderRadius: 8,
        border: '1px solid var(--border)',
        background: 'rgba(255,255,255,0.02)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <SentryMark />
        <div>
          <div
            style={{
              fontFamily: 'var(--font-inter)',
              fontSize: '0.86rem',
              fontWeight: 600,
              color: 'var(--foreground)',
            }}
          >
            Connect Sentry
          </div>
          <div
            style={{
              fontFamily: 'var(--font-inter)',
              fontSize: '0.78rem',
              color: 'var(--muted-foreground)',
              lineHeight: 1.45,
            }}
          >
            Authorize SentinelAI in Sentry, then choose your organization and project for automatic issue detection.
          </div>
        </div>
      </div>

      {connected && status && !showSelection && (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 10,
            maxWidth: '100%',
          }}
          onMouseEnter={() => setConnectionHovered(true)}
          onMouseLeave={() => setConnectionHovered(false)}
        >
          <span
            style={{
              fontFamily: 'var(--font-jetbrains)',
              fontSize: '0.78rem',
              color: 'var(--primary)',
            }}
          >
            Connected to {status.org_name ?? status.org_slug} / {status.project_name ?? status.project_slug}
          </span>
          {(connectionHovered || connecting) && (
            <button
              type="button"
              disabled={connecting}
              onClick={() => void handleChangeProject()}
              style={{
                fontFamily: 'var(--font-inter)',
                fontSize: '0.72rem',
                fontWeight: 600,
                color: 'var(--muted-foreground)',
                background: 'transparent',
                border: 'none',
                padding: 0,
                cursor: connecting ? 'default' : 'pointer',
                textDecoration: 'underline',
                textUnderlineOffset: 3,
                whiteSpace: 'nowrap',
                opacity: connecting ? 0.7 : 1,
              }}
              onMouseEnter={(e) => {
                if (!connecting) e.currentTarget.style.color = 'var(--foreground)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--muted-foreground)'
              }}
            >
              {connecting ? 'Redirecting…' : 'Change project'}
            </button>
          )}
        </div>
      )}

      {error && (
        <div style={{ marginBottom: 10, fontFamily: 'var(--font-inter)', fontSize: '0.8rem', color: '#ff7b7b' }}>
          {error}
        </div>
      )}

      {!showSelection && !connected && (
        <button
          type="button"
          disabled={connecting}
          onClick={() => void handleConnect()}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            fontFamily: 'var(--font-inter)',
            fontWeight: 600,
            fontSize: '0.84rem',
            color: '#ffffff',
            background: '#6C5FC7',
            border: '1px solid #6C5FC7',
            borderRadius: 6,
            padding: '9px 14px',
            cursor: connecting ? 'default' : 'pointer',
            opacity: connecting ? 0.7 : 1,
          }}
        >
          <SentryMark size={16} />
          {connecting ? 'Redirecting to Sentry…' : 'Authorize with Sentry'}
        </button>
      )}

      {showSelection && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontFamily: 'var(--font-inter)', fontSize: '0.78rem', color: 'var(--muted-foreground)' }}>
              Sentry organization
            </span>
            <select
              value={selectedOrg}
              disabled={loadingOrgs || organizations.length === 0}
              onChange={(e) => setSelectedOrg(e.target.value)}
              style={{
                fontFamily: 'var(--font-inter)',
                fontSize: '0.86rem',
                background: 'var(--background)',
                color: 'var(--foreground)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '10px 12px',
              }}
            >
              <option value="">{loadingOrgs ? 'Loading organizations…' : 'Select organization'}</option>
              {organizations.map((org) => (
                <option key={org.slug} value={org.slug}>
                  {org.name}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontFamily: 'var(--font-inter)', fontSize: '0.78rem', color: 'var(--muted-foreground)' }}>
              Sentry project
            </span>
            <select
              value={selectedProject}
              disabled={!selectedOrg || loadingProjects || projects.length === 0}
              onChange={(e) => setSelectedProject(e.target.value)}
              style={{
                fontFamily: 'var(--font-inter)',
                fontSize: '0.86rem',
                background: 'var(--background)',
                color: 'var(--foreground)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '10px 12px',
              }}
            >
              <option value="">
                {!selectedOrg
                  ? 'Select an organization first'
                  : loadingProjects
                    ? 'Loading projects…'
                    : 'Select project'}
              </option>
              {projects.map((project) => (
                <option key={project.slug} value={project.slug}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            disabled={saving || !selectedOrg || !selectedProject}
            onClick={() => void handleSaveSelection()}
            style={{
              alignSelf: 'flex-start',
              fontFamily: 'var(--font-inter)',
              fontWeight: 600,
              fontSize: '0.84rem',
              color: '#060a06',
              background: 'var(--primary)',
              border: 'none',
              borderRadius: 6,
              padding: '9px 14px',
              cursor: saving ? 'default' : 'pointer',
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Saving…' : 'Save Sentry connection'}
          </button>
        </div>
      )}
    </div>
  )
}
