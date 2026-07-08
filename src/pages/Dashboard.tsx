import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'

type ProjectItem = {
  label: string
  description: string
  icon: React.ReactNode
  accent?: boolean
}

const projectItems: ProjectItem[] = [
  {
    label: 'Add Project',
    description: 'Create a new service for Sentinel to watch',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: 'GitHub Repository',
    description: 'Connect the repo to trace the likely bad commit',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path
          d="M8 1.5a6.5 6.5 0 00-2.05 12.67c.32.06.44-.14.44-.31v-1.2c-1.8.39-2.19-.77-2.19-.77-.29-.75-.72-.95-.72-.95-.59-.4.04-.4.04-.4.65.05 1 .67 1 .67.58 1 1.52.71 1.89.54.06-.42.23-.71.41-.87-1.44-.16-2.95-.72-2.95-3.2 0-.71.25-1.28.67-1.74-.07-.16-.29-.82.06-1.72 0 0 .55-.17 1.8.67a6.2 6.2 0 013.28 0c1.25-.84 1.8-.67 1.8-.67.35.9.13 1.56.06 1.72.42.46.67 1.03.67 1.74 0 2.49-1.51 3.04-2.96 3.2.24.2.44.59.44 1.2v1.78c0 .17.12.38.45.31A6.5 6.5 0 008 1.5z"
          stroke="currentColor"
          strokeWidth="1.1"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    label: 'Slack Webhook',
    description: 'Choose the channel for incident briefs',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path
          d="M3 6a1.5 1.5 0 013 0v2a1.5 1.5 0 01-3 0V6zM10 8a1.5 1.5 0 013 0v2a1.5 1.5 0 01-3 0V8zM6 3a1.5 1.5 0 010 3H4a1.5 1.5 0 010-3h2zM8 10a1.5 1.5 0 010 3v-1.5"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    label: 'Runbooks',
    description: 'Upload the fixes Sentinel should reach for',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M3.5 2.5h6l3 3v8h-9z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M6 8h4M6 10.5h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: 'Trigger Test Incident',
    description: 'Fire a mock alert and watch Sentinel respond',
    accent: true,
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M8 2v6M8 11v.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    ),
  },
]

export default function Dashboard() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    // Navigate off the protected route BEFORE clearing the session. Otherwise
    // signOut() flips the session to null while we're still on /dashboard, and
    // ProtectedRoute redirects to /login before this navigate runs.
    navigate('/', { replace: true })
    await signOut()
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
        {/* Title row */}
        <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
          <h1
            style={{
              fontFamily: 'var(--font-inter)',
              fontWeight: 800,
              fontSize: 'clamp(1.6rem, 4vw, 2.1rem)',
              letterSpacing: '-0.03em',
            }}
          >
            Dashboard
          </h1>
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" style={{ color: 'var(--muted-foreground)' }}>
            <rect x="7" y="7" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" />
            <path d="M4 13V6a2 2 0 012-2h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
        <p
          style={{
            fontFamily: 'var(--font-inter)',
            fontSize: '0.95rem',
            color: 'var(--muted-foreground)',
            marginBottom: 40,
          }}
        >
          Welcome back{user?.email ? `, ${user.email.split('@')[0]}` : ''}. Wire up a project so Sentinel can start
          watching.
        </p>

        {/* Projects section */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
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
        </div>

        {/* Tree */}
        <div>
          {projectItems.map((item, i) => (
            <ProjectRow key={item.label} item={item} isLast={i === projectItems.length - 1} />
          ))}
        </div>
      </main>
    </div>
  )
}

function ProjectRow({ item, isLast }: { item: ProjectItem; isLast: boolean }) {
  const accentColor = item.accent ? 'var(--accent)' : 'var(--primary)'

  return (
    <div style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}>
      {/* Tree connector */}
      <div
        style={{
          width: 28,
          flexShrink: 0,
          position: 'relative',
          fontFamily: 'var(--font-jetbrains)',
          color: 'var(--muted-foreground)',
        }}
      >
        {/* vertical line */}
        <div
          style={{
            position: 'absolute',
            left: 6,
            top: 0,
            bottom: isLast ? '50%' : 0,
            width: 1,
            background: 'var(--border)',
          }}
        />
        {/* horizontal line */}
        <div
          style={{
            position: 'absolute',
            left: 6,
            top: '50%',
            width: 16,
            height: 1,
            background: 'var(--border)',
          }}
        />
      </div>

      {/* Card */}
      <button
        className="group"
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          textAlign: 'left',
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          padding: '14px 16px',
          margin: '6px 0',
          cursor: 'pointer',
          transition: 'border-color 0.15s, background 0.15s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = accentColor
          e.currentTarget.style.background = '#0d1a0d'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'var(--border)'
          e.currentTarget.style.background = 'var(--card)'
        }}
      >
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 34,
            height: 34,
            flexShrink: 0,
            borderRadius: 6,
            color: accentColor,
            background: item.accent ? 'rgba(0,255,136,0.1)' : 'rgba(0,214,143,0.09)',
            border: `1px solid ${item.accent ? 'rgba(0,255,136,0.25)' : 'rgba(0,214,143,0.2)'}`,
          }}
        >
          {item.icon}
        </span>
        <span style={{ flex: 1 }}>
          <span
            style={{
              display: 'block',
              fontFamily: 'var(--font-inter)',
              fontWeight: 600,
              fontSize: '0.925rem',
              color: 'var(--foreground)',
            }}
          >
            {item.label}
          </span>
          <span
            style={{
              display: 'block',
              fontFamily: 'var(--font-inter)',
              fontSize: '0.8rem',
              color: 'var(--muted-foreground)',
              marginTop: 2,
            }}
          >
            {item.description}
          </span>
        </span>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ color: 'var(--muted-foreground)', flexShrink: 0 }}>
          <path d="M6 3.5L10.5 8L6 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  )
}
