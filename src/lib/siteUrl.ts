/**
 * Public site origin for Supabase auth email links.
 *
 * Prefer the live browser origin so confirmation links always match where the
 * user signed up (Vercel production, preview, or localhost).
 */
export function getSiteUrl(): string {
  if (typeof window !== 'undefined' && window.location.origin) {
    return window.location.origin
  }

  const configured = import.meta.env.VITE_SITE_URL as string | undefined
  if (configured && !configured.includes('your-')) {
    return configured.replace(/\/$/, '')
  }

  return ''
}

/** Full URL Supabase should redirect to after email confirmation / auth links. */
export function getAuthRedirectUrl(path = '/auth/callback'): string {
  const base = getSiteUrl()
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return base ? `${base}${normalizedPath}` : normalizedPath
}
