import type { CSSProperties } from 'react'

export const label: CSSProperties = {
  display: 'block',
  fontFamily: 'var(--font-inter)',
  fontSize: '0.8rem',
  fontWeight: 600,
  color: 'var(--foreground)',
  marginBottom: 7,
}

export const input: CSSProperties = {
  width: '100%',
  fontFamily: 'var(--font-inter)',
  fontSize: '0.9rem',
  color: 'var(--foreground)',
  background: 'var(--background)',
  border: '1px solid var(--border)',
  borderRadius: 5,
  padding: '11px 14px',
  outline: 'none',
  transition: 'border-color 0.15s',
}

export const primaryButton: CSSProperties = {
  width: '100%',
  fontFamily: 'var(--font-inter)',
  fontWeight: 700,
  fontSize: '0.925rem',
  color: 'var(--primary-foreground)',
  background: 'var(--primary)',
  border: 'none',
  cursor: 'pointer',
  padding: '12px 20px',
  borderRadius: 5,
  transition: 'opacity 0.15s',
}

export const errorBox: CSSProperties = {
  fontFamily: 'var(--font-inter)',
  fontSize: '0.82rem',
  lineHeight: 1.5,
  color: '#ff8a8a',
  background: 'rgba(255,95,95,0.08)',
  border: '1px solid rgba(255,95,95,0.25)',
  borderRadius: 5,
  padding: '10px 12px',
  marginBottom: 16,
}

export const successBox: CSSProperties = {
  fontFamily: 'var(--font-inter)',
  fontSize: '0.82rem',
  lineHeight: 1.5,
  color: 'var(--primary)',
  background: 'rgba(0,214,143,0.08)',
  border: '1px solid rgba(0,214,143,0.25)',
  borderRadius: 5,
  padding: '10px 12px',
  marginBottom: 16,
}

export const authLink: CSSProperties = {
  color: 'var(--primary)',
  fontWeight: 600,
  textDecoration: 'none',
}
