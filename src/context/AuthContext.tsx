import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { isEmailVerified } from '../lib/auth'
import { fetchUserProfile, ensureUserProfile, type UserProfile } from '../lib/profile'
import { supabase } from '../lib/supabase'

const UNVERIFIED_SESSION_PATHS = new Set(['/verify-email', '/auth/callback', '/signup'])

function shouldKeepUnverifiedSession(): boolean {
  return UNVERIFIED_SESSION_PATHS.has(window.location.pathname)
}

type AuthContextValue = {
  session: Session | null
  user: User | null
  profile: UserProfile | null
  loading: boolean
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshProfile = useCallback(async () => {
    if (!session?.user) {
      setProfile(null)
      return
    }

    const nextProfile = await fetchUserProfile(session.user.id)
    setProfile(nextProfile)
  }, [session?.user])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const nextSession = data.session
      if (nextSession?.user && !isEmailVerified(nextSession.user) && !shouldKeepUnverifiedSession()) {
        await supabase.auth.signOut()
        setSession(null)
      } else {
        setSession(nextSession)
      }
      setLoading(false)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (newSession?.user && !isEmailVerified(newSession.user) && !shouldKeepUnverifiedSession()) {
        await supabase.auth.signOut()
        setSession(null)
        return
      }

      setSession(newSession)
      if (event === 'SIGNED_IN' && newSession?.user && isEmailVerified(newSession.user)) {
        await ensureUserProfile()
      }
    })

    return () => subscription.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    let active = true

    async function loadProfile() {
      if (!session?.user) {
        setProfile(null)
        return
      }

      const nextProfile = await fetchUserProfile(session.user.id)
      if (active) setProfile(nextProfile)
    }

    loadProfile()
    return () => {
      active = false
    }
  }, [session?.user?.id])

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    profile,
    loading,
    signOut: async () => {
      setProfile(null)
      await supabase.auth.signOut()
    },
    refreshProfile,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
