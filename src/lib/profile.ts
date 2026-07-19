import { supabase } from './supabase'

export type UserProfile = {
  username: string | null
  email: string | null
}

export async function fetchUserProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('username, email')
    .eq('id', userId)
    .single()

  if (error) return null
  return data
}

export async function resolveLoginEmail(identifier: string): Promise<string | null> {
  const trimmed = identifier.trim()
  if (!trimmed) return null

  const { data, error } = await supabase.rpc('resolve_login_email', { identifier: trimmed })
  if (error || !data) return null
  return data as string
}

export async function isUsernameAvailable(username: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_username_available', {
    desired_username: username.trim(),
  })

  if (error) return false
  return Boolean(data)
}
