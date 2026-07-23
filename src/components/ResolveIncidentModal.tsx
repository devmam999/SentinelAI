import { useEffect, useState } from 'react'
import * as s from './authStyles'

type ResolveIncidentModalProps = {
  incidentTitle: string
  canAutoResolve: boolean
  onClose: () => void
  onSubmit: (fixDescription: string) => Promise<void>
}

export default function ResolveIncidentModal({
  incidentTitle,
  canAutoResolve,
  onClose,
  onSubmit,
}: ResolveIncidentModalProps) {
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
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

  const handleSubmit = async () => {
    if (!description.trim()) {
      setError('Describe what you fixed before submitting.')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await onSubmit(description.trim())
      close()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit your fix.')
      setSubmitting(false)
    }
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
        aria-labelledby="resolve-incident-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 520,
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: '24px 22px',
          transform: isOpen && !isClosing ? 'translateY(0)' : 'translateY(12px)',
          opacity: isOpen && !isClosing ? 1 : 0,
          transition: 'transform 0.18s ease, opacity 0.18s ease',
        }}
      >
        <h2
          id="resolve-incident-title"
          style={{
            fontFamily: 'var(--font-inter)',
            fontWeight: 800,
            fontSize: '1.15rem',
            letterSpacing: '-0.02em',
            marginBottom: 8,
          }}
        >
          Resolve incident
        </h2>
        <p
          style={{
            fontFamily: 'var(--font-inter)',
            fontSize: '0.88rem',
            lineHeight: 1.55,
            color: 'var(--muted-foreground)',
            marginBottom: 16,
          }}
        >
          {canAutoResolve
            ? `Describe what was fixed for "${incidentTitle}". The incident will be marked resolved immediately.`
            : `Describe what you fixed for "${incidentTitle}". An admin must approve your fix before the incident is marked resolved.`}
        </p>

        {error && <div style={{ ...s.errorBox, marginTop: 0 }}>{error}</div>}

        <label htmlFor="fix-description" style={s.label}>
          What did you fix?
        </label>
        <textarea
          id="fix-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Explain the root cause and the changes you made to fix it…"
          rows={5}
          autoFocus
          style={{
            ...s.input,
            resize: 'vertical',
            minHeight: 120,
            marginBottom: 18,
          }}
        />

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={close}
            disabled={submitting}
            style={{
              fontFamily: 'var(--font-inter)',
              fontWeight: 600,
              fontSize: '0.875rem',
              color: 'var(--foreground)',
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 5,
              cursor: submitting ? 'default' : 'pointer',
              padding: '10px 16px',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              ...s.primaryButton,
              width: 'auto',
              opacity: submitting ? 0.6 : 1,
              cursor: submitting ? 'default' : 'pointer',
            }}
          >
            {submitting ? 'Submitting…' : canAutoResolve ? 'Mark resolved' : 'Submit for approval'}
          </button>
        </div>
      </div>
    </div>
  )
}
