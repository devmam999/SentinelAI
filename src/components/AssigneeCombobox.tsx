import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { TeamMember } from '../lib/projectTeam'

const MAX_VISIBLE_OPTIONS = 5
const OPTION_HEIGHT_PX = 36

function memberLabel(member: TeamMember): string {
  const name = member.username ? `@${member.username}` : member.email || 'Unknown user'
  const role = member.role === 'owner' ? 'Owner' : member.role === 'admin' ? 'Admin' : 'User'
  return `${name} (${role})`
}

function memberSearchHaystack(member: TeamMember): string {
  return [member.username, member.email, member.role].filter(Boolean).join(' ').toLowerCase()
}

type AssigneeComboboxProps = {
  team: TeamMember[]
  disabled?: boolean
  placeholder?: string
  onPick: (userId: string) => void
}

export default function AssigneeCombobox({
  team,
  disabled = false,
  onPick,
  placeholder = 'Search teammates…',
}: AssigneeComboboxProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlightIndex, setHighlightIndex] = useState(0)

  const filteredTeam = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return team
    return team.filter((member) => memberSearchHaystack(member).includes(normalized))
  }, [query, team])

  useEffect(() => {
    setHighlightIndex(0)
  }, [query, open])

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [])

  const pickMember = (member: TeamMember) => {
    onPick(member.user_id)
    setQuery(memberLabel(member))
    setOpen(false)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!open && (event.key === 'ArrowDown' || event.key === 'Enter')) {
      setOpen(true)
      return
    }
    if (!open) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlightIndex((index) => Math.min(index + 1, Math.max(filteredTeam.length - 1, 0)))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlightIndex((index) => Math.max(index - 1, 0))
    } else if (event.key === 'Enter' && filteredTeam[highlightIndex]) {
      event.preventDefault()
      pickMember(filteredTeam[highlightIndex])
    } else if (event.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={rootRef} style={{ position: 'relative', flex: 1, minWidth: 220 }}>
      <input
        type="text"
        value={query}
        disabled={disabled}
        placeholder={placeholder}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls="assignee-options"
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        style={{
          width: '100%',
          fontFamily: 'var(--font-inter)',
          fontSize: '0.82rem',
          color: 'var(--foreground)',
          background: 'var(--background)',
          border: '1px solid var(--border)',
          borderRadius: 5,
          padding: '8px 10px',
          outline: 'none',
        }}
      />

      {open && !disabled && (
        <ul
          id="assignee-options"
          role="listbox"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            margin: 0,
            padding: 4,
            listStyle: 'none',
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
            maxHeight: MAX_VISIBLE_OPTIONS * OPTION_HEIGHT_PX,
            overflowY: 'auto',
            zIndex: 20,
          }}
        >
          {filteredTeam.length === 0 ? (
            <li
              style={{
                padding: '8px 10px',
                fontFamily: 'var(--font-inter)',
                fontSize: '0.8rem',
                color: 'var(--muted-foreground)',
              }}
            >
              No teammates match “{query.trim()}”
            </li>
          ) : (
            filteredTeam.map((member, index) => (
              <li key={member.user_id} role="option" aria-selected={highlightIndex === index}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pickMember(member)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    minHeight: OPTION_HEIGHT_PX,
                    padding: '8px 10px',
                    fontFamily: 'var(--font-inter)',
                    fontSize: '0.82rem',
                    color: 'var(--foreground)',
                    background: highlightIndex === index ? 'rgba(0,214,143,0.12)' : 'transparent',
                    border: 'none',
                    borderRadius: 4,
                    cursor: 'pointer',
                  }}
                >
                  {memberLabel(member)}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
