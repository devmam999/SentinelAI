import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthLayout from '../components/AuthLayout'
import PasswordRequirements from '../components/PasswordRequirements'
import * as s from '../components/authStyles'
import { isPasswordValid } from '../lib/passwordValidation'
import { supabase, isSupabaseConfigured } from '../lib/supabase'

export default function SignUp() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setNotice(null)

    if (!isSupabaseConfigured) {
      setError('Supabase is not configured yet. Add your credentials to .env.local and restart the dev server.')
      return
    }

    if (!isPasswordValid(password)) {
      setError('Please meet all password requirements before signing up.')
      return
    }

    setLoading(true)
    const { data, error } = await supabase.auth.signUp({ email, password })
    setLoading(false)

    if (error) {
      setError(error.message)
      return
    }

    // Email-enumeration protection: signing up with an email that already exists
    // returns a user object with an empty `identities` array (and no error). Detect
    // it so we don't falsely report success and can point the user to log in.
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      setError('An account with this email already exists. Try logging in instead.')
      return
    }

    // If email confirmation is enabled, there's no active session yet.
    if (data.session) {
      navigate('/dashboard')
    } else {
      setNotice('Check your inbox to confirm your email, then log in.')
    }
  }

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
      <form onSubmit={handleSubmit}>
        {error && <div style={s.errorBox}>{error}</div>}
        {notice && <div style={s.successBox}>{notice}</div>}

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
          disabled={loading || !isPasswordValid(password)}
          style={{ ...s.primaryButton, opacity: loading ? 0.6 : 1, cursor: loading ? 'default' : 'pointer' }}
          onMouseEnter={(e) => !loading && (e.currentTarget.style.opacity = '0.85')}
          onMouseLeave={(e) => !loading && (e.currentTarget.style.opacity = '1')}
        >
          {loading ? 'Creating account…' : 'Sign up free'}
        </button>
      </form>
    </AuthLayout>
  )
}
