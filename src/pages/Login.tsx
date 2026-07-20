import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { resolveLoginEmail } from '../lib/profile'
import { isEmailVerified, resendSignupConfirmation } from '../lib/auth'
import AuthLayout from '../components/AuthLayout'
import * as s from '../components/authStyles'

export default function Login() {
  const navigate = useNavigate()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [resendEmail, setResendEmail] = useState<string | null>(null)
  const [resending, setResending] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setNotice(null)
    setResendEmail(null)

    if (!isSupabaseConfigured) {
      setError('Supabase is not configured yet. Add your credentials to .env.local and restart the dev server.')
      return
    }

    if (!identifier.trim()) {
      setError('Enter your username or email.')
      return
    }

    setLoading(true)
    const email = await resolveLoginEmail(identifier)
    if (!email) {
      setLoading(false)
      setError('Invalid username or email.')
      return
    }

    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)

    if (signInError) {
      setError('Invalid username/email or password.')
      return
    }

    if (data.user && !isEmailVerified(data.user)) {
      setResendEmail(email)
      await supabase.auth.signOut()
      setError('Verify your email before logging in. Check your inbox for the confirmation link.')
      return
    }

    navigate('/dashboard')
  }

  const handleResend = async () => {
    if (!resendEmail) return
    setResending(true)
    setError(null)
    setNotice(null)
    const { error: resendError } = await resendSignupConfirmation(resendEmail)
    setResending(false)
    if (resendError) {
      setError(resendError)
      return
    }
    setNotice('Confirmation email sent. Check your inbox and spam folder.')
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Log in to your SentinelAI dashboard to keep watch over production."
      footer={
        <>
          Don&apos;t have an account?{' '}
          <Link to="/signup" style={s.authLink}>
            Sign up
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate>
        {error && <div style={s.errorBox}>{error}</div>}
        {notice && <div style={s.successBox}>{notice}</div>}

        <div style={{ marginBottom: 18 }}>
          <label htmlFor="identifier" style={s.label}>
            Username / email
          </label>
          <input
            id="identifier"
            type="text"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="you@company.com or yourname"
            style={s.input}
            onFocus={(e) => (e.target.style.borderColor = 'var(--primary)')}
            onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
          />
        </div>

        <div style={{ marginBottom: resendEmail ? 16 : 24 }}>
          <label htmlFor="password" style={s.label}>
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            style={s.input}
            onFocus={(e) => (e.target.style.borderColor = 'var(--primary)')}
            onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
          />
        </div>

        {resendEmail && (
          <button
            type="button"
            onClick={handleResend}
            disabled={resending}
            style={{
              ...s.primaryButton,
              marginBottom: 16,
              opacity: resending ? 0.6 : 1,
              cursor: resending ? 'default' : 'pointer',
            }}
          >
            {resending ? 'Sending…' : 'Resend confirmation email'}
          </button>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{ ...s.primaryButton, opacity: loading ? 0.6 : 1, cursor: loading ? 'default' : 'pointer' }}
          onMouseEnter={(e) => !loading && (e.currentTarget.style.opacity = '0.85')}
          onMouseLeave={(e) => !loading && (e.currentTarget.style.opacity = '1')}
        >
          {loading ? 'Logging in…' : 'Log in'}
        </button>
      </form>
    </AuthLayout>
  )
}
