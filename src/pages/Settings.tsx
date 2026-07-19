import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AppHeader from '../components/AppHeader'
import DeleteAccountModal from '../components/DeleteAccountModal'
import PasswordRequirements from '../components/PasswordRequirements'
import * as s from '../components/authStyles'
import { useAuth } from '../context/AuthContext'
import { isPasswordValid } from '../lib/passwordValidation'
import { isUsernameAvailable } from '../lib/profile'
import { supabase } from '../lib/supabase'
import { USERNAME_MAX_LENGTH, validateUsername } from '../lib/usernameValidation'

const FADE_MS = 220

type EditPanel = 'username' | 'email' | 'password'

const sectionStyle = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: '22px 20px',
  marginBottom: 16,
} as const

const sectionTitleStyle = {
  fontFamily: 'var(--font-inter)',
  fontWeight: 700,
  fontSize: '1rem',
  marginBottom: 6,
} as const

const sectionHintStyle = {
  fontFamily: 'var(--font-inter)',
  fontSize: '0.84rem',
  lineHeight: 1.5,
  color: 'var(--muted-foreground)',
  marginBottom: 0,
} as const

const valueStyle = {
  fontFamily: 'var(--font-jetbrains)',
  fontSize: '0.88rem',
  color: 'var(--foreground)',
  marginTop: 10,
  wordBreak: 'break-all' as const,
}

const actionButtonStyle = {
  fontFamily: 'var(--font-inter)',
  fontWeight: 600,
  fontSize: '0.875rem',
  color: 'var(--foreground)',
  background: 'transparent',
  border: '1px solid var(--border)',
  borderRadius: 5,
  cursor: 'pointer',
  padding: '9px 14px',
  transition: 'border-color 0.15s, opacity 0.15s',
} as const

async function sendConfirmationEmail(): Promise<boolean> {
  const { error } = await supabase.auth.reauthenticate()
  return !error
}

function SettingsPanel({
  open,
  children,
}: {
  open: boolean
  children: ReactNode
}) {
  const [mounted, setMounted] = useState(open)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (open) {
      setMounted(true)
      const frame = requestAnimationFrame(() => setVisible(true))
      return () => cancelAnimationFrame(frame)
    }

    setVisible(false)
    const timeout = window.setTimeout(() => setMounted(false), FADE_MS)
    return () => window.clearTimeout(timeout)
  }, [open])

  if (!mounted) return null

  return (
    <div
      style={{
        marginTop: 16,
        paddingTop: 16,
        borderTop: '1px solid var(--border)',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(-6px)',
        transition: `opacity ${FADE_MS}ms ease, transform ${FADE_MS}ms cubic-bezier(0.16, 1, 0.3, 1)`,
      }}
    >
      {children}
    </div>
  )
}

export default function Settings() {
  const navigate = useNavigate()
  const { user, profile, refreshProfile, signOut } = useAuth()

  const [activePanel, setActivePanel] = useState<EditPanel | null>(null)

  const [usernameOld, setUsernameOld] = useState('')
  const [usernameNew, setUsernameNew] = useState('')
  const [usernameError, setUsernameError] = useState<string | null>(null)
  const [usernameNotice, setUsernameNotice] = useState<string | null>(null)
  const [usernameLoading, setUsernameLoading] = useState(false)

  const [emailOld, setEmailOld] = useState('')
  const [emailNew, setEmailNew] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [emailNotice, setEmailNotice] = useState<string | null>(null)
  const [emailLoading, setEmailLoading] = useState(false)

  const [passwordNew, setPasswordNew] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordNotice, setPasswordNotice] = useState<string | null>(null)
  const [passwordLoading, setPasswordLoading] = useState(false)

  const [showDeleteModal, setShowDeleteModal] = useState(false)

  const currentEmail = user?.email ?? profile?.email ?? ''
  const currentUsername = profile?.username ?? ''

  const togglePanel = (panel: EditPanel) => {
    setActivePanel((current) => {
      if (current === panel) {
        if (panel === 'username') resetUsernameForm()
        if (panel === 'email') resetEmailForm()
        if (panel === 'password') resetPasswordForm()
        return null
      }
      return panel
    })
  }

  const closePanel = () => setActivePanel(null)

  const resetUsernameForm = () => {
    setUsernameOld('')
    setUsernameNew('')
    setUsernameError(null)
  }

  const resetEmailForm = () => {
    setEmailOld('')
    setEmailNew('')
    setEmailError(null)
  }

  const resetPasswordForm = () => {
    setPasswordNew('')
    setPasswordConfirm('')
    setPasswordError(null)
  }

  const handleUsernameSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setUsernameError(null)
    setUsernameNotice(null)

    const oldError = validateUsername(usernameOld)
    const newError = validateUsername(usernameNew)
    if (oldError || newError) {
      setUsernameError(oldError ?? newError)
      return
    }

    if (usernameOld.trim().toLowerCase() !== currentUsername.toLowerCase()) {
      setUsernameError('Current username does not match.')
      return
    }

    if (usernameOld.trim().toLowerCase() === usernameNew.trim().toLowerCase()) {
      setUsernameError('New username must be different from your current username.')
      return
    }

    setUsernameLoading(true)
    const available = await isUsernameAvailable(usernameNew)
    if (!available) {
      setUsernameLoading(false)
      setUsernameError('That username is already taken.')
      return
    }

    const { error } = await supabase.rpc('update_username', {
      old_username: usernameOld.trim(),
      new_username: usernameNew.trim(),
    })
    setUsernameLoading(false)

    if (error) {
      setUsernameError(error.message)
      return
    }

    await supabase.auth.updateUser({ data: { username: usernameNew.trim() } })
    await refreshProfile()
    resetUsernameForm()
    closePanel()
    setUsernameNotice('Username updated.')
  }

  const handleEmailSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setEmailError(null)
    setEmailNotice(null)

    if (emailOld.trim().toLowerCase() !== currentEmail.toLowerCase()) {
      setEmailError('Current email does not match.')
      return
    }

    if (emailNew.trim().toLowerCase() === currentEmail.toLowerCase()) {
      setEmailError('New email must be different from your current email.')
      return
    }

    if (!emailNew.includes('@')) {
      setEmailError('Enter a valid email address.')
      return
    }

    setEmailLoading(true)
    const { error } = await supabase.auth.updateUser({ email: emailNew.trim() })
    setEmailLoading(false)

    if (error) {
      setEmailError(error.message)
      return
    }

    resetEmailForm()
    closePanel()
    setEmailNotice(`Check ${emailNew.trim()} for a confirmation link to finish updating your email.`)
  }

  const handlePasswordSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setPasswordError(null)
    setPasswordNotice(null)

    if (!isPasswordValid(passwordNew)) {
      setPasswordError('Please meet all password requirements.')
      return
    }

    if (passwordNew !== passwordConfirm) {
      setPasswordError('Passwords do not match.')
      return
    }

    setPasswordLoading(true)
    const { error: updateError } = await supabase.auth.updateUser({ password: passwordNew })
    if (updateError) {
      setPasswordLoading(false)
      setPasswordError(updateError.message)
      return
    }

    const emailed = await sendConfirmationEmail()
    setPasswordLoading(false)
    resetPasswordForm()
    closePanel()
    setPasswordNotice(
      emailed
        ? 'Password updated. A confirmation email has been sent to your inbox.'
        : 'Password updated.',
    )
  }

  const handleAccountDeleted = async () => {
    navigate('/', { replace: true })
    await signOut()
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)', color: 'var(--foreground)' }}>
      <AppHeader />

      <main className="animate-fade-down" style={{ maxWidth: 680, margin: '0 auto', padding: '48px 24px 80px' }}>
        <Link
          to="/dashboard"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontFamily: 'var(--font-inter)',
            fontSize: '0.85rem',
            color: 'var(--muted-foreground)',
            textDecoration: 'none',
            marginBottom: 18,
          }}
        >
          ← Back to dashboard
        </Link>

        <h1
          style={{
            fontFamily: 'var(--font-inter)',
            fontWeight: 800,
            fontSize: 'clamp(1.6rem, 4vw, 2.1rem)',
            letterSpacing: '-0.03em',
            marginBottom: 8,
          }}
        >
          Settings
        </h1>
        <p
          style={{
            fontFamily: 'var(--font-inter)',
            fontSize: '0.95rem',
            color: 'var(--muted-foreground)',
            marginBottom: 28,
          }}
        >
          Manage your account details.
        </p>

        <section style={sectionStyle}>
          <h2 style={sectionTitleStyle}>Username</h2>
          <p style={sectionHintStyle}>Your public handle across SentinelAI.</p>
          <div style={valueStyle}>{currentUsername || '—'}</div>
          {usernameNotice && <div style={{ ...s.successBox, marginTop: 14, marginBottom: 0 }}>{usernameNotice}</div>}
          <button
            type="button"
            onClick={() => togglePanel('username')}
            style={{ ...actionButtonStyle, marginTop: 14 }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--primary)')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
          >
            {activePanel === 'username' ? 'Cancel' : 'Change username'}
          </button>
          <SettingsPanel open={activePanel === 'username'}>
            <form onSubmit={handleUsernameSubmit}>
              {usernameError && <div style={s.errorBox}>{usernameError}</div>}
              <p style={{ ...sectionHintStyle, marginBottom: 14 }}>
                Max {USERNAME_MAX_LENGTH} characters, no spaces.
              </p>
              <div style={{ marginBottom: 14 }}>
                <label htmlFor="username-old" style={s.label}>
                  Current username
                </label>
                <input
                  id="username-old"
                  type="text"
                  value={usernameOld}
                  onChange={(e) => setUsernameOld(e.target.value)}
                  maxLength={USERNAME_MAX_LENGTH}
                  style={s.input}
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label htmlFor="username-new" style={s.label}>
                  New username
                </label>
                <input
                  id="username-new"
                  type="text"
                  value={usernameNew}
                  onChange={(e) => setUsernameNew(e.target.value)}
                  maxLength={USERNAME_MAX_LENGTH}
                  style={s.input}
                />
              </div>
              <button
                type="submit"
                disabled={usernameLoading}
                style={{ ...actionButtonStyle, opacity: usernameLoading ? 0.6 : 1 }}
              >
                {usernameLoading ? 'Saving…' : 'Save username'}
              </button>
            </form>
          </SettingsPanel>
        </section>

        <section style={sectionStyle}>
          <h2 style={sectionTitleStyle}>Email</h2>
          <p style={sectionHintStyle}>Used to sign in and receive account notifications.</p>
          <div style={valueStyle}>{currentEmail || '—'}</div>
          {emailNotice && <div style={{ ...s.successBox, marginTop: 14, marginBottom: 0 }}>{emailNotice}</div>}
          <button
            type="button"
            onClick={() => togglePanel('email')}
            style={{ ...actionButtonStyle, marginTop: 14 }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--primary)')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
          >
            {activePanel === 'email' ? 'Cancel' : 'Change email address'}
          </button>
          <SettingsPanel open={activePanel === 'email'}>
            <form onSubmit={handleEmailSubmit}>
              {emailError && <div style={s.errorBox}>{emailError}</div>}
              <p style={{ ...sectionHintStyle, marginBottom: 14 }}>
                Enter your current email and the new address. We&apos;ll send a confirmation link to the new email.
              </p>
              <div style={{ marginBottom: 14 }}>
                <label htmlFor="email-old" style={s.label}>
                  Current email
                </label>
                <input
                  id="email-old"
                  type="text"
                  value={emailOld}
                  onChange={(e) => setEmailOld(e.target.value)}
                  placeholder={currentEmail}
                  style={s.input}
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label htmlFor="email-new" style={s.label}>
                  New email
                </label>
                <input
                  id="email-new"
                  type="text"
                  value={emailNew}
                  onChange={(e) => setEmailNew(e.target.value)}
                  style={s.input}
                />
              </div>
              <button
                type="submit"
                disabled={emailLoading}
                style={{ ...actionButtonStyle, opacity: emailLoading ? 0.6 : 1 }}
              >
                {emailLoading ? 'Saving…' : 'Save email'}
              </button>
            </form>
          </SettingsPanel>
        </section>

        <section style={sectionStyle}>
          <h2 style={sectionTitleStyle}>Password</h2>
          <p style={sectionHintStyle}>Keep your account secure with a strong password.</p>
          {passwordNotice && <div style={{ ...s.successBox, marginTop: 14, marginBottom: 0 }}>{passwordNotice}</div>}
          <button
            type="button"
            onClick={() => togglePanel('password')}
            style={{ ...actionButtonStyle, marginTop: 14 }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--primary)')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
          >
            {activePanel === 'password' ? 'Cancel' : 'Change password'}
          </button>
          <SettingsPanel open={activePanel === 'password'}>
            <form onSubmit={handlePasswordSubmit}>
              {passwordError && <div style={s.errorBox}>{passwordError}</div>}
              <div style={{ marginBottom: 14 }}>
                <label htmlFor="password-new" style={s.label}>
                  New password
                </label>
                <input
                  id="password-new"
                  type="password"
                  value={passwordNew}
                  onChange={(e) => setPasswordNew(e.target.value)}
                  style={s.input}
                />
                <PasswordRequirements password={passwordNew} />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label htmlFor="password-confirm" style={s.label}>
                  Confirm password
                </label>
                <input
                  id="password-confirm"
                  type="password"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  style={{
                    ...s.input,
                    borderColor:
                      passwordConfirm && passwordConfirm !== passwordNew
                        ? 'rgba(255, 95, 95, 0.45)'
                        : 'var(--border)',
                  }}
                />
              </div>
              <button
                type="submit"
                disabled={
                  passwordLoading ||
                  !isPasswordValid(passwordNew) ||
                  !passwordConfirm ||
                  passwordNew !== passwordConfirm
                }
                style={{ ...actionButtonStyle, opacity: passwordLoading ? 0.6 : 1 }}
              >
                {passwordLoading ? 'Saving…' : 'Save password'}
              </button>
            </form>
          </SettingsPanel>
        </section>

        <section
          style={{
            ...sectionStyle,
            borderColor: 'rgba(255, 95, 95, 0.25)',
            background: 'rgba(255, 95, 95, 0.04)',
          }}
        >
          <h2 style={{ ...sectionTitleStyle, color: '#ff8a8a' }}>Delete account</h2>
          <p style={sectionHintStyle}>
            Permanently delete your account, projects, and runbooks. You&apos;ll need to type{' '}
            <code style={{ fontFamily: 'var(--font-jetbrains)', color: '#ff8a8a' }}>
              sudo delete {currentUsername || 'your-username'}
            </code>
            .
          </p>
          <button
            type="button"
            onClick={() => setShowDeleteModal(true)}
            disabled={!currentUsername}
            style={{
              fontFamily: 'var(--font-inter)',
              fontWeight: 600,
              fontSize: '0.875rem',
              color: '#fff',
              background: '#ff5f5f',
              border: 'none',
              borderRadius: 5,
              cursor: currentUsername ? 'pointer' : 'not-allowed',
              padding: '10px 16px',
              marginTop: 14,
              opacity: currentUsername ? 1 : 0.6,
            }}
          >
            Delete account
          </button>
        </section>
      </main>

      {showDeleteModal && currentUsername && (
        <DeleteAccountModal
          username={currentUsername}
          onClose={() => setShowDeleteModal(false)}
          onDeleted={handleAccountDeleted}
        />
      )}
    </div>
  )
}
