import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { completeAuthFromUrl } from '../lib/authCallback'
import { isEmailVerified } from '../lib/auth'
import { ensureUserProfile } from '../lib/profile'
import { supabase } from '../lib/supabase'

export default function AuthCallback() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function finishAuth() {
      const { error: callbackError } = await completeAuthFromUrl()
      if (!active) return

      if (callbackError) {
        setError(callbackError)
        return
      }

      const { data, error: sessionError } = await supabase.auth.getSession()
      if (!active) return

      if (sessionError) {
        setError(sessionError.message)
        return
      }

      if (data.session) {
        await ensureUserProfile()
        if (!isEmailVerified(data.session.user)) {
          navigate('/verify-email', { replace: true })
          return
        }
        navigate('/dashboard', { replace: true })
        return
      }

      setError('Could not confirm your account. The link may have expired — try logging in or sign up again.')
    }

    finishAuth()
    return () => {
      active = false
    }
  }, [navigate])

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-6"
      style={{ background: 'var(--background)', color: 'var(--foreground)' }}
    >
      {error ? (
        <div style={{ maxWidth: 420, textAlign: 'center' }}>
          <p
            style={{
              fontFamily: 'var(--font-inter)',
              fontSize: '0.95rem',
              lineHeight: 1.55,
              color: '#ff8a8a',
              marginBottom: 20,
            }}
          >
            {error}
          </p>
          <Link
            to="/login"
            style={{
              fontFamily: 'var(--font-inter)',
              fontWeight: 600,
              color: 'var(--primary)',
              textDecoration: 'none',
            }}
          >
            Go to log in
          </Link>
        </div>
      ) : (
        <p
          style={{
            fontFamily: 'var(--font-jetbrains)',
            fontSize: '0.85rem',
            color: 'var(--muted-foreground)',
          }}
        >
          Confirming your account…
        </p>
      )}
    </div>
  )
}
