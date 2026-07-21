import type { AuthError, User } from '@supabase/supabase-js'
import { getAuthRedirectUrl } from './siteUrl'
import { supabase } from './supabase'

export const UNVERIFIED_EMAIL_MESSAGE =
  'Your email has not been verified. Please double-check your inbox for the confirmation link.'

export function isEmailVerified(user: User | null | undefined): boolean {
  if (!user) return false
  return Boolean(user.email_confirmed_at)
}

export function isUnverifiedEmailAuthError(error: AuthError | { message?: string; code?: string } | null): boolean {
  if (!error) return false
  const message = (error.message ?? '').toLowerCase()
  const code = (error.code ?? '').toLowerCase()
  return (
    code === 'email_not_confirmed' ||
    message.includes('email not confirmed') ||
    message.includes('email not verified') ||
    message.includes('not confirmed')
  )
}

export async function resendSignupConfirmation(email: string): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email: email.trim(),
    options: {
      emailRedirectTo: getAuthRedirectUrl('/auth/callback'),
    },
  })

  return { error: error?.message ?? null }
}
