import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { isEmailVerified } from '../lib/auth'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()

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

  if (!isEmailVerified(session.user)) {
    return <Navigate to="/verify-email" replace />
  }

  return <>{children}</>
}
