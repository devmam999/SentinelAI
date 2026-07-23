import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import NotificationBell from './NotificationBell'

const headerButtonStyle = {
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
} as const

export default function AppHeader() {
  const navigate = useNavigate()
  const { profile, signOut } = useAuth()

  const handleSignOut = async () => {
    navigate('/', { replace: true })
    await signOut()
  }

  return (
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
      <button
        type="button"
        onClick={() => navigate('/dashboard')}
        className="flex items-center gap-2.5"
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      >
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
      </button>

      <div className="flex items-center gap-3">
        {profile?.username && (
          <span
            className="hidden sm:inline"
            style={{
              fontFamily: 'var(--font-jetbrains)',
              fontSize: '0.78rem',
              color: 'var(--muted-foreground)',
            }}
          >
            {profile.username}
          </span>
        )}
        <NotificationBell />
        <button
          type="button"
          onClick={() => navigate('/settings')}
          style={headerButtonStyle}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--primary)')}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
        >
          Settings
        </button>
        <button
          type="button"
          onClick={handleSignOut}
          style={{
            ...headerButtonStyle,
            color: '#ff8a8a',
            borderColor: 'rgba(255, 95, 95, 0.35)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#ff5f5f'
            e.currentTarget.style.color = '#ff5f5f'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'rgba(255, 95, 95, 0.35)'
            e.currentTarget.style.color = '#ff8a8a'
          }}
        >
          Sign out
        </button>
      </div>
    </header>
  )
}
