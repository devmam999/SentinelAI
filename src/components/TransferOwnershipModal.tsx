import { useEffect, useState } from 'react'
import { transferProjectOwnership } from '../lib/projectTeam'
import * as s from './authStyles'

const FADE_MS = 220
const STEP_MS = 180

type TransferOwnershipModalProps = {
  projectId: string
  member: { user_id: string; username: string | null; email: string | null }
  onClose: () => void
  onTransferred: () => void
}

export function transferOwnershipConfirmationPhrase(username: string) {
  return `sudo chown ${username}`
}

export default function TransferOwnershipModal({
  projectId,
  member,
  onClose,
  onTransferred,
}: TransferOwnershipModalProps) {
  const [step, setStep] = useState<'confirm' | 'verify'>('confirm')
  const [confirmationText, setConfirmationText] = useState('')
  const [transferring, setTransferring] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const [stepAnimating, setStepAnimating] = useState<'in' | 'out' | null>('in')

  const displayName = member.username || member.email || 'this teammate'
  const requiredPhrase = member.username ? transferOwnershipConfirmationPhrase(member.username) : ''
  const phraseMatches = confirmationText === requiredPhrase

  useEffect(() => {
    const frame = requestAnimationFrame(() => setIsOpen(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !transferring && !isClosing) closeWithAnimation()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [transferring, isClosing])

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  const closeWithAnimation = (afterClose?: () => void) => {
    if (isClosing || transferring) return

    setIsClosing(true)
    window.setTimeout(() => {
      afterClose?.()
      onClose()
    }, FADE_MS)
  }

  const goToVerifyStep = () => {
    if (!member.username) {
      setError('This teammate does not have a username yet, so ownership cannot be transferred.')
      return
    }

    setError(null)
    setStepAnimating('out')
    window.setTimeout(() => {
      setStep('verify')
      setStepAnimating('in')
      window.setTimeout(() => setStepAnimating(null), STEP_MS)
    }, STEP_MS)
  }

  const handleTransfer = async () => {
    if (!phraseMatches || transferring || isClosing) return

    setTransferring(true)
    setError(null)

    const { error: transferError } = await transferProjectOwnership(projectId, member.user_id)

    if (transferError) {
      setError(transferError)
      setTransferring(false)
      return
    }

    closeWithAnimation(onTransferred)
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
        if (!transferring && !isClosing) closeWithAnimation()
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
        aria-labelledby="transfer-ownership-title"
        className={panelClass}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 460,
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: '28px 24px 24px',
          boxShadow: '0 24px 48px rgba(0, 0, 0, 0.45)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 40,
              height: 40,
              flexShrink: 0,
              borderRadius: 8,
              color: 'var(--primary)',
              background: 'rgba(0, 214, 143, 0.1)',
              border: '1px solid rgba(0, 214, 143, 0.25)',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M8 2.5v11M5 12.5h6"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
              />
              <circle cx="8" cy="5" r="2" stroke="currentColor" strokeWidth="1.3" />
            </svg>
          </div>
          <h2
            id="transfer-ownership-title"
            style={{
              fontFamily: 'var(--font-inter)',
              fontWeight: 700,
              fontSize: '1.05rem',
              letterSpacing: '-0.02em',
              margin: 0,
            }}
          >
            Transfer ownership
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
                Are you sure you want to make{' '}
                <strong style={{ color: 'var(--foreground)', fontWeight: 600 }}>{displayName}</strong> the project
                owner? Note: If you do this, you can&apos;t make yourself an owner unless the new owner transfers
                ownership back to you.
              </p>

              {error && <div style={{ ...s.errorBox, marginTop: 0, marginBottom: 16 }}>{error}</div>}

              <div style={{ display: 'flex', gap: 10 }}>
                <ModalButton onClick={() => closeWithAnimation()} disabled={isClosing}>
                  Cancel
                </ModalButton>
                <ModalButton primary onClick={goToVerifyStep} disabled={isClosing}>
                  Yes, transfer ownership
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
                To transfer ownership to{' '}
                <strong style={{ color: 'var(--foreground)', fontWeight: 600 }}>{displayName}</strong>, type the
                following phrase exactly:
              </p>

              <div
                style={{
                  fontFamily: 'var(--font-jetbrains)',
                  fontSize: '0.78rem',
                  color: 'var(--primary)',
                  background: 'rgba(0, 214, 143, 0.08)',
                  border: '1px solid rgba(0, 214, 143, 0.22)',
                  borderRadius: 5,
                  padding: '10px 12px',
                  marginBottom: 14,
                  wordBreak: 'break-word',
                }}
              >
                {requiredPhrase}
              </div>

              <label htmlFor="transfer-confirmation" style={{ ...s.label, marginBottom: 10 }}>
                Confirmation phrase
              </label>
              <input
                id="transfer-confirmation"
                type="text"
                value={confirmationText}
                onChange={(e) => setConfirmationText(e.target.value)}
                placeholder={requiredPhrase}
                autoFocus
                disabled={transferring || isClosing}
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
                <ModalButton onClick={() => closeWithAnimation()} disabled={transferring || isClosing}>
                  Cancel
                </ModalButton>
                <ModalButton primary onClick={handleTransfer} disabled={!phraseMatches || transferring || isClosing}>
                  {transferring ? 'Transferring…' : 'Transfer ownership'}
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
  primary,
  disabled,
}: {
  children: React.ReactNode
  onClick: () => void
  primary?: boolean
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
        color: primary ? 'var(--primary-foreground)' : 'var(--foreground)',
        background: primary ? (disabled ? 'rgba(0, 214, 143, 0.35)' : 'var(--primary)') : 'transparent',
        border: primary ? 'none' : '1px solid var(--border)',
        borderRadius: 5,
        cursor: disabled ? 'not-allowed' : 'pointer',
        padding: '11px 14px',
        opacity: disabled ? 0.7 : 1,
        transition: 'opacity 0.15s, border-color 0.15s',
      }}
      onMouseEnter={(e) => {
        if (disabled) return
        if (!primary) e.currentTarget.style.borderColor = 'var(--primary)'
        else e.currentTarget.style.opacity = '0.88'
      }}
      onMouseLeave={(e) => {
        if (!primary) e.currentTarget.style.borderColor = 'var(--border)'
        else e.currentTarget.style.opacity = '1'
      }}
    >
      {children}
    </button>
  )
}
