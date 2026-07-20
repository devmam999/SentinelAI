import type { User } from '@supabase/supabase-js'
import { getAuthRedirectUrl } from './siteUrl'
import { supabase } from './supabase'

export function isEmailVerified(user: User | null | undefined): boolean {
  if (!user) return false
  return Boolean(user.email_confirmed_at)
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
