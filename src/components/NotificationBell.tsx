import { useEffect, useRef, useState } from 'react'
import { usePendingInvitations } from '../context/PendingInvitationsContext'
import { roleLabel } from '../lib/projectTeam'

const iconButtonStyle = {
  position: 'relative' as const,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 36,
  height: 36,
  color: 'var(--foreground)',
  background: 'transparent',
  border: '1px solid var(--border)',
  borderRadius: 4,
  cursor: 'pointer',
  transition: 'border-color 0.15s',
}

export default function NotificationBell() {
  const { invitations, loading, actionId, acceptInvitation, declineInvitation } = usePendingInvitations()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const handleClickOutside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    window.addEventListener('mousedown', handleClickOutside)
    return () => window.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const handleAccept = async (invitationId: string) => {
    setError(null)
    const nextError = await acceptInvitation(invitationId)
    if (nextError) {
      setError(nextError)
      return
    }
    if (invitations.length <= 1) setOpen(false)
  }

  const handleDecline = async (invitationId: string) => {
    setError(null)
    const nextError = await declineInvitation(invitationId)
    if (nextError) {
      setError(nextError)
      return
    }
    if (invitations.length <= 1) setOpen(false)
  }

  const count = invitations.length

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        type="button"
        aria-label={count > 0 ? `${count} pending invitations` : 'Notifications'}
        aria-expanded={open}
        onClick={() => {
          setError(null)
          setOpen((current) => !current)
        }}
        style={iconButtonStyle}
        onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--primary)')}
        onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M8 1.75c-1.66 0-3 1.2-3 2.68v2.07c0 .58-.22 1.14-.62 1.56l-.71.74a.75.75 0 0 0 .54 1.28h6.58a.75.75 0 0 0 .54-1.28l-.71-.74a2.4 2.4 0 0 1-.62-1.56V4.43C11 2.95 9.66 1.75 8 1.75Z"
            stroke="currentColor"
            strokeWidth="1.35"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M6.75 12.75a1.25 1.25 0 0 0 2.5 0"
            stroke="currentColor"
            strokeWidth="1.35"
            strokeLinecap="round"
          />
        </svg>
        {count > 0 && (
          <span
            style={{
              position: 'absolute',
              top: 6,
              right: 6,
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: 'var(--primary)',
              border: '1px solid var(--background)',
            }}
          />
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: 320,
            maxWidth: 'min(320px, calc(100vw - 32px))',
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            boxShadow: '0 16px 40px rgba(0, 0, 0, 0.35)',
            zIndex: 20,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '12px 14px',
              borderBottom: '1px solid var(--border)',
              fontFamily: 'var(--font-inter)',
              fontWeight: 700,
              fontSize: '0.88rem',
            }}
          >
            Notifications
          </div>

          {error && (
            <div
              style={{
                margin: '10px 12px 0',
                padding: '8px 10px',
                borderRadius: 6,
                background: 'rgba(255, 95, 95, 0.08)',
                border: '1px solid rgba(255, 95, 95, 0.25)',
                color: '#ff8a8a',
                fontFamily: 'var(--font-inter)',
                fontSize: '0.78rem',
                lineHeight: 1.45,
              }}
            >
              {error}
            </div>
          )}

          {loading && count === 0 ? (
            <div
              style={{
                padding: '18px 14px',
                fontFamily: 'var(--font-inter)',
                fontSize: '0.82rem',
                color: 'var(--muted-foreground)',
              }}
            >
              Loading…
            </div>
          ) : count === 0 ? (
            <div
              style={{
                padding: '18px 14px',
                fontFamily: 'var(--font-inter)',
                fontSize: '0.82rem',
                color: 'var(--muted-foreground)',
              }}
            >
              No new notifications.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12 }}>
              {invitations.map((invite) => (
                <div
                  key={invite.id}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    padding: '12px',
                    background: 'rgba(0, 214, 143, 0.03)',
                  }}
                >
                  <div
                    style={{
                      fontFamily: 'var(--font-inter)',
                      fontWeight: 600,
                      fontSize: '0.86rem',
                      marginBottom: 4,
                    }}
                  >
                    Join {invite.project_name}
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--font-inter)',
                      fontSize: '0.78rem',
                      color: 'var(--muted-foreground)',
                      marginBottom: 10,
                    }}
                  >
                    Invited as {roleLabel(invite.role)}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => handleAccept(invite.id)}
                      disabled={actionId === invite.id}
                      style={{
                        flex: 1,
                        fontFamily: 'var(--font-inter)',
                        fontWeight: 700,
                        fontSize: '0.78rem',
                        color: 'var(--primary-foreground)',
                        background: 'var(--primary)',
                        border: 'none',
                        borderRadius: 5,
                        cursor: actionId === invite.id ? 'default' : 'pointer',
                        padding: '7px 10px',
                        opacity: actionId === invite.id ? 0.6 : 1,
                      }}
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDecline(invite.id)}
                      disabled={actionId === invite.id}
                      style={{
                        flex: 1,
                        fontFamily: 'var(--font-inter)',
                        fontWeight: 600,
                        fontSize: '0.78rem',
                        color: 'var(--foreground)',
                        background: 'transparent',
                        border: '1px solid var(--border)',
                        borderRadius: 5,
                        cursor: actionId === invite.id ? 'default' : 'pointer',
                        padding: '7px 10px',
                        opacity: actionId === invite.id ? 0.6 : 1,
                      }}
                    >
                      Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
