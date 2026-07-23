import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { isEmailVerified } from '../lib/auth'
import {
  acceptProjectInvitation,
  declineProjectInvitation,
  fetchMyPendingInvitations,
  type PendingInvitation,
} from '../lib/projectTeam'
import { isSupabaseConfigured } from '../lib/supabase'
import { useAuth } from './AuthContext'

type PendingInvitationsContextValue = {
  invitations: PendingInvitation[]
  loading: boolean
  actionId: string | null
  refresh: () => Promise<void>
  acceptInvitation: (invitationId: string) => Promise<string | null>
  declineInvitation: (invitationId: string) => Promise<string | null>
}

const PendingInvitationsContext = createContext<PendingInvitationsContextValue | undefined>(undefined)

export function PendingInvitationsProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const [invitations, setInvitations] = useState<PendingInvitation[]>([])
  const [loading, setLoading] = useState(false)
  const [actionId, setActionId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured || !session?.user || !isEmailVerified(session.user)) {
      setInvitations([])
      return
    }

    setLoading(true)
    const nextInvites = await fetchMyPendingInvitations()
    setInvitations(nextInvites)
    setLoading(false)
  }, [session?.user])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const handleFocus = () => {
      void refresh()
    }
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [refresh])

  useEffect(() => {
    if (!session?.user || !isEmailVerified(session.user)) return
    const intervalId = window.setInterval(() => {
      void refresh()
    }, 30000)
    return () => window.clearInterval(intervalId)
  }, [session?.user, refresh])

  const acceptInvitation = useCallback(
    async (invitationId: string) => {
      setActionId(invitationId)
      const { error } = await acceptProjectInvitation(invitationId)
      setActionId(null)
      if (error) return error
      await refresh()
      window.dispatchEvent(new CustomEvent('sentinel-invite-accepted'))
      return null
    },
    [refresh],
  )

  const declineInvitation = useCallback(
    async (invitationId: string) => {
      setActionId(invitationId)
      const { error } = await declineProjectInvitation(invitationId)
      setActionId(null)
      if (error) return error
      await refresh()
      return null
    },
    [refresh],
  )

  const value = useMemo(
    () => ({
      invitations,
      loading,
      actionId,
      refresh,
      acceptInvitation,
      declineInvitation,
    }),
    [invitations, loading, actionId, refresh, acceptInvitation, declineInvitation],
  )

  return (
    <PendingInvitationsContext.Provider value={value}>{children}</PendingInvitationsContext.Provider>
  )
}

export function usePendingInvitations() {
  const context = useContext(PendingInvitationsContext)
  if (!context) {
    throw new Error('usePendingInvitations must be used within PendingInvitationsProvider')
  }
  return context
}
