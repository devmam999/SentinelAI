import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const navItems = [
  { label: 'Features', target: 'features' },
  { label: 'How it works', target: 'how-it-works' },
]

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const navigate = useNavigate()

  const scrollToSection = (target: string) => {
    document.getElementById(target)?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 md:px-12"
      style={{
        height: '64px',
        background: 'rgba(6,10,6,0.85)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5">
        <div
          className="flex items-center justify-center"
          style={{
            width: 28,
            height: 28,
            background: 'var(--primary)',
            borderRadius: 4,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 1L14 4.5V11.5L8 15L2 11.5V4.5L8 1Z" stroke="#060a06" strokeWidth="1.5" fill="none"/>
            <circle cx="8" cy="8" r="2" fill="#060a06"/>
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
      </div>

      {/* Desktop nav */}
      <nav className="hidden md:flex items-center gap-8">
        {navItems.map((item) => (
          <a
            key={item.target}
            href={`#${item.target}`}
            onClick={(e) => {
              e.preventDefault()
              scrollToSection(item.target)
            }}
            style={{
              fontFamily: 'var(--font-inter)',
              fontSize: '0.875rem',
              fontWeight: 500,
              color: 'var(--muted-foreground)',
              textDecoration: 'none',
              transition: 'color 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--foreground)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--muted-foreground)')}
          >
            {item.label}
          </a>
        ))}
      </nav>

      {/* Actions */}
      <div className="hidden md:flex items-center gap-3">
        <button
          onClick={() => navigate('/login')}
          style={{
            fontFamily: 'var(--font-inter)',
            fontSize: '0.875rem',
            fontWeight: 500,
            color: 'var(--muted-foreground)',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: '8px 16px',
            borderRadius: 4,
            transition: 'color 0.15s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--foreground)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--muted-foreground)')}
        >
          Log in
        </button>
        <button
          onClick={() => navigate('/signup')}
          style={{
            fontFamily: 'var(--font-inter)',
            fontSize: '0.875rem',
            fontWeight: 600,
            color: 'var(--primary-foreground)',
            background: 'var(--primary)',
            border: 'none',
            cursor: 'pointer',
            padding: '8px 20px',
            borderRadius: 4,
            transition: 'opacity 0.15s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
        >
          Sign up free
        </button>
      </div>

      {/* Mobile toggle */}
      <button
        className="md:hidden"
        onClick={() => setMobileOpen((v) => !v)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--foreground)', padding: 4 }}
      >
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          {mobileOpen ? (
            <path d="M4 4L18 18M18 4L4 18" stroke="currentColor" strokeWidth="1.8"/>
          ) : (
            <>
              <line x1="3" y1="6" x2="19" y2="6" stroke="currentColor" strokeWidth="1.8"/>
              <line x1="3" y1="11" x2="19" y2="11" stroke="currentColor" strokeWidth="1.8"/>
              <line x1="3" y1="16" x2="19" y2="16" stroke="currentColor" strokeWidth="1.8"/>
            </>
          )}
        </svg>
      </button>

      {/* Mobile menu */}
      {mobileOpen && (
        <div
          className="absolute top-full left-0 right-0 md:hidden flex flex-col"
          style={{
            background: 'var(--card)',
            borderBottom: '1px solid var(--border)',
            padding: '16px 24px 24px',
            gap: 16,
          }}
        >
          {navItems.map((item) => (
            <a
              key={item.target}
              href={`#${item.target}`}
              onClick={(e) => {
                e.preventDefault()
                setMobileOpen(false)
                scrollToSection(item.target)
              }}
              style={{
                fontFamily: 'var(--font-inter)',
                fontSize: '0.95rem',
                color: 'var(--foreground)',
                textDecoration: 'none',
                padding: '8px 0',
                borderBottom: '1px solid var(--border)',
              }}
            >
              {item.label}
            </a>
          ))}
          <div className="flex flex-col gap-3 pt-2">
            <button
              onClick={() => {
                setMobileOpen(false)
                navigate('/login')
              }}
              style={{
                fontFamily: 'var(--font-inter)',
                fontSize: '0.95rem',
                fontWeight: 500,
                color: 'var(--foreground)',
                background: 'transparent',
                border: '1px solid var(--border)',
                cursor: 'pointer',
                padding: '10px 20px',
                borderRadius: 4,
              }}
            >
              Log in
            </button>
            <button
              onClick={() => {
                setMobileOpen(false)
                navigate('/signup')
              }}
              style={{
                fontFamily: 'var(--font-inter)',
                fontSize: '0.95rem',
                fontWeight: 600,
                color: 'var(--primary-foreground)',
                background: 'var(--primary)',
                border: 'none',
                cursor: 'pointer',
                padding: '10px 20px',
                borderRadius: 4,
              }}
            >
              Sign up free
            </button>
          </div>
        </div>
      )}
    </header>
  )
}
