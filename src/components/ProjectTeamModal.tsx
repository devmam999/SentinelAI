import { useEffect, useState } from 'react'
import ProjectTeamSection from './ProjectTeamSection'
import type { ProjectInvitation, ProjectRole, TeamMember } from '../lib/projectTeam'

type ProjectTeamModalProps = {
  projectId: string
  myRole: ProjectRole
  team: TeamMember[]
  invitations: ProjectInvitation[]
  currentUserId: string
  onClose: () => void
  onChanged: () => Promise<void>
}

export default function ProjectTeamModal({
  projectId,
  myRole,
  team,
  invitations,
  currentUserId,
  onClose,
  onChanged,
}: ProjectTeamModalProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isClosing, setIsClosing] = useState(false)

  useEffect(() => {
    const frame = requestAnimationFrame(() => setIsOpen(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  const close = () => {
    setIsClosing(true)
    window.setTimeout(onClose, 180)
  }

  return (
    <div
      className={isOpen && !isClosing ? 'delete-project-modal-backdrop--open' : ''}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: isOpen && !isClosing ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0)',
        transition: 'background 0.18s ease',
      }}
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="team-modal-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 560,
          maxHeight: 'min(88vh, 760px)',
          overflowY: 'auto',
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: '22px 20px',
          transform: isOpen && !isClosing ? 'translateY(0)' : 'translateY(12px)',
          opacity: isOpen && !isClosing ? 1 : 0,
          transition: 'transform 0.18s ease, opacity 0.18s ease',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 16,
            marginBottom: 16,
          }}
        >
          <div>
            <h2
              id="team-modal-title"
              style={{
                fontFamily: 'var(--font-inter)',
                fontWeight: 800,
                fontSize: '1.15rem',
                letterSpacing: '-0.02em',
                marginBottom: 4,
              }}
            >
              Team & permissions
            </h2>
            <p
              style={{
                fontFamily: 'var(--font-inter)',
                fontSize: '0.84rem',
                lineHeight: 1.5,
                color: 'var(--muted-foreground)',
                margin: 0,
              }}
            >
              Invite teammates and manage roles.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={close}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 32,
              height: 32,
              color: 'var(--muted-foreground)',
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 6,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <ProjectTeamSection
          projectId={projectId}
          myRole={myRole}
          team={team}
          invitations={invitations}
          currentUserId={currentUserId}
          onChanged={onChanged}
          embedded
        />
      </div>
    </div>
  )
}
