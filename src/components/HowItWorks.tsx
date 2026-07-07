import { useState } from 'react'

const steps = [
  {
    number: '01',
    title: 'Connect your tools',
    description: 'Connect GitHub and Slack, then upload your runbooks — so Sentinel knows your code, your channels, and your fixes.',
    tag: 'SETUP',
  },
  {
    number: '02',
    title: 'An alert fires — Sentinel responds',
    description: 'The instant a production alert fires, Sentinel jumps in automatically. No human trigger, no waiting for on-call.',
    tag: 'TRIGGER',
  },
  {
    number: '03',
    title: 'Sentinel investigates',
    description: 'It identifies the likely bad commit, finds the matching runbook, and estimates how many users are impacted.',
    tag: 'INVESTIGATION',
  },
  {
    number: '04',
    title: 'Slack brief now, postmortem after',
    description: 'Sentinel posts a clear incident brief to Slack, then auto-generates a full postmortem report once the issue is fixed.',
    tag: 'RESOLUTION',
  },
]

export default function HowItWorks() {
  return (
    <section id="how-it-works" style={{ padding: '100px 0', borderTop: '1px solid var(--border)', scrollMarginTop: 64 }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px' }}>
        <div className="flex flex-col md:flex-row gap-16">
          {/* Left: sticky label */}
          <div className="md:w-72 flex-shrink-0">
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
              How it works
            </span>
            <h2
              style={{
                fontFamily: 'var(--font-inter)',
                fontWeight: 800,
                fontSize: 'clamp(1.8rem, 4vw, 2.6rem)',
                letterSpacing: '-0.03em',
                lineHeight: 1.1,
                color: 'var(--foreground)',
                marginTop: 12,
              }}
            >
              From alert
              <br />to answer
              <br />in seconds.
            </h2>
          </div>

          {/* Right: steps */}
          <div className="flex-1 flex flex-col" style={{ gap: 0 }}>
            {steps.map((step, i) => (
              <StepRow key={i} step={step} isLast={i === steps.length - 1} />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function StepRow({ step, isLast }: { step: typeof steps[0]; isLast: boolean }) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        gap: 28,
        padding: '32px 0',
        borderBottom: isLast ? 'none' : '1px solid var(--border)',
        transition: 'background 0.15s',
        cursor: 'default',
      }}
    >
      {/* Number + line */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 40, flexShrink: 0 }}>
        <span
          style={{
            fontFamily: 'var(--font-jetbrains)',
            fontWeight: 700,
            fontSize: '0.75rem',
            color: hovered ? 'var(--primary)' : 'var(--muted-foreground)',
            letterSpacing: '0.05em',
            transition: 'color 0.2s',
          }}
        >
          {step.number}
        </span>
        {!isLast && (
          <div
            style={{
              width: 1,
              flex: 1,
              minHeight: 20,
              background: 'var(--border)',
              marginTop: 10,
            }}
          />
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <h3
            style={{
              fontFamily: 'var(--font-inter)',
              fontWeight: 700,
              fontSize: '1.05rem',
              color: 'var(--foreground)',
              letterSpacing: '-0.02em',
            }}
          >
            {step.title}
          </h3>
          <span
            style={{
              fontFamily: 'var(--font-jetbrains)',
              fontSize: '0.65rem',
              fontWeight: 600,
              letterSpacing: '0.1em',
              color: hovered ? 'var(--primary)' : 'var(--muted-foreground)',
              background: hovered ? 'rgba(0,214,143,0.1)' : 'var(--muted)',
              border: `1px solid ${hovered ? 'rgba(0,214,143,0.3)' : 'var(--border)'}`,
              borderRadius: 3,
              padding: '2px 7px',
              transition: 'all 0.2s',
            }}
          >
            {step.tag}
          </span>
        </div>
        <p
          style={{
            fontFamily: 'var(--font-inter)',
            fontSize: '0.9rem',
            lineHeight: 1.65,
            color: 'var(--muted-foreground)',
          }}
        >
          {step.description}
        </p>
      </div>
    </div>
  )
}

