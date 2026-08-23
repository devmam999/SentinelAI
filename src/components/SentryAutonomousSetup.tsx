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
  enabled: boolean
  workInProgress: boolean
  oauthState: string | null
  initialStatus: SentryConnectionStatus | null
  onStatusChange: (status: SentryConnectionStatus) => void
  onClearOAuthState: () => void
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
  enabled,
  workInProgress,
  oauthState,
  initialStatus,
  onStatusChange,
  onClearOAuthState,
}: SentryAutonomousSetupProps) {
  const [status, setStatus] = useState<SentryConnectionStatus | null>(initialStatus)
  const [connecting, setConnecting] = useState(false)
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

  const disabled = workInProgress || !enabled
  const showSelection = Boolean(oauthState && enabled && !workInProgress)
  const connected = Boolean(status?.connected)

  useEffect(() => {
    if (!showSelection || !oauthState) return
    let active = true

    async function loadOrganizations() {
      setLoadingOrgs(true)
      setError(null)
      try {
        const orgs = await fetchSentryOrganizations(oauthState!)
        if (!active) return
        setOrganizations(orgs)
        if (orgs.length === 1) setSelectedOrg(orgs[0].slug)
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? formatApiError(err.message) : 'Could not load Sentry organizations.')
        }
      } finally {
        if (active) setLoadingOrgs(false)
      }
    }

    void loadOrganizations()
    return () => {
      active = false
    }
  }, [oauthState, showSelection])

  useEffect(() => {
    if (!showSelection || !oauthState || !selectedOrg) {
      setProjects([])
      setSelectedProject('')
      return
    }
    let active = true

    async function loadProjects() {
      setLoadingProjects(true)
      setError(null)
      try {
        const nextProjects = await fetchSentryProjects(oauthState!, selectedOrg)
        if (!active) return
        setProjects(nextProjects)
        if (nextProjects.length === 1) setSelectedProject(nextProjects[0].slug)
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? formatApiError(err.message) : 'Could not load Sentry projects.')
        }
      } finally {
        if (active) setLoadingProjects(false)
      }
    }

    void loadProjects()
    return () => {
      active = false
    }
  }, [oauthState, selectedOrg, showSelection])

  const handleConnect = async () => {
    if (disabled) return
    if (!projectId || !userId) {
      setError('Create and save the project first, then connect Sentry from edit project.')
      return
    }
    if (!isApiConfigured) {
      setError('Backend URL is not configured.')
      return
    }

    setConnecting(true)
    setError(null)
    try {
      const url = await getSentryAuthorizeUrl(projectId, userId)
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

      {connected && status && (
        <div
          style={{
            marginBottom: 10,
            fontFamily: 'var(--font-jetbrains)',
            fontSize: '0.78rem',
            color: 'var(--primary)',
          }}
        >
          Connected to {status.org_name ?? status.org_slug} / {status.project_name ?? status.project_slug}
        </div>
      )}

      {error && (
        <div style={{ marginBottom: 10, fontFamily: 'var(--font-inter)', fontSize: '0.8rem', color: '#ff7b7b' }}>
          {error}
        </div>
      )}

      {!showSelection && (
        <button
          type="button"
          disabled={disabled || connecting || !projectId}
          onClick={() => void handleConnect()}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            fontFamily: 'var(--font-inter)',
            fontWeight: 600,
            fontSize: '0.84rem',
            color: disabled ? 'var(--muted-foreground)' : '#ffffff',
            background: disabled ? 'rgba(255,255,255,0.06)' : '#6C5FC7',
            border: '1px solid',
            borderColor: disabled ? 'var(--border)' : '#6C5FC7',
            borderRadius: 6,
            padding: '9px 14px',
            cursor: disabled ? 'not-allowed' : connecting ? 'default' : 'pointer',
            opacity: connecting ? 0.7 : 1,
          }}
        >
          <SentryMark size={16} />
          {connecting ? 'Redirecting to Sentry…' : 'Authorize with Sentry'}
        </button>
      )}

      {!projectId && enabled && !workInProgress && (
        <p
          style={{
            marginTop: 8,
            marginBottom: 0,
            fontFamily: 'var(--font-inter)',
            fontSize: '0.78rem',
            color: 'var(--muted-foreground)',
          }}
        >
          Create the project first, then return here to connect Sentry.
        </p>
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
