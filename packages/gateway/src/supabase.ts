import { createClient, SupabaseClient } from '@supabase/supabase-js'

/**
 * Shared service-role Supabase client for the gateway. Uses a lazy singleton
 * so modules can import freely without tripping over missing env at load time.
 */
let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (client) return client
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  }
  client = createClient(url, key, { auth: { persistSession: false } })
  return client
}
