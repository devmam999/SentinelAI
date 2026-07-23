import { useState } from 'react'
import { reviewProjectEditRequest, type ProjectEditRequest } from '../lib/projectTeam'

type ProjectEditRequestsSectionProps = {
  requests: ProjectEditRequest[]
  onReviewed: () => Promise<void>
}

export default function ProjectEditRequestsSection({ requests, onReviewed }: ProjectEditRequestsSectionProps) {
  const [error, setError] = useState<string | null>(null)
  const [actingId, setActingId] = useState<string | null>(null)

  const handleReview = async (requestId: string, approve: boolean) => {
    setError(null)
    setActingId(requestId)
    const { error: reviewError } = await reviewProjectEditRequest(requestId, approve)
    setActingId(null)
    if (reviewError) {
      setError(reviewError)
      return
    }
    await onReviewed()
  }

  if (requests.length === 0) return null

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <span style={{ fontFamily: 'var(--font-inter)', fontWeight: 700, fontSize: '1.05rem' }}>
          Pending edit requests
        </span>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      </div>

      {error && (
        <div
          style={{
            fontFamily: 'var(--font-inter)',
            fontSize: '0.88rem',
            color: '#ff8a8a',
            background: 'rgba(255,95,95,0.08)',
            border: '1px solid rgba(255,95,95,0.25)',
            borderRadius: 8,
            padding: '12px 14px',
            marginBottom: 12,
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {requests.map((request) => (
          <div
            key={request.id}
            style={{
              background: 'var(--card)',
              border: '1px solid rgba(0,214,143,0.18)',
              borderRadius: 10,
              padding: '16px 18px',
            }}
          >
            <div style={{ fontFamily: 'var(--font-inter)', fontWeight: 700, fontSize: '0.92rem', marginBottom: 6 }}>
              {request.name}
            </div>
            <div
              style={{
                fontFamily: 'var(--font-jetbrains)',
                fontSize: '0.72rem',
                color: 'var(--muted-foreground)',
                marginBottom: 12,
              }}
            >
              Requested by {request.requester_username || 'admin'}
            </div>
            <div style={{ display: 'grid', gap: 6, marginBottom: 14 }}>
              <EditField label="GitHub" value={request.github_repo} />
              <EditField label="Slack" value={request.slack_webhook} />
              <EditField label="Runbooks" value={request.runbooks} />
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => handleReview(request.id, true)}
                disabled={actingId === request.id}
                style={approveButtonStyle}
              >
                Approve changes
              </button>
              <button
                type="button"
                onClick={() => handleReview(request.id, false)}
                disabled={actingId === request.id}
                style={declineButtonStyle}
              >
                Decline
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function EditField({ label, value }: { label: string; value: string | null }) {
  return (
    <div style={{ fontFamily: 'var(--font-inter)', fontSize: '0.84rem', lineHeight: 1.45 }}>
      <span style={{ color: 'var(--muted-foreground)', fontWeight: 600 }}>{label}: </span>
      <span style={{ color: 'var(--foreground)' }}>{value || '—'}</span>
    </div>
  )
}

const approveButtonStyle: React.CSSProperties = {
  fontFamily: 'var(--font-inter)',
  fontWeight: 700,
  fontSize: '0.82rem',
  color: 'var(--primary-foreground)',
  background: 'var(--primary)',
  border: 'none',
  borderRadius: 5,
  cursor: 'pointer',
  padding: '8px 14px',
}

const declineButtonStyle: React.CSSProperties = {
  fontFamily: 'var(--font-inter)',
  fontWeight: 600,
  fontSize: '0.82rem',
  color: 'var(--foreground)',
  background: 'transparent',
  border: '1px solid var(--border)',
  borderRadius: 5,
  cursor: 'pointer',
  padding: '8px 14px',
}
