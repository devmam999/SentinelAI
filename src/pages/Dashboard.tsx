import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import DeleteProjectModal from '../components/DeleteProjectModal'
import { useAuth } from '../context/AuthContext'
import { supabase, isSupabaseConfigured } from '../lib/supabase'

type Project = {
  id: string
  name: string
  github_repo: string | null
  slack_webhook: string | null
  runbooks: string | null
  created_at: string
}

export default function Dashboard() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null)

  useEffect(() => {
    let active = true

    async function loadProjects() {
      if (!isSupabaseConfigured) {
        setError('Supabase is not configured yet. Add your credentials to .env.local and restart the dev server.')
        setLoading(false)
        return
      }

      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false })

      if (!active) return
      if (error) setError(error.message)
      else setProjects(data ?? [])
      setLoading(false)
    }

    loadProjects()
    return () => {
      active = false
    }
  }, [])

  const handleSignOut = async () => {
    // Navigate off the protected route BEFORE clearing the session. Otherwise
    // signOut() flips the session to null while we're still on /dashboard, and
    // ProtectedRoute redirects to /login before this navigate runs.
    navigate('/', { replace: true })
    await signOut()
  }

  const handleDeleted = (projectId: string) => {
    setProjects((current) => current.filter((p) => p.id !== projectId))
    setDeleteTarget(null)
  }

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
        <div className="flex items-center gap-2.5">
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
            }}
          >
            SentinelAI
          </span>
        </div>

        <div className="flex items-center gap-4">
          {user?.email && (
            <span
              className="hidden sm:inline"
              style={{
                fontFamily: 'var(--font-jetbrains)',
                fontSize: '0.78rem',
                color: 'var(--muted-foreground)',
              }}
            >
              {user.email}
            </span>
          )}
          <button
            onClick={handleSignOut}
            style={{
              fontFamily: 'var(--font-inter)',
              fontSize: '0.82rem',
              fontWeight: 600,
              color: 'var(--foreground)',
              background: 'transparent',
              border: '1px solid var(--border)',
              cursor: 'pointer',
              padding: '7px 14px',
              borderRadius: 4,
              transition: 'border-color 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--primary)')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="animate-fade-down" style={{ maxWidth: 780, margin: '0 auto', padding: '48px 24px 80px' }}>
        {/* Title */}
        <h1
          style={{
            fontFamily: 'var(--font-inter)',
            fontWeight: 800,
            fontSize: 'clamp(1.6rem, 4vw, 2.1rem)',
            letterSpacing: '-0.03em',
            marginBottom: 8,
          }}
        >
          Dashboard
        </h1>
        <p
          style={{
            fontFamily: 'var(--font-inter)',
            fontSize: '0.95rem',
            color: 'var(--muted-foreground)',
            marginBottom: 40,
          }}
        >
          Welcome back{user?.email ? `, ${user.email.split('@')[0]}` : ''}. Manage the projects Sentinel is watching.
        </p>

        {/* Projects section header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <span
            style={{
              fontFamily: 'var(--font-jetbrains)',
              fontSize: '0.75rem',
              fontWeight: 600,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'var(--primary)',
            }}
          >
            Projects
          </span>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          <button
            onClick={() => navigate('/add-project')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              fontFamily: 'var(--font-inter)',
              fontWeight: 700,
              fontSize: '0.85rem',
              color: 'var(--primary-foreground)',
              background: 'var(--primary)',
              border: 'none',
              cursor: 'pointer',
              padding: '9px 16px',
              borderRadius: 5,
              transition: 'opacity 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            New Project
          </button>
        </div>

        {/* Body: loading / error / empty / list */}
        {loading ? (
          <EmptyLike text="Loading projects…" />
        ) : error ? (
          <div
            style={{
              fontFamily: 'var(--font-inter)',
              fontSize: '0.88rem',
              lineHeight: 1.5,
              color: '#ff8a8a',
              background: 'rgba(255,95,95,0.08)',
              border: '1px solid rgba(255,95,95,0.25)',
              borderRadius: 8,
              padding: '16px 18px',
            }}
          >
            {error}
          </div>
        ) : projects.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              gap: 14,
              background: 'var(--card)',
              border: '1px dashed var(--border)',
              borderRadius: 10,
              padding: '56px 24px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 44,
                height: 44,
                borderRadius: 10,
                color: 'var(--muted-foreground)',
                background: 'var(--muted)',
                border: '1px solid var(--border)',
              }}
            >
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <rect x="3" y="4.5" width="16" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" />
                <path d="M3 8h16" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </div>
            <div
              style={{
                fontFamily: 'var(--font-inter)',
                fontWeight: 700,
                fontSize: '1rem',
                color: 'var(--foreground)',
              }}
            >
              No projects here yet
            </div>
            <div
              style={{
                fontFamily: 'var(--font-inter)',
                fontSize: '0.88rem',
                color: 'var(--muted-foreground)',
                maxWidth: 320,
              }}
            >
              Create your first project to connect a repo, Slack, and runbooks for Sentinel to watch.
            </div>
            <button
              onClick={() => navigate('/add-project')}
              style={{
                fontFamily: 'var(--font-inter)',
                fontWeight: 700,
                fontSize: '0.875rem',
                color: 'var(--primary-foreground)',
                background: 'var(--primary)',
                border: 'none',
                cursor: 'pointer',
                padding: '10px 20px',
                borderRadius: 5,
                marginTop: 4,
                transition: 'opacity 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
            >
              New Project
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onOpen={() => navigate(`/project/${project.id}`)}
                onEdit={() => navigate(`/edit-project/${project.id}`)}
                onDelete={() => setDeleteTarget(project)}
              />
            ))}
          </div>
        )}
      </main>

      {deleteTarget && (
        <DeleteProjectModal
          project={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  )
}

function EmptyLike({ text }: { text: string }) {
  return (
    <div
      style={{
        fontFamily: 'var(--font-jetbrains)',
        fontSize: '0.85rem',
        color: 'var(--muted-foreground)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '28px 20px',
        textAlign: 'center',
      }}
    >
      {text}
    </div>
  )
}

function ProjectCard({
  project,
  onOpen,
  onEdit,
  onDelete,
}: {
  project: Project
  onOpen: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const [hovered, setHovered] = useState(false)

  const integrations = [
    { label: 'GitHub', value: project.github_repo },
    { label: 'Slack', value: project.slack_webhook },
    { label: 'Runbooks', value: project.runbooks },
  ]

  // Keep action-button clicks from also triggering the card's open navigation.
  const stop = (handler: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation()
    handler()
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        background: hovered ? '#0d1a0d' : 'var(--card)',
        border: `1px solid ${hovered ? 'var(--primary)' : 'var(--border)'}`,
        borderRadius: 8,
        padding: '16px 18px',
        cursor: 'pointer',
        transition: 'background 0.15s, border-color 0.15s',
      }}
    >
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 36,
          height: 36,
          flexShrink: 0,
          borderRadius: 7,
          color: 'var(--primary)',
          background: 'rgba(0,214,143,0.09)',
          border: '1px solid rgba(0,214,143,0.2)',
        }}
      >
        <svg width="17" height="17" viewBox="0 0 16 16" fill="none">
          <path d="M8 1L14 4.5V11.5L8 15L2 11.5V4.5L8 1Z" stroke="currentColor" strokeWidth="1.4" fill="none" />
          <circle cx="8" cy="8" r="2" fill="currentColor" />
        </svg>
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: 'var(--font-inter)',
            fontWeight: 600,
            fontSize: '0.95rem',
            color: 'var(--foreground)',
            marginBottom: 6,
          }}
        >
          {project.name}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {integrations.map((integration) => {
            const connected = Boolean(integration.value)
            return (
              <span
                key={integration.label}
                style={{
                  fontFamily: 'var(--font-jetbrains)',
                  fontSize: '0.66rem',
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  color: connected ? 'var(--primary)' : 'var(--muted-foreground)',
                  background: connected ? 'rgba(0,214,143,0.09)' : 'var(--muted)',
                  border: `1px solid ${connected ? 'rgba(0,214,143,0.22)' : 'var(--border)'}`,
                  borderRadius: 4,
                  padding: '2px 7px',
                }}
              >
                {integration.label}
                {connected ? ' ✓' : ' —'}
              </span>
            )
          })}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <IconButton label="Edit project" onClick={stop(onEdit)}>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <path d="M11 2.5l2.5 2.5L6 12.5l-3 .5.5-3L11 2.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
          </svg>
        </IconButton>
        <IconButton label="Delete project" danger onClick={stop(onDelete)}>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <path d="M3 4.5h10M6.5 4V2.5h3V4M4.5 4.5l.5 8h6l.5-8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </IconButton>
        <span style={{ display: 'flex', alignItems: 'center', color: 'var(--muted-foreground)', paddingLeft: 2 }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M6 3.5L10.5 8L6 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </div>
    </div>
  )
}

function IconButton({
  children,
  label,
  onClick,
  danger,
}: {
  children: React.ReactNode
  label: string
  onClick: (e: React.MouseEvent) => void
  danger?: boolean
}) {
  const hoverColor = danger ? '#ff5f5f' : 'var(--primary)'
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 30,
        height: 30,
        color: 'var(--muted-foreground)',
        background: 'transparent',
        border: '1px solid var(--border)',
        borderRadius: 5,
        cursor: 'pointer',
        transition: 'color 0.15s, border-color 0.15s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = hoverColor
        e.currentTarget.style.borderColor = hoverColor
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = 'var(--muted-foreground)'
        e.currentTarget.style.borderColor = 'var(--border)'
      }}
    >
      {children}
    </button>
  )
}
