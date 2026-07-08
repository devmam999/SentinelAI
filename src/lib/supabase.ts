import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined

/**
 * Supabase now issues "publishable" keys (`sb_publishable_...`) for client-side
 * code, replacing the legacy `anon` JWT keys. We read the new variable first and
 * fall back to the old one so existing setups keep working during the migration.
 * The legacy `anon` key still works but is slated for removal (late 2026).
 */
const supabaseKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined

const placeholders = ['your-project-url', 'your-publishable-key', 'your-anon-key']

/**
 * True only when real-looking credentials are present. We use this to show a
 * friendly setup message instead of throwing cryptic network errors when the
 * `.env.local` placeholders haven't been replaced yet.
 */
export const isSupabaseConfigured = Boolean(
  supabaseUrl && supabaseKey && !placeholders.includes(supabaseUrl) && !placeholders.includes(supabaseKey),
)

// Fall back to harmless placeholder values so `createClient` doesn't throw at
// import time; any auth call will still surface a clear "not configured" state.
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseKey || 'sb_publishable_placeholder',
)
