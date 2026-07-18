import {
  getPasswordRequirementStatus,
  getPasswordStrength,
  type PasswordStrength,
} from '../lib/passwordValidation'

const STRENGTH_COLORS: Record<PasswordStrength, string> = {
  bad: '#ff5f5f',
  okay: '#f5c542',
  good: 'var(--primary)',
}

const STRENGTH_LABELS: Record<PasswordStrength, string> = {
  bad: 'Weak',
  okay: 'Okay',
  good: 'Strong',
}

export default function PasswordRequirements({ password }: { password: string }) {
  const requirements = getPasswordRequirementStatus(password)
  const strength = getPasswordStrength(password)
  const metCount = requirements.filter((requirement) => requirement.met).length
  const meterWidth = password.length === 0 ? 0 : Math.max(8, (metCount / requirements.length) * 100)

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span
          style={{
            fontFamily: 'var(--font-inter)',
            fontSize: '0.74rem',
            fontWeight: 600,
            color: 'var(--muted-foreground)',
          }}
        >
          Password strength
        </span>
        <span
          style={{
            fontFamily: 'var(--font-jetbrains)',
            fontSize: '0.68rem',
            fontWeight: 600,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            color: STRENGTH_COLORS[strength],
          }}
        >
          {password.length === 0 ? '—' : STRENGTH_LABELS[strength]}
        </span>
      </div>

      <div
        aria-hidden
        style={{
          width: '100%',
          height: 5,
          borderRadius: 999,
          background: 'var(--muted)',
          border: '1px solid var(--border)',
          overflow: 'hidden',
          marginBottom: 14,
        }}
      >
        <div
          style={{
            width: `${meterWidth}%`,
            height: '100%',
            borderRadius: 999,
            background: STRENGTH_COLORS[strength],
            transition: 'width 0.2s ease, background-color 0.2s ease',
          }}
        />
      </div>

      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 7,
        }}
      >
        {requirements.map((requirement) => (
          <li
            key={requirement.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontFamily: 'var(--font-inter)',
              fontSize: '0.78rem',
              color: requirement.met ? 'var(--primary)' : 'var(--muted-foreground)',
              transition: 'color 0.15s ease',
            }}
          >
            <RequirementIcon met={requirement.met} />
            {requirement.label}
          </li>
        ))}
      </ul>
    </div>
  )
}

function RequirementIcon({ met }: { met: boolean }) {
  if (met) {
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden style={{ flexShrink: 0 }}>
        <circle cx="8" cy="8" r="7" stroke="var(--primary)" strokeWidth="1.2" />
        <path
          d="M5 8.2l2 2 4.2-4.4"
          stroke="var(--primary)"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }

  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden style={{ flexShrink: 0 }}>
      <circle cx="8" cy="8" r="7" stroke="#ff5f5f" strokeWidth="1.2" />
      <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="#ff5f5f" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}
