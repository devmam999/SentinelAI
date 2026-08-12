import { useEffect, useState } from 'react'
import * as s from './authStyles'

type ReviewFixModalProps = {
  incidentTitle: string
  submitterUsername: string | null
  fixDescription: string
  onClose: () => void
  onSubmit: (feedback: string) => Promise<void>
}

export default function ReviewFixModal({
  incidentTitle,
  submitterUsername,
  fixDescription,
  onClose,
  onSubmit,
}: ReviewFixModalProps) {
  const [feedback, setFeedback] = useState('')
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
    if (!feedback.trim()) {
      setError('Share what needs to change before sending feedback.')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await onSubmit(feedback.trim())
      close()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send feedback.')
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
        aria-labelledby="review-fix-title"
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
          id="review-fix-title"
          style={{
            fontFamily: 'var(--font-inter)',
            fontWeight: 800,
            fontSize: '1.15rem',
            letterSpacing: '-0.02em',
            marginBottom: 8,
          }}
        >
          Decline / Request changes
        </h2>
        <p
          style={{
            fontFamily: 'var(--font-inter)',
            fontSize: '0.88rem',
            lineHeight: 1.55,
            color: 'var(--muted-foreground)',
            marginBottom: 14,
          }}
        >
          {submitterUsername ? `@${submitterUsername}'s` : 'The teammate’s'} fix for “{incidentTitle}” needs
          more work. Your feedback will be shown on the incident so they can revise and resubmit.
        </p>

        <div
          style={{
            marginBottom: 16,
            padding: '12px 14px',
            borderRadius: 8,
            background: 'rgba(240,192,64,0.08)',
            border: '1px solid rgba(240,192,64,0.22)',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-jetbrains)',
              fontSize: '0.68rem',
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#f0c040',
              marginBottom: 6,
            }}
          >
            Submitted fix
          </div>
          <p
            style={{
              fontFamily: 'var(--font-inter)',
              fontSize: '0.86rem',
              lineHeight: 1.55,
              color: 'var(--foreground)',
              margin: 0,
            }}
          >
            {fixDescription}
          </p>
        </div>

        {error && <div style={{ ...s.errorBox, marginTop: 0 }}>{error}</div>}

        <label htmlFor="fix-feedback" style={s.label}>
          Feedback for the assignee
        </label>
        <textarea
          id="fix-feedback"
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="Explain what is missing, incorrect, or what they should try next…"
          rows={4}
          autoFocus
          style={{
            ...s.input,
            resize: 'vertical',
            minHeight: 100,
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
            {submitting ? 'Sending…' : 'Send feedback'}
          </button>
        </div>
      </div>
    </div>
  )
}
