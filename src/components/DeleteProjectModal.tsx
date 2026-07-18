import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import * as s from './authStyles'

const FADE_MS = 220
const STEP_MS = 180

type DeleteProjectModalProps = {
  project: { id: string; name: string }
  onClose: () => void
  onDeleted: (projectId: string) => void
}

export function deleteConfirmationPhrase(projectName: string) {
  return `sudo delete ${projectName}`
}

export default function DeleteProjectModal({ project, onClose, onDeleted }: DeleteProjectModalProps) {
  const [step, setStep] = useState<'confirm' | 'verify'>('confirm')
  const [confirmationText, setConfirmationText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const [stepAnimating, setStepAnimating] = useState<'in' | 'out' | null>('in')

  const requiredPhrase = deleteConfirmationPhrase(project.name)
  const phraseMatches = confirmationText === requiredPhrase

  useEffect(() => {
    const frame = requestAnimationFrame(() => setIsOpen(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !deleting && !isClosing) closeWithAnimation()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [deleting, isClosing])

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  const closeWithAnimation = (afterClose?: () => void) => {
    if (isClosing || deleting) return

    setIsClosing(true)
    window.setTimeout(() => {
      afterClose?.()
      onClose()
    }, FADE_MS)
  }

  const goToVerifyStep = () => {
    setStepAnimating('out')
    window.setTimeout(() => {
      setStep('verify')
      setStepAnimating('in')
      window.setTimeout(() => setStepAnimating(null), STEP_MS)
    }, STEP_MS)
  }

  const handleDelete = async () => {
    if (!phraseMatches || deleting || isClosing) return

    setDeleting(true)
    setError(null)

    const { error: deleteError } = await supabase.from('projects').delete().eq('id', project.id)

    if (deleteError) {
      setError(deleteError.message)
      setDeleting(false)
      return
    }

    closeWithAnimation(() => onDeleted(project.id))
  }

  const backdropClass = [
    'delete-project-modal-backdrop',
    isOpen && !isClosing ? 'delete-project-modal-backdrop--open' : '',
    isClosing ? 'delete-project-modal-backdrop--closing' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const panelClass = [
    'delete-project-modal-panel',
    isOpen && !isClosing ? 'delete-project-modal-panel--open' : '',
    isClosing ? 'delete-project-modal-panel--closing' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const stepClass = [
    'delete-project-modal-step',
    stepAnimating === 'in' ? 'delete-project-modal-step--in' : '',
    stepAnimating === 'out' ? 'delete-project-modal-step--out' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <>
      <style>{`
        .delete-project-modal-backdrop {
          opacity: 0;
          transition: opacity ${FADE_MS}ms ease;
        }

        .delete-project-modal-backdrop--open,
        .delete-project-modal-backdrop--closing {
          opacity: 1;
        }

        .delete-project-modal-backdrop--closing {
          opacity: 0;
        }

        .delete-project-modal-panel {
          opacity: 0;
          transform: translateY(-10px) scale(0.985);
          transition:
            opacity ${FADE_MS}ms cubic-bezier(0.16, 1, 0.3, 1),
            transform ${FADE_MS}ms cubic-bezier(0.16, 1, 0.3, 1);
        }

        .delete-project-modal-panel--open {
          opacity: 1;
          transform: translateY(0) scale(1);
        }

        .delete-project-modal-panel--closing {
          opacity: 0;
          transform: translateY(8px) scale(0.985);
        }

        .delete-project-modal-step {
          opacity: 1;
          transform: translateY(0);
        }

        .delete-project-modal-step--in {
          animation: delete-project-step-in ${STEP_MS}ms cubic-bezier(0.16, 1, 0.3, 1) backwards;
        }

        .delete-project-modal-step--out {
          animation: delete-project-step-out ${STEP_MS}ms ease forwards;
        }

        @keyframes delete-project-step-in {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes delete-project-step-out {
          from {
            opacity: 1;
            transform: translateY(0);
          }
          to {
            opacity: 0;
            transform: translateY(-6px);
          }
        }
      `}</style>

      <div
        role="presentation"
        className={backdropClass}
        onClick={() => {
          if (!deleting && !isClosing) closeWithAnimation()
        }}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          background: 'rgba(0, 0, 0, 0.72)',
          backdropFilter: 'blur(4px)',
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-project-title"
          className={panelClass}
          onClick={(e) => e.stopPropagation()}
          style={{
            width: '100%',
            maxWidth: 440,
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '28px 24px 24px',
            boxShadow: '0 24px 48px rgba(0, 0, 0, 0.45)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginBottom: 16,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 40,
                height: 40,
                flexShrink: 0,
                borderRadius: 8,
                color: '#ff5f5f',
                background: 'rgba(255, 95, 95, 0.1)',
                border: '1px solid rgba(255, 95, 95, 0.25)',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
                <path
                  d="M3 4.5h10M6.5 4V2.5h3V4M4.5 4.5l.5 8h6l.5-8"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h2
              id="delete-project-title"
              style={{
                fontFamily: 'var(--font-inter)',
                fontWeight: 700,
                fontSize: '1.05rem',
                letterSpacing: '-0.02em',
                margin: 0,
              }}
            >
              Delete project
            </h2>
          </div>

          <div className={stepClass}>
            {step === 'confirm' ? (
              <>
                <p
                  style={{
                    fontFamily: 'var(--font-inter)',
                    fontSize: '0.9rem',
                    lineHeight: 1.55,
                    color: 'var(--muted-foreground)',
                    margin: '0 0 24px',
                  }}
                >
                  Are you sure you want to delete{' '}
                  <strong style={{ color: 'var(--foreground)', fontWeight: 600 }}>{project.name}</strong>? This action
                  is permanent and cannot be undone.
                </p>

                <div style={{ display: 'flex', gap: 10 }}>
                  <ModalButton onClick={() => closeWithAnimation()} disabled={isClosing}>
                    Cancel
                  </ModalButton>
                  <ModalButton danger onClick={goToVerifyStep} disabled={isClosing}>
                    Yes, delete project
                  </ModalButton>
                </div>
              </>
            ) : (
              <>
                <p
                  style={{
                    fontFamily: 'var(--font-inter)',
                    fontSize: '0.9rem',
                    lineHeight: 1.55,
                    color: 'var(--muted-foreground)',
                    margin: '0 0 16px',
                  }}
                >
                  To permanently delete{' '}
                  <strong style={{ color: 'var(--foreground)', fontWeight: 600 }}>{project.name}</strong>, type the
                  following phrase exactly:
                </p>

                <div
                  style={{
                    fontFamily: 'var(--font-jetbrains)',
                    fontSize: '0.78rem',
                    color: '#ff8a8a',
                    background: 'rgba(255, 95, 95, 0.08)',
                    border: '1px solid rgba(255, 95, 95, 0.22)',
                    borderRadius: 5,
                    padding: '10px 12px',
                    marginBottom: 14,
                    wordBreak: 'break-word',
                  }}
                >
                  {requiredPhrase}
                </div>

                <label htmlFor="delete-confirmation" style={{ ...s.label, marginBottom: 10 }}>
                  Confirmation phrase
                </label>
                <input
                  id="delete-confirmation"
                  type="text"
                  value={confirmationText}
                  onChange={(e) => setConfirmationText(e.target.value)}
                  placeholder={requiredPhrase}
                  autoFocus
                  disabled={deleting || isClosing}
                  style={{
                    ...s.input,
                    marginBottom: error ? 12 : 20,
                    borderColor: confirmationText && !phraseMatches ? 'rgba(255, 95, 95, 0.45)' : 'var(--border)',
                  }}
                  onFocus={(e) => {
                    if (!confirmationText || phraseMatches) e.target.style.borderColor = 'var(--primary)'
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor =
                      confirmationText && !phraseMatches ? 'rgba(255, 95, 95, 0.45)' : 'var(--border)'
                  }}
                />

                {error && <div style={{ ...s.errorBox, marginTop: 0, marginBottom: 16 }}>{error}</div>}

                <div style={{ display: 'flex', gap: 10 }}>
                  <ModalButton onClick={() => closeWithAnimation()} disabled={deleting || isClosing}>
                    Cancel
                  </ModalButton>
                  <ModalButton danger onClick={handleDelete} disabled={!phraseMatches || deleting || isClosing}>
                    {deleting ? 'Deleting…' : 'Delete permanently'}
                  </ModalButton>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

function ModalButton({
  children,
  onClick,
  danger,
  disabled,
}: {
  children: React.ReactNode
  onClick: () => void
  danger?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1,
        fontFamily: 'var(--font-inter)',
        fontWeight: 600,
        fontSize: '0.875rem',
        color: danger ? '#fff' : 'var(--foreground)',
        background: danger ? (disabled ? 'rgba(255, 95, 95, 0.35)' : '#ff5f5f') : 'transparent',
        border: danger ? 'none' : '1px solid var(--border)',
        borderRadius: 5,
        cursor: disabled ? 'not-allowed' : 'pointer',
        padding: '11px 14px',
        opacity: disabled ? 0.7 : 1,
        transition: 'opacity 0.15s, border-color 0.15s',
      }}
      onMouseEnter={(e) => {
        if (disabled) return
        if (!danger) e.currentTarget.style.borderColor = 'var(--primary)'
        else e.currentTarget.style.opacity = '0.88'
      }}
      onMouseLeave={(e) => {
        if (!danger) e.currentTarget.style.borderColor = 'var(--border)'
        else e.currentTarget.style.opacity = '1'
      }}
    >
      {children}
    </button>
  )
}
