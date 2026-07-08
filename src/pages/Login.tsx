import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import AuthLayout from '../components/AuthLayout'
import * as s from '../components/authStyles'

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!isSupabaseConfigured) {
      setError('Supabase is not configured yet. Add your credentials to .env.local and restart the dev server.')
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)

    if (error) {
      setError(error.message)
      return
    }
    navigate('/dashboard')
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Log in to your SentinelAI dashboard to keep watch over production."
      footer={
        <>
          Don&apos;t have an account?{' '}
          <Link to="/signup" style={s.authLink}>
            Sign up free
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit}>
        {error && <div style={s.errorBox}>{error}</div>}

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
            placeholder="••••••••"
            required
            style={s.input}
            onFocus={(e) => (e.target.style.borderColor = 'var(--primary)')}
            onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
          />
        </div>

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
