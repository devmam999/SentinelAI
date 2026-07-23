import { useEffect, useRef, useState } from 'react'
import {
  inviteProjectMember,
  removeProjectMember,
  revokeProjectInvitation,
  roleLabel,
  setProjectMemberRole,
  type ProjectInvitation,
  type ProjectRole,
  type TeamMember,
} from '../lib/projectTeam'
import TransferOwnershipModal from './TransferOwnershipModal'
import * as s from './authStyles'

type ProjectTeamSectionProps = {
  projectId: string
  myRole: ProjectRole
  team: TeamMember[]
  invitations: ProjectInvitation[]
  currentUserId: string
  onChanged: () => Promise<void>
  embedded?: boolean
}

export default function ProjectTeamSection({
  projectId,
  myRole,
  team,
  invitations,
  currentUserId,
  onChanged,
  embedded = false,
}: ProjectTeamSectionProps) {
  const [inviteIdentifier, setInviteIdentifier] = useState('')
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [inviting, setInviting] = useState(false)
  const [revokingInviteId, setRevokingInviteId] = useState<string | null>(null)
  const [hoveredInviteId, setHoveredInviteId] = useState<string | null>(null)
  const [actingId, setActingId] = useState<string | null>(null)
  const [transferTarget, setTransferTarget] = useState<TeamMember | null>(null)

  const isOwner = myRole === 'owner'
  const canInvite = myRole === 'owner' || myRole === 'admin'

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setNotice(null)
    setInviting(true)
    const trimmed = inviteIdentifier.trim()
    const { error: inviteError } = await inviteProjectMember(projectId, trimmed, inviteRole)
    setInviting(false)
    if (inviteError) {
      setError(inviteError)
      return
    }
    setInviteIdentifier('')
    setNotice(`Invitation sent to ${trimmed}.`)
    await onChanged()
  }

  const handleRevokeInvite = async (invitationId: string) => {
    setError(null)
    setNotice(null)
    setRevokingInviteId(invitationId)
    const { error: revokeError } = await revokeProjectInvitation(invitationId)
    setRevokingInviteId(null)
    if (revokeError) {
      setError(revokeError)
      return
    }
    setNotice('Invitation cancelled.')
    await onChanged()
  }

  const runMemberAction = async (memberId: string, action: () => Promise<{ error: string | null }>) => {
    setError(null)
    setNotice(null)
    setActingId(memberId)
    const { error: actionError } = await action()
    setActingId(null)
    if (actionError) {
      setError(actionError)
      return
    }
    await onChanged()
  }

  return (
    <div
      style={
        embedded
          ? undefined
          : {
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: '18px 20px',
            }
      }
    >
      {!embedded && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontFamily: 'var(--font-inter)', fontWeight: 700, fontSize: '1rem', marginBottom: 6 }}>
            Team & permissions
          </div>
          <p style={{ fontFamily: 'var(--font-inter)', fontSize: '0.84rem', lineHeight: 1.55, color: 'var(--muted-foreground)', margin: 0 }}>
            The owner controls admin roles, can transfer ownership, and is the only one who can delete the project. Admins can invite users, remove users, and request project edits for owner approval.
          </p>
        </div>
      )}

      {embedded && (
        <p
          style={{
            fontFamily: 'var(--font-inter)',
            fontSize: '0.84rem',
            lineHeight: 1.55,
            color: 'var(--muted-foreground)',
            margin: '0 0 16px',
          }}
        >
          The owner controls admin roles, can transfer ownership, and is the only one who can delete the project. Admins can invite users, remove users, and request project edits for owner approval.
        </p>
      )}

      {error && <div style={{ ...s.errorBox, marginTop: 0 }}>{error}</div>}
      {notice && <div style={{ ...s.successBox, marginTop: 0 }}>{notice}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
        {team.map((member) => (
          <MemberRow
            key={member.user_id}
            member={member}
            myRole={myRole}
            currentUserId={currentUserId}
            acting={actingId === member.id}
            onSetRole={
              member.id
                ? (role) => runMemberAction(member.id!, () => setProjectMemberRole(member.id!, role))
                : undefined
            }
            onRemove={member.id ? () => runMemberAction(member.id!, () => removeProjectMember(member.id!)) : undefined}
            onMakeOwner={
              isOwner && member.role !== 'owner' && member.user_id !== currentUserId
                ? () => setTransferTarget(member)
                : undefined
            }
          />
        ))}
      </div>

      {invitations.length > 0 && (
        <div style={{ marginBottom: 18, paddingTop: 6, paddingRight: 6 }}>
          <div style={sectionLabelStyle}>Pending invitations</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflow: 'visible' }}>
            {invitations.map((invitation) => (
              <div
                key={invitation.id}
                style={{ ...dashedRowStyle, position: 'relative', overflow: 'visible' }}
                onMouseEnter={() => setHoveredInviteId(invitation.id)}
                onMouseLeave={() => setHoveredInviteId(null)}
              >
                {canInvite && hoveredInviteId === invitation.id && (
                  <button
                    type="button"
                    aria-label={`Cancel invitation for ${invitation.email}`}
                    title="Cancel invitation"
                    onClick={() => handleRevokeInvite(invitation.id)}
                    disabled={revokingInviteId === invitation.id}
                    style={{
                      position: 'absolute',
                      top: 0,
                      right: 0,
                      transform: 'translate(50%, -50%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 18,
                      height: 18,
                      padding: 0,
                      color: '#ff8a8a',
                      background: 'var(--card)',
                      border: '1px solid rgba(255, 95, 95, 0.45)',
                      borderRadius: '50%',
                      cursor: revokingInviteId === invitation.id ? 'default' : 'pointer',
                      opacity: revokingInviteId === invitation.id ? 0.5 : 1,
                      zIndex: 2,
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.35)',
                    }}
                  >
                    <svg width="9" height="9" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path
                        d="M4 4l8 8M12 4l-8 8"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                )}
                <span style={{ fontFamily: 'var(--font-inter)', fontSize: '0.85rem' }}>{invitation.email}</span>
                <RoleBadge role={invitation.role} pending />
              </div>
            ))}
          </div>
        </div>
      )}

      {canInvite && (
        <form onSubmit={handleInvite} style={{ marginBottom: 0 }}>
          <label htmlFor="invite-identifier" style={s.label}>
            Invite teammate
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
            <input
              id="invite-identifier"
              type="text"
              inputMode="text"
              value={inviteIdentifier}
              onChange={(e) => setInviteIdentifier(e.target.value)}
              placeholder="username or email"
              required
              autoComplete="off"
              spellCheck={false}
              style={{ ...s.input, flex: '1 1 220px', marginBottom: 0 }}
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as 'admin' | 'member')}
              style={{ ...s.input, width: 140, marginBottom: 0, cursor: 'pointer' }}
            >
              <option value="member">User</option>
              {isOwner && <option value="admin">Admin</option>}
            </select>
          </div>
          <button type="submit" disabled={inviting} style={{ ...s.primaryButton, width: 'auto', opacity: inviting ? 0.6 : 1 }}>
            {inviting ? 'Sending…' : 'Send invitation'}
          </button>
        </form>
      )}

      {transferTarget && (
        <TransferOwnershipModal
          projectId={projectId}
          member={{
            user_id: transferTarget.user_id,
            username: transferTarget.username,
            email: transferTarget.email,
          }}
          onClose={() => setTransferTarget(null)}
          onTransferred={async () => {
            setTransferTarget(null)
            setNotice('Ownership transferred.')
            await onChanged()
          }}
        />
      )}
    </div>
  )
}

function MemberRow({
  member,
  myRole,
  currentUserId,
  acting,
  onSetRole,
  onRemove,
  onMakeOwner,
}: {
  member: TeamMember
  myRole: ProjectRole
  currentUserId: string
  acting: boolean
  onSetRole?: (role: 'admin' | 'member') => void
  onRemove?: () => void
  onMakeOwner?: () => void
}) {
  const isSelf = member.user_id === currentUserId
  const isOwner = member.role === 'owner'
  const viewerIsOwner = myRole === 'owner'
  const viewerIsAdmin = myRole === 'admin'

  const canChangeRole = viewerIsOwner && !isSelf && !isOwner && !!onSetRole
  const canRemove =
    !isSelf && !isOwner && !!onRemove && ((viewerIsOwner && !isOwner) || (viewerIsAdmin && member.role === 'member'))
  const canMakeOwner = viewerIsOwner && !isSelf && !isOwner && !!onMakeOwner
  const hasMenu = canChangeRole || canRemove || canMakeOwner

  return (
    <div style={memberRowStyle}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--font-inter)', fontSize: '0.9rem', fontWeight: 600 }}>
          {member.username || member.email || 'Teammate'}
          {isSelf ? ' (you)' : ''}
        </div>
        {member.email && (
          <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '0.74rem', color: 'var(--muted-foreground)' }}>
            {member.email}
          </div>
        )}
      </div>
      {hasMenu ? (
        <MemberRoleMenu
          member={member}
          acting={acting}
          canChangeRole={canChangeRole}
          canMakeOwner={canMakeOwner}
          canRemove={canRemove}
          onSetRole={onSetRole}
          onMakeOwner={onMakeOwner}
          onRemove={onRemove}
        />
      ) : (
        <RoleBadge role={member.role} />
      )}
    </div>
  )
}

type MemberRoleMenuProps = {
  member: TeamMember
  acting: boolean
  canChangeRole: boolean
  canMakeOwner: boolean
  canRemove: boolean
  onSetRole?: (role: 'admin' | 'member') => void
  onMakeOwner?: () => void
  onRemove?: () => void
}

function MemberRoleMenu({
  member,
  acting,
  canChangeRole,
  canMakeOwner,
  canRemove,
  onSetRole,
  onMakeOwner,
  onRemove,
}: MemberRoleMenuProps) {
  const [open, setOpen] = useState(false)
  const [menuVisible, setMenuVisible] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) {
      setMenuVisible(false)
      return
    }
    const frame = requestAnimationFrame(() => setMenuVisible(true))
    return () => cancelAnimationFrame(frame)
  }, [open])

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

  const runAndClose = (action?: () => void) => {
    if (!action || acting) return
    setOpen(false)
    action()
  }

  const showRoleSection = canChangeRole || (canRemove && !canChangeRole && member.role === 'member')

  return (
    <div ref={rootRef} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={acting}
        onClick={() => setOpen((current) => !current)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontFamily: 'var(--font-inter)',
          fontSize: '0.78rem',
          fontWeight: 600,
          color: 'var(--foreground)',
          background: open ? 'rgba(0,214,143,0.06)' : 'transparent',
          border: `1px solid ${open ? 'rgba(0,214,143,0.28)' : 'var(--border)'}`,
          borderRadius: 6,
          cursor: acting ? 'default' : 'pointer',
          padding: '6px 10px',
          opacity: acting ? 0.6 : 1,
          transition: 'border-color 0.15s, background 0.15s',
        }}
      >
        {roleLabel(member.role)}
        <svg
          width="12"
          height="12"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
          style={{
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.18s ease',
          }}
        >
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            minWidth: 188,
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            boxShadow: '0 12px 32px rgba(0, 0, 0, 0.35)',
            padding: '6px 0',
            zIndex: 30,
            opacity: menuVisible ? 1 : 0,
            transform: menuVisible ? 'translateY(0)' : 'translateY(-6px)',
            transition: 'opacity 0.16s ease, transform 0.16s ease',
            pointerEvents: menuVisible ? 'auto' : 'none',
          }}
        >
          {showRoleSection && (
            <>
              {(canChangeRole || member.role === 'member') && (
                <RoleMenuItem
                  label="User"
                  selected={member.role === 'member'}
                  disabled={acting || member.role === 'member' || !canChangeRole}
                  onClick={() => runAndClose(() => onSetRole?.('member'))}
                />
              )}
              {canChangeRole && (
                <RoleMenuItem
                  label="Admin"
                  selected={member.role === 'admin'}
                  disabled={acting || member.role === 'admin'}
                  onClick={() => runAndClose(() => onSetRole?.('admin'))}
                />
              )}
            </>
          )}

          {(canMakeOwner || canRemove) && showRoleSection && (
            <div style={{ height: 1, background: 'var(--border)', margin: '6px 0' }} />
          )}

          {canMakeOwner && (
            <ActionMenuItem label="Make owner" disabled={acting} onClick={() => runAndClose(onMakeOwner)} />
          )}
          {canRemove && (
            <ActionMenuItem
              label="Remove access"
              danger
              disabled={acting}
              onClick={() => runAndClose(onRemove)}
            />
          )}
        </div>
      )}
    </div>
  )
}

function RoleMenuItem({
  label,
  selected,
  disabled,
  onClick,
}: {
  label: string
  selected: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onClick}
      style={menuItemStyle(disabled)}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.background = 'rgba(0,214,143,0.06)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent'
      }}
    >
      <span style={{ width: 14, display: 'inline-flex', justifyContent: 'center' }}>
        {selected && (
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M3.5 8.2l3 3 6-6.5"
              stroke="var(--primary)"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
      <span>{label}</span>
    </button>
  )
}

function ActionMenuItem({
  label,
  danger,
  disabled,
  onClick,
}: {
  label: string
  danger?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      style={{
        ...menuItemStyle(disabled),
        color: danger ? '#ff8a8a' : 'var(--foreground)',
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.background = danger ? 'rgba(255,95,95,0.08)' : 'rgba(0,214,143,0.06)'
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent'
      }}
    >
      <span style={{ width: 14 }} />
      <span>{label}</span>
    </button>
  )
}

function menuItemStyle(disabled?: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    fontFamily: 'var(--font-inter)',
    fontSize: '0.82rem',
    fontWeight: 500,
    color: 'var(--foreground)',
    background: 'transparent',
    border: 'none',
    cursor: disabled ? 'default' : 'pointer',
    padding: '8px 12px',
    textAlign: 'left',
    opacity: disabled ? 0.45 : 1,
  }
}

function RoleBadge({ role, pending }: { role: ProjectRole | 'admin' | 'member'; pending?: boolean }) {
  const isOwner = role === 'owner'
  const isAdmin = role === 'admin'
  return (
    <span
      style={{
        fontFamily: 'var(--font-jetbrains)',
        fontSize: '0.66rem',
        fontWeight: 600,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: isOwner || isAdmin ? 'var(--primary)' : 'var(--muted-foreground)',
        background: isOwner || isAdmin ? 'rgba(0,214,143,0.09)' : 'var(--muted)',
        border: `1px solid ${isOwner || isAdmin ? 'rgba(0,214,143,0.22)' : 'var(--border)'}`,
        borderRadius: 4,
        padding: '2px 8px',
        whiteSpace: 'nowrap',
      }}
    >
      {pending ? 'Pending ' : ''}
      {roleLabel(role as ProjectRole)}
    </span>
  )
}

const sectionLabelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-jetbrains)',
  fontSize: '0.68rem',
  fontWeight: 600,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--muted-foreground)',
  marginBottom: 8,
}

const memberRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '10px 12px',
}

const dashedRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  border: '1px dashed var(--border)',
  borderRadius: 8,
  padding: '10px 12px',
}
