import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

export default function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle: string
  children: ReactNode
  footer: ReactNode
}) {
  return (
    <div
      className="relative flex min-h-screen flex-col items-center justify-center px-6"
      style={{ background: 'var(--background)', color: 'var(--foreground)', overflow: 'hidden' }}
    >
      {/* Grid background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(rgba(0,214,143,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,214,143,0.04) 1px, transparent 1px)
          `,
          backgroundSize: '48px 48px',
        }}
      />
      {/* Radial glow */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: '35%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 640,
          height: 640,
          background: 'radial-gradient(ellipse at center, rgba(0,214,143,0.08) 0%, transparent 70%)',
          borderRadius: '50%',
        }}
      />

      <div className="animate-fade-down relative z-10 w-full" style={{ maxWidth: 400 }}>
        {/* Logo */}
        <Link to="/" className="flex items-center justify-center gap-2.5" style={{ textDecoration: 'none', marginBottom: 28 }}>
          <div
            className="flex items-center justify-center"
            style={{ width: 30, height: 30, background: 'var(--primary)', borderRadius: 5 }}
          >
            <svg width="17" height="17" viewBox="0 0 16 16" fill="none">
              <path d="M8 1L14 4.5V11.5L8 15L2 11.5V4.5L8 1Z" stroke="#060a06" strokeWidth="1.5" fill="none" />
              <circle cx="8" cy="8" r="2" fill="#060a06" />
            </svg>
          </div>
          <span
            style={{
              fontFamily: 'var(--font-inter)',
              fontWeight: 700,
              fontSize: '1.15rem',
              letterSpacing: '-0.02em',
              color: 'var(--foreground)',
            }}
          >
            SentinelAI
          </span>
        </Link>

        {/* Card */}
        <div
          style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '32px 28px',
            boxShadow: '0 0 60px rgba(0,214,143,0.06)',
          }}
        >
          <h1
            style={{
              fontFamily: 'var(--font-inter)',
              fontWeight: 800,
              fontSize: '1.5rem',
              letterSpacing: '-0.03em',
              color: 'var(--foreground)',
              marginBottom: 6,
            }}
          >
            {title}
          </h1>
          <p
            style={{
              fontFamily: 'var(--font-inter)',
              fontSize: '0.9rem',
              lineHeight: 1.55,
              color: 'var(--muted-foreground)',
              marginBottom: 26,
            }}
          >
            {subtitle}
          </p>

          {children}
        </div>

        <div
          style={{
            fontFamily: 'var(--font-inter)',
            fontSize: '0.875rem',
            color: 'var(--muted-foreground)',
            textAlign: 'center',
            marginTop: 22,
          }}
        >
          {footer}
        </div>
      </div>
    </div>
  )
}
