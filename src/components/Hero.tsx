import { useEffect, useState } from 'react'

const terminalLines = [
  { delay: 0,    text: '$ sentinel scan --env production', type: 'cmd' },
  { delay: 600,  text: '[00:00.1s] Connecting to Datadog, PagerDuty, CloudWatch...', type: 'info' },
  { delay: 1200, text: '[00:00.4s] Anomaly detected — p99 latency spike +640ms', type: 'warn' },
  { delay: 1800, text: '[00:00.9s] Correlating 847 log lines across 12 services', type: 'info' },
  { delay: 2400, text: '[00:01.3s] Root cause identified: db-replica-3 OOM kill', type: 'error' },
  { delay: 3000, text: '[00:01.7s] Suggested fix: Scale replica group +2 nodes', type: 'success' },
  { delay: 3600, text: '[00:02.1s] Runbook generated — incident resolved in 2.1s', type: 'success' },
]

export default function Hero() {
  const [visibleLines, setVisibleLines] = useState<number>(0)

  useEffect(() => {
    const timers = terminalLines.map((line, i) =>
      setTimeout(() => setVisibleLines(i + 1), line.delay + 800)
    )
    return () => timers.forEach(clearTimeout)
  }, [])

  const typeColor = (type: string) => {
    if (type === 'cmd') return '#e2f0e2'
    if (type === 'warn') return '#f0c040'
    if (type === 'error') return '#ff5f5f'
    if (type === 'success') return '#00d68f'
    return '#5a7a5a'
  }

  return (
    <section
      className="relative flex flex-col items-center justify-center text-center px-6"
      style={{
        paddingTop: 'calc(64px + 80px)',
        paddingBottom: 100,
        minHeight: '100vh',
        overflow: 'hidden',
      }}
    >
      {/* Grid background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(rgba(0,214,143,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,214,143,0.04) 1px, transparent 1px)
          `,
          backgroundSize: '48px 48px',
        }}
      />
      {/* Radial glow */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: '30%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 700,
          height: 700,
          background: 'radial-gradient(ellipse at center, rgba(0,214,143,0.08) 0%, transparent 70%)',
          borderRadius: '50%',
        }}
      />

      <div className="relative z-10 flex flex-col items-center max-w-4xl">
        {/* Badge */}
        <div
          className="inline-flex items-center gap-2 mb-6"
          style={{
            background: 'rgba(0,214,143,0.08)',
            border: '1px solid rgba(0,214,143,0.25)',
            borderRadius: 20,
            padding: '6px 14px',
          }}
        >
          <span
            style={{
              display: 'inline-block',
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: 'var(--primary)',
              boxShadow: '0 0 6px var(--primary)',
            }}
          />
          <span
            style={{
              fontFamily: 'var(--font-jetbrains)',
              fontSize: '0.75rem',
              fontWeight: 500,
              color: 'var(--primary)',
              letterSpacing: '0.05em',
            }}
          >
            NOW IN BETA — AI-POWERED SRE
          </span>
        </div>

        {/* Headline */}
        <h1
          style={{
            fontFamily: 'var(--font-inter)',
            fontWeight: 900,
            fontSize: 'clamp(2.4rem, 7vw, 5rem)',
            lineHeight: 1.05,
            letterSpacing: '-0.04em',
            color: 'var(--foreground)',
            marginBottom: 24,
          }}
        >
          Your incidents,
          <br />
          <span style={{ color: 'var(--primary)' }}>resolved in seconds.</span>
        </h1>

        {/* Subhead */}
        <p
          style={{
            fontFamily: 'var(--font-inter)',
            fontWeight: 400,
            fontSize: 'clamp(1rem, 2.5vw, 1.2rem)',
            lineHeight: 1.65,
            color: 'var(--muted-foreground)',
            maxWidth: 560,
            marginBottom: 40,
          }}
        >
          SentinelAI is the autonomous AI SRE agent that detects, investigates, and resolves production incidents — before your on-call engineer even opens their laptop.
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row gap-3 mb-16">
          <button
            style={{
              fontFamily: 'var(--font-inter)',
              fontWeight: 700,
              fontSize: '0.95rem',
              color: 'var(--primary-foreground)',
              background: 'var(--primary)',
              border: 'none',
              cursor: 'pointer',
              padding: '14px 32px',
              borderRadius: 4,
              letterSpacing: '-0.01em',
              transition: 'opacity 0.15s, transform 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = '0.88'
              e.currentTarget.style.transform = 'translateY(-1px)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = '1'
              e.currentTarget.style.transform = 'translateY(0)'
            }}
          >
            Get started for free
          </button>
          <button
            style={{
              fontFamily: 'var(--font-inter)',
              fontWeight: 600,
              fontSize: '0.95rem',
              color: 'var(--foreground)',
              background: 'transparent',
              border: '1px solid var(--border)',
              cursor: 'pointer',
              padding: '14px 32px',
              borderRadius: 4,
              letterSpacing: '-0.01em',
              transition: 'border-color 0.15s, transform 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--primary)'
              e.currentTarget.style.transform = 'translateY(-1px)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border)'
              e.currentTarget.style.transform = 'translateY(0)'
            }}
          >
            Watch 2-min demo →
          </button>
        </div>

        {/* Terminal */}
        <div
          style={{
            width: '100%',
            maxWidth: 680,
            background: '#0a0f0a',
            border: '1px solid var(--border)',
            borderRadius: 8,
            overflow: 'hidden',
            textAlign: 'left',
            boxShadow: '0 0 60px rgba(0,214,143,0.07)',
          }}
        >
          {/* Terminal header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 16px',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f57' }} />
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#febc2e' }} />
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#28c840' }} />
            <span
              style={{
                fontFamily: 'var(--font-jetbrains)',
                fontSize: '0.72rem',
                color: 'var(--muted-foreground)',
                marginLeft: 8,
                letterSpacing: '0.05em',
              }}
            >
              sentinel — production
            </span>
          </div>
          {/* Terminal body */}
          <div style={{ padding: '20px 20px 24px', minHeight: 200 }}>
            {terminalLines.slice(0, visibleLines).map((line, i) => (
              <div
                key={i}
                style={{
                  fontFamily: 'var(--font-jetbrains)',
                  fontSize: '0.82rem',
                  lineHeight: 1.7,
                  color: typeColor(line.type),
                  animation: 'fadeIn 0.2s ease',
                }}
              >
                {line.text}
              </div>
            ))}
            {visibleLines < terminalLines.length && (
              <span
                style={{
                  fontFamily: 'var(--font-jetbrains)',
                  fontSize: '0.82rem',
                  color: 'var(--primary)',
                  animation: 'blink 1s step-end infinite',
                }}
              >
                █
              </span>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
      `}</style>
    </section>
  )
}
