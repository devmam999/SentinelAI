import { useState } from 'react'

const features = [
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <circle cx="11" cy="11" r="9" stroke="currentColor" strokeWidth="1.6"/>
        <path d="M11 6v5l3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
      </svg>
    ),
    label: 'On-Demand Investigation',
    description: 'When your on-call engineer manually fires an alert from the dashboard, Sentinel investigates immediately — no digging through logs or commit history by hand.',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <rect x="2" y="5" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="1.6"/>
        <path d="M6 9l3 3-3 3M12 15h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
      </svg>
    ),
    label: 'Likely Bad Commit',
    description: 'Diffs recent deploys and commits to pinpoint the specific change that most likely caused the outage.',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <path d="M5 3h9l3 3v13H5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
        <path d="M8 10h6M8 13.5h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
      </svg>
    ),
    label: 'Right Runbook, Instantly',
    description: 'Matches the incident to the correct runbook from your library, so the proven fix is already in hand.',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <path d="M11 20c4.97 0 9-4.03 9-9s-4.03-9-9-9-9 4.03-9 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
        <circle cx="11" cy="11" r="3.2" stroke="currentColor" strokeWidth="1.6"/>
      </svg>
    ),
    label: 'User Impact Estimates',
    description: 'Quantifies the blast radius — how many users are affected and how severely — so you can triage with confidence.',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <path d="M3 5a2 2 0 012-2h12a2 2 0 012 2v8a2 2 0 01-2 2H8l-4 4V5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
      </svg>
    ),
    label: 'Slack Incident Brief',
    description: 'Posts a concise, structured brief straight to Slack: what broke, the likely cause, user impact, and the suggested fix.',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <path d="M6 3h7l4 4v12H6z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
        <path d="M13 3v4h4" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
        <path d="M9 12l1.5 1.5L14 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    label: 'Auto-Generated Postmortem',
    description: 'Once the issue is fixed, Sentinel writes a complete postmortem report — timeline, root cause, impact, and follow-ups.',
  },
]

export default function Features() {
  return (
    <section id="features" style={{ padding: '100px 0', borderTop: '1px solid var(--border)', scrollMarginTop: 64 }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px' }}>
        {/* Section header */}
        <div className="mb-16" style={{ maxWidth: 560 }}>
          <span
            style={{
              fontFamily: 'var(--font-jetbrains)',
              fontSize: '0.72rem',
              fontWeight: 500,
              letterSpacing: '0.12em',
              color: 'var(--primary)',
              textTransform: 'uppercase',
            }}
          >
            Capabilities
          </span>
          <h2
            style={{
              fontFamily: 'var(--font-inter)',
              fontWeight: 800,
              fontSize: 'clamp(1.8rem, 4vw, 2.8rem)',
              letterSpacing: '-0.03em',
              lineHeight: 1.1,
              color: 'var(--foreground)',
              marginTop: 12,
            }}
          >
            Everything your SRE team does,
            <br />at machine speed.
          </h2>
        </div>

        {/* Feature grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 1,
            background: 'var(--border)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            overflow: 'hidden',
          }}
        >
          {features.map((f, i) => (
            <FeatureCard key={i} {...f} />
          ))}
        </div>
      </div>
    </section>
  )
}

function FeatureCard({ icon, label, description }: { icon: React.ReactNode; label: string; description: string }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? '#0d1a0d' : 'var(--card)',
        padding: '32px',
        transition: 'background 0.2s',
        cursor: 'default',
      }}
    >
      <div
        style={{
          color: hovered ? 'var(--primary)' : 'var(--muted-foreground)',
          marginBottom: 16,
          transition: 'color 0.2s',
        }}
      >
        {icon}
      </div>
      <h3
        style={{
          fontFamily: 'var(--font-inter)',
          fontWeight: 700,
          fontSize: '0.975rem',
          color: 'var(--foreground)',
          marginBottom: 8,
          letterSpacing: '-0.01em',
        }}
      >
        {label}
      </h3>
      <p
        style={{
          fontFamily: 'var(--font-inter)',
          fontSize: '0.875rem',
          lineHeight: 1.65,
          color: 'var(--muted-foreground)',
        }}
      >
        {description}
      </p>
    </div>
  )
}

