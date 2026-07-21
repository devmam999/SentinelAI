import type { EmailOtpType } from '@supabase/supabase-js'
import { supabase } from './supabase'

function parseUrlParams() {
  const search = new URLSearchParams(window.location.search)
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  return { search, hash }
}

/** Remove tokens/codes from the address bar after a successful exchange. */
function clearAuthParamsFromUrl() {
  window.history.replaceState({}, document.title, `${window.location.pathname}`)
}

/**
 * Finish an auth redirect from Supabase email links.
 *
 * Email confirmation must not rely on PKCE code verifiers (they only exist in the
 * browser tab where sign-up started). We support token_hash OTP verification and
 * implicit hash tokens; PKCE `?code=` is attempted only as a same-browser fallback.
 */
export async function completeAuthFromUrl(): Promise<{ error: string | null }> {
  const { search, hash } = parseUrlParams()

  const errorParam = search.get('error') ?? hash.get('error')
  if (errorParam) {
    const description = search.get('error_description') ?? hash.get('error_description')
    return { error: description ?? errorParam }
  }

  const tokenHash = search.get('token_hash')
  const type = search.get('type')
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as EmailOtpType,
    })
    if (error) return { error: error.message }
    clearAuthParamsFromUrl()
    return { error: null }
  }

  const code = search.get('code')
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      const isPkceStorageError = error.message.toLowerCase().includes('code verifier')
      const { data } = await supabase.auth.getSession()
      if (data.session) {
        clearAuthParamsFromUrl()
        return { error: null }
      }
      if (isPkceStorageError) {
        return {
          error:
            'This confirmation link cannot be completed in this browser. Log in with your email and password — if your email is already verified you will get in. Otherwise use "Resend confirmation email" on the log in page.',
        }
      }
      return { error: error.message }
    }
    clearAuthParamsFromUrl()
    return { error: null }
  }

  // Implicit flow: access_token arrives in the hash; detectSessionInUrl parses it on getSession().
  if (hash.has('access_token')) {
    await supabase.auth.getSession()
    clearAuthParamsFromUrl()
  }

  return { error: null }
}
