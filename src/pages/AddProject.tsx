import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { validateRunbookFile } from '../lib/api'
import * as s from '../components/authStyles'

const RUNBOOK_REQUIRED_SECTIONS = [
  'How to set up and run the service',
  'How to test or verify that it works',
  'What common errors or symptoms to look for',
  'What action to take for each error',
] as const

type RunbookFileError = {
  fileName: string
  missingSections: string[]
}

export default function AddProject() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { id } = useParams<{ id: string }>()
  const isEditing = Boolean(id)

  const [name, setName] = useState('')
  const [githubRepo, setGithubRepo] = useState('')
  const [slackWebhook, setSlackWebhook] = useState('')
  // Existing runbook storage paths (edit mode) that the user wants to keep.
  const [existingRunbooks, setExistingRunbooks] = useState<string[]>([])
  // Newly selected files to upload on save.
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState<string | null>(null)
  const [runbookErrors, setRunbookErrors] = useState<RunbookFileError[]>([])
  const [validatingRunbooks, setValidatingRunbooks] = useState(false)
  const [saving, setSaving] = useState(false)
  // When editing, load the existing project's values before showing the form.
  const [initializing, setInitializing] = useState(isEditing)

  useEffect(() => {
    if (!id) return
    let active = true

    async function loadProject() {
      const { data, error } = await supabase.from('projects').select('*').eq('id', id).single()
      if (!active) return
      if (error) {
        setError(error.message)
      } else if (data) {
        setName(data.name ?? '')
        setGithubRepo(data.github_repo ?? '')
        setSlackWebhook(data.slack_webhook ?? '')
        setExistingRunbooks(
          (data.runbooks ?? '')
            .split(/\n+/)
            .map((r: string) => r.trim())
            .filter(Boolean),
        )
      }
      setInitializing(false)
    }

    loadProject()
    return () => {
      active = false
    }
  }, [id])

  const isAllowed = (fileName: string) => /\.(md|pdf)$/i.test(fileName)

  const validateFiles = async (candidates: File[]): Promise<{ accepted: File[]; rejected: RunbookFileError[] }> => {
    const accepted: File[] = []
    const rejected: RunbookFileError[] = []

    for (const file of candidates) {
      try {
        const result = await validateRunbookFile(file)
        if (result.valid) {
          accepted.push(file)
        } else {
          rejected.push({ fileName: file.name, missingSections: result.missing_sections })
        }
      } catch (err) {
        rejected.push({
          fileName: file.name,
          missingSections: [
            err instanceof Error
              ? err.message
              : 'Runbook validation failed. Is the backend running?',
          ],
        })
      }
    }

    return { accepted, rejected }
  }

  const handleFilesSelected = async (list: FileList | null) => {
    if (!list) return
    const picked = Array.from(list)
    const allowed = picked.filter((f) => isAllowed(f.name))
    if (allowed.length !== picked.length) {
      setError('Only .md or .pdf files are allowed.')
      return
    }

    setError(null)
    setValidatingRunbooks(true)
    const { accepted, rejected } = await validateFiles(allowed)
    setValidatingRunbooks(false)

    if (accepted.length) {
      setFiles((prev) => [...prev, ...accepted])
    }
    setRunbookErrors(rejected)
  }

  const removeExisting = (index: number) => setExistingRunbooks((prev) => prev.filter((_, i) => i !== index))
  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
    setRunbookErrors([])
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!isSupabaseConfigured) {
      setError('Supabase is not configured yet. Add your credentials to .env.local and restart the dev server.')
      return
    }
    if (!user) {
      setError('You must be signed in to save a project.')
      return
    }
    if (!name.trim() || !githubRepo.trim() || !slackWebhook.trim()) {
      setError('Project name, GitHub repo, and Slack webhook are all required.')
      return
    }
    if (existingRunbooks.length + files.length === 0) {
      setError('Please upload at least one runbook (.md or .pdf).')
      return
    }
    if (runbookErrors.length > 0) {
      return
    }

    setSaving(true)

    // Re-validate before upload so stale files cannot slip through.
    const { accepted, rejected } = await validateFiles(files)
    if (rejected.length > 0) {
      setRunbookErrors(rejected)
      setFiles(accepted)
      setSaving(false)
      return
    }

    // Upload any newly selected files to the private "runbooks" storage bucket,
    // under a per-user folder so Storage RLS keeps them isolated per account.
    const uploadedPaths: string[] = []
    for (const file of files) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${user.id}/${crypto.randomUUID()}/${safeName}`
      const { error: uploadError } = await supabase.storage
        .from('runbooks')
        .upload(path, file, { contentType: file.type || undefined, upsert: false })
      if (uploadError) {
        setError(`Failed to upload ${file.name}: ${uploadError.message}`)
        setSaving(false)
        return
      }
      uploadedPaths.push(path)
    }

    const runbookPaths = [...existingRunbooks, ...uploadedPaths]
    const payload = {
      name: name.trim(),
      github_repo: githubRepo.trim() || null,
      slack_webhook: slackWebhook.trim() || null,
      runbooks: runbookPaths.join('\n') || null,
    }

    const { error } = isEditing
      ? await supabase
          .from('projects')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', id)
      : await supabase.from('projects').insert({ user_id: user.id, ...payload })
    setSaving(false)

    if (error) {
      setError(error.message)
      return
    }
    navigate('/dashboard')
  }

  const baseName = (path: string) => path.split('/').pop() || path

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)', color: 'var(--foreground)' }}>
      {/* Top bar */}
      <header
        className="flex items-center justify-between px-6 md:px-10"
        style={{
          height: 64,
          borderBottom: '1px solid var(--border)',
          background: 'rgba(6,10,6,0.85)',
          backdropFilter: 'blur(12px)',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <Link to="/dashboard" className="flex items-center gap-2.5" style={{ textDecoration: 'none' }}>
          <div
            className="flex items-center justify-center"
            style={{ width: 28, height: 28, background: 'var(--primary)', borderRadius: 4 }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 1L14 4.5V11.5L8 15L2 11.5V4.5L8 1Z" stroke="#060a06" strokeWidth="1.5" fill="none" />
              <circle cx="8" cy="8" r="2" fill="#060a06" />
            </svg>
          </div>
          <span
            style={{
              fontFamily: 'var(--font-inter)',
              fontWeight: 700,
              fontSize: '1.05rem',
              letterSpacing: '-0.02em',
              color: 'var(--foreground)',
            }}
          >
            SentinelAI
          </span>
        </Link>
      </header>

      {/* Content */}
      <main className="animate-fade-down" style={{ maxWidth: 620, margin: '0 auto', padding: '40px 24px 80px' }}>
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
            marginBottom: 22,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M10 3.5L5.5 8L10 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back to dashboard
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
          {isEditing ? 'Edit project' : 'New project'}
        </h1>
        <p
          style={{
            fontFamily: 'var(--font-inter)',
            fontSize: '0.95rem',
            color: 'var(--muted-foreground)',
            marginBottom: 34,
          }}
        >
          Connect a service for Sentinel to watch. All fields are required.
        </p>

        {initializing ? (
          <div
            style={{
              fontFamily: 'var(--font-jetbrains)',
              fontSize: '0.85rem',
              color: 'var(--muted-foreground)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '28px 20px',
              textAlign: 'center',
            }}
          >
            Loading project…
          </div>
        ) : (
        <form onSubmit={handleSubmit}>
          {error && <div style={s.errorBox}>{error}</div>}

          <div style={{ marginBottom: 20 }}>
            <label htmlFor="name" style={s.label}>
              Project name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Production API"
              required
              style={s.input}
              onFocus={(e) => (e.target.style.borderColor = 'var(--primary)')}
              onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label htmlFor="github" style={s.label}>
              GitHub repository
            </label>
            <input
              id="github"
              type="text"
              value={githubRepo}
              onChange={(e) => setGithubRepo(e.target.value)}
              placeholder="https://github.com/your-org/your-repo"
              required
              style={s.input}
              onFocus={(e) => (e.target.style.borderColor = 'var(--primary)')}
              onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label htmlFor="slack" style={s.label}>
              Slack webhook
            </label>
            <input
              id="slack"
              type="text"
              value={slackWebhook}
              onChange={(e) => setSlackWebhook(e.target.value)}
              placeholder="https://hooks.slack.com/services/..."
              required
              style={s.input}
              onFocus={(e) => (e.target.style.borderColor = 'var(--primary)')}
              onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
            />
            <p
              style={{
                marginTop: 8,
                fontFamily: 'var(--font-inter)',
                fontSize: '0.8rem',
                color: 'var(--muted-foreground)',
                lineHeight: 1.45,
              }}
            >
              Get your Incoming Webhook URL from{' '}
              <a
                href="https://api.slack.com/apps"
                target="_blank"
                rel="noreferrer"
                style={{ color: 'var(--primary)', textDecoration: 'none' }}
                onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
                onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
              >
                api.slack.com/apps
              </a>
              .
            </p>
          </div>

          <div style={{ marginBottom: 28 }}>
            <label htmlFor="runbook-files" style={s.label}>
              Runbooks
            </label>

            <div
              style={{
                marginBottom: 14,
                background: 'rgba(0,214,143,0.05)',
                border: '1px solid rgba(0,214,143,0.18)',
                borderRadius: 8,
                padding: '14px 16px',
              }}
            >
              <div
                style={{
                  fontFamily: 'var(--font-inter)',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  color: 'var(--foreground)',
                  marginBottom: 10,
                }}
              >
                Each runbook must include these required sections:
              </div>
              <ul
                style={{
                  margin: 0,
                  paddingLeft: 18,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  listStyleType: 'disc',
                }}
              >
                {RUNBOOK_REQUIRED_SECTIONS.map((section) => (
                  <li
                    key={section}
                    style={{
                      fontFamily: 'var(--font-inter)',
                      fontSize: '0.82rem',
                      color: 'var(--muted-foreground)',
                      lineHeight: 1.45,
                    }}
                  >
                    <span style={{ color: 'var(--foreground)', fontWeight: 600 }}>{section}</span>
                  </li>
                ))}
              </ul>
            </div>

            {runbookErrors.length > 0 && (
              <div
                style={{
                  marginBottom: 14,
                  background: '#c62828',
                  color: '#ffffff',
                  borderRadius: 8,
                  padding: '14px 16px',
                }}
              >
                {runbookErrors.map((item) => (
                  <div key={item.fileName} style={{ marginBottom: runbookErrors.length > 1 ? 14 : 0 }}>
                    <div
                      style={{
                        fontFamily: 'var(--font-inter)',
                        fontSize: '0.88rem',
                        fontWeight: 700,
                        marginBottom: 8,
                      }}
                    >
                      {item.fileName} is missing required sections:
                    </div>
                    <ul
                      style={{
                        margin: 0,
                        paddingLeft: 18,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                        listStyleType: 'disc',
                      }}
                    >
                      {item.missingSections.map((section) => (
                        <li
                          key={section}
                          style={{
                            fontFamily: 'var(--font-inter)',
                            fontSize: '0.84rem',
                            lineHeight: 1.45,
                          }}
                        >
                          {section}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}

            {validatingRunbooks && (
              <div
                style={{
                  marginBottom: 14,
                  fontFamily: 'var(--font-jetbrains)',
                  fontSize: '0.8rem',
                  color: 'var(--muted-foreground)',
                }}
              >
                Validating runbook sections…
              </div>
            )}

            {/* Upload dropzone */}
            <label
              htmlFor="runbook-files"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                textAlign: 'center',
                cursor: 'pointer',
                background: 'var(--background)',
                border: '1px dashed var(--border)',
                borderRadius: 8,
                padding: '26px 20px',
                transition: 'border-color 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--primary)')}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
            >
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none" style={{ color: 'var(--primary)' }}>
                <path d="M11 14V4M7 8l4-4 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M4 14v3a1 1 0 001 1h12a1 1 0 001-1v-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              <span style={{ fontFamily: 'var(--font-inter)', fontSize: '0.9rem', fontWeight: 600, color: 'var(--foreground)' }}>
                Upload runbooks
              </span>
              <span style={{ fontFamily: 'var(--font-inter)', fontSize: '0.8rem', color: 'var(--muted-foreground)' }}>
                Click to browse — .md or .pdf files only (both are validated)
              </span>
            </label>
            <input
              id="runbook-files"
              type="file"
              accept=".md,.pdf,text/markdown,application/pdf"
              multiple
              onChange={(e) => {
                handleFilesSelected(e.target.files)
                e.target.value = ''
              }}
              style={{ display: 'none' }}
            />

            {/* Selected / existing files */}
            {(existingRunbooks.length > 0 || files.length > 0) && (
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {existingRunbooks.map((path, i) => (
                  <FileRow key={`existing-${i}`} name={baseName(path)} onRemove={() => removeExisting(i)} />
                ))}
                {files.map((file, i) => (
                  <FileRow key={`new-${i}`} name={file.name} isNew onRemove={() => removeFile(i)} />
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="submit"
              disabled={saving || validatingRunbooks || runbookErrors.length > 0}
              style={{
                ...s.primaryButton,
                width: 'auto',
                opacity: saving ? 0.6 : 1,
                cursor: saving ? 'default' : 'pointer',
              }}
              onMouseEnter={(e) => !saving && (e.currentTarget.style.opacity = '0.85')}
              onMouseLeave={(e) => !saving && (e.currentTarget.style.opacity = '1')}
            >
              {saving ? 'Saving…' : isEditing ? 'Save changes' : 'Create project'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              style={{
                fontFamily: 'var(--font-inter)',
                fontWeight: 600,
                fontSize: '0.925rem',
                color: 'var(--foreground)',
                background: 'transparent',
                border: '1px solid var(--border)',
                cursor: 'pointer',
                padding: '12px 20px',
                borderRadius: 5,
                transition: 'border-color 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--primary)')}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
            >
              Cancel
            </button>
          </div>
        </form>
        )}
      </main>
    </div>
  )
}

function FileRow({ name, onRemove, isNew }: { name: string; onRemove: () => void; isNew?: boolean }) {
  const isPdf = /\.pdf$/i.test(name)
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: '10px 12px',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', color: 'var(--primary)', flexShrink: 0 }}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M4 2h5l3 3v9H4z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
          <path d="M9 2v3h3" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        </svg>
      </span>
      <span
        style={{
          flex: 1,
          minWidth: 0,
          fontFamily: 'var(--font-jetbrains)',
          fontSize: '0.82rem',
          color: 'var(--foreground)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {name}
      </span>
      <span
        style={{
          fontFamily: 'var(--font-jetbrains)',
          fontSize: '0.6rem',
          fontWeight: 600,
          letterSpacing: '0.06em',
          color: 'var(--muted-foreground)',
          border: '1px solid var(--border)',
          borderRadius: 3,
          padding: '1px 5px',
          flexShrink: 0,
        }}
      >
        {isPdf ? 'PDF' : 'MD'}
        {isNew ? ' · NEW' : ''}
      </span>
      <button
        type="button"
        aria-label={`Remove ${name}`}
        title="Remove"
        onClick={onRemove}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 26,
          height: 26,
          color: 'var(--muted-foreground)',
          background: 'transparent',
          border: '1px solid var(--border)',
          borderRadius: 5,
          cursor: 'pointer',
          flexShrink: 0,
          transition: 'color 0.15s, border-color 0.15s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = '#ff5f5f'
          e.currentTarget.style.borderColor = '#ff5f5f'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = 'var(--muted-foreground)'
          e.currentTarget.style.borderColor = 'var(--border)'
        }}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )
}
