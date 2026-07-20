import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthLayout from '../components/AuthLayout'
import PasswordRequirements from '../components/PasswordRequirements'
import * as s from '../components/authStyles'
import { isPasswordValid } from '../lib/passwordValidation'
import { isUsernameAvailable } from '../lib/profile'
import { resendSignupConfirmation } from '../lib/auth'
import { getAuthRedirectUrl } from '../lib/siteUrl'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { isEmailVerified } from '../lib/auth'
import { USERNAME_MAX_LENGTH, validateUsername } from '../lib/usernameValidation'

export default function SignUp() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [usernameError, setUsernameError] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleUsernameChange = (value: string) => {
    setUsername(value)
    if (!value) {
      setUsernameError(null)
      return
    }
    setUsernameError(validateUsername(value))
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setNotice(null)

    if (!isSupabaseConfigured) {
      setError('Supabase is not configured yet. Add your credentials to .env.local and restart the dev server.')
      return
    }

    const usernameValidationError = validateUsername(username)
    if (usernameValidationError) {
      setUsernameError(usernameValidationError)
      setError(usernameValidationError)
      return
    }

    if (!isPasswordValid(password)) {
      setError('Please meet all password requirements before signing up.')
      return
    }

    setLoading(true)
    const available = await isUsernameAvailable(username)
    if (!available) {
      setLoading(false)
      setError('That username is already taken.')
      return
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username: username.trim() },
        emailRedirectTo: getAuthRedirectUrl('/auth/callback'),
      },
    })
    setLoading(false)

    if (error) {
      setError(error.message)
      return
    }

    // Email-enumeration protection: existing email returns empty identities.
    // Resend confirmation in case they signed up but never verified.
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      await resendSignupConfirmation(email)
      setNotice(
        'An account with this email may already exist. If you have not verified your email yet, check your inbox — we sent another confirmation link.',
      )
      return
    }

    if (data.session && data.user && isEmailVerified(data.user)) {
      navigate('/dashboard')
    } else {
      setNotice(
        `Check your inbox to confirm your email. Your account is created only after you click the confirmation link.`,
      )
    }
  }

  const canSubmit = !loading && !usernameError && Boolean(username.trim()) && isPasswordValid(password)

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start resolving incidents in seconds — no credit card required."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" style={s.authLink}>
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate>
        {error && <div style={s.errorBox}>{error}</div>}
        {notice && <div style={s.successBox}>{notice}</div>}

        <div style={{ marginBottom: 18 }}>
          <label htmlFor="username" style={s.label}>
            Username
          </label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => handleUsernameChange(e.target.value)}
            placeholder="yourname"
            maxLength={USERNAME_MAX_LENGTH}
            style={{
              ...s.input,
              borderColor: usernameError ? 'rgba(255, 95, 95, 0.45)' : 'var(--border)',
            }}
            onFocus={(e) => {
              if (!usernameError) e.target.style.borderColor = 'var(--primary)'
            }}
            onBlur={(e) => {
              e.target.style.borderColor = usernameError ? 'rgba(255, 95, 95, 0.45)' : 'var(--border)'
            }}
          />
          {usernameError && (
            <p
              style={{
                marginTop: 8,
                fontFamily: 'var(--font-inter)',
                fontSize: '0.78rem',
                color: '#ff8a8a',
              }}
            >
              {usernameError}
            </p>
          )}
        </div>

        <div style={{ marginBottom: 18 }}>
          <label htmlFor="email" style={s.label}>
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            required
            style={s.input}
            onFocus={(e) => (e.target.style.borderColor = 'var(--primary)')}
            onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
          />
        </div>

        <div style={{ marginBottom: 24 }}>
          <label htmlFor="password" style={s.label}>
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Create a strong password"
            required
            style={s.input}
            onFocus={(e) => (e.target.style.borderColor = 'var(--primary)')}
            onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
          />
          <PasswordRequirements password={password} />
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
          style={{ ...s.primaryButton, padding: '11px 16px', opacity: !canSubmit ? 0.6 : 1, cursor: !canSubmit ? 'default' : 'pointer' }}
          onMouseEnter={(e) => canSubmit && (e.currentTarget.style.opacity = '0.85')}
          onMouseLeave={(e) => canSubmit && (e.currentTarget.style.opacity = '1')}
        >
          {loading ? 'Creating account…' : 'Sign up'}
        </button>
      </form>
    </AuthLayout>
  )
}
