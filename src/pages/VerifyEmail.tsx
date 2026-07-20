import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import AuthLayout from '../components/AuthLayout'
import * as s from '../components/authStyles'
import { isEmailVerified, resendSignupConfirmation } from '../lib/auth'
import { useAuth } from '../context/AuthContext'

export default function VerifyEmail() {
  const { user, session, loading, signOut } = useAuth()
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  const email = user?.email ?? ''

  const handleResend = async () => {
    if (!email) return
    setError(null)
    setNotice(null)
    setSending(true)
    const { error: resendError } = await resendSignupConfirmation(email)
    setSending(false)
    if (resendError) {
      setError(resendError)
      return
    }
    setNotice('Confirmation email sent. Check your inbox and spam folder.')
  }

  const handleSignOut = async () => {
    await signOut()
  }

  if (loading) {
    return (
      <div
        className="flex min-h-screen items-center justify-center"
        style={{
          background: 'var(--background)',
          color: 'var(--muted-foreground)',
          fontFamily: 'var(--font-jetbrains)',
          fontSize: '0.85rem',
        }}
      >
        Loading…
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  if (isEmailVerified(user)) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <AuthLayout
      title="Verify your email"
      subtitle="You need to confirm your email before using SentinelAI."
      footer={
        <>
          Already verified?{' '}
          <Link to="/login" style={s.authLink} onClick={handleSignOut}>
            Log in
          </Link>
        </>
      }
    >
      {error && <div style={s.errorBox}>{error}</div>}
      {notice && <div style={s.successBox}>{notice}</div>}

      <p
        style={{
          fontFamily: 'var(--font-inter)',
          fontSize: '0.9rem',
          lineHeight: 1.55,
          color: 'var(--muted-foreground)',
          marginBottom: 20,
        }}
      >
        We sent a confirmation link to{' '}
        <strong style={{ color: 'var(--foreground)' }}>{email || 'your email'}</strong>. Click the
        link in that message to activate your account and access the dashboard.
      </p>

      <button
        type="button"
        onClick={handleResend}
        disabled={!email || sending}
        style={{
          ...s.primaryButton,
          marginBottom: 12,
          opacity: !email || sending ? 0.6 : 1,
          cursor: !email || sending ? 'default' : 'pointer',
        }}
      >
        {sending ? 'Sending…' : 'Resend confirmation email'}
      </button>

      <button
        type="button"
        onClick={handleSignOut}
        style={{
          width: '100%',
          fontFamily: 'var(--font-inter)',
          fontWeight: 600,
          fontSize: '0.875rem',
          color: 'var(--foreground)',
          background: 'transparent',
          border: '1px solid var(--border)',
          borderRadius: 5,
          cursor: 'pointer',
          padding: '11px 14px',
        }}
      >
        Sign out
      </button>
    </AuthLayout>
  )
}
