import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = (import.meta.env.VITE_SUPABASE_URL as string) || ''
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || ''

export const isSandbox = !url || !anonKey

export const supabase: SupabaseClient = isSandbox
  ? (null as unknown as SupabaseClient)
  : createClient(url, anonKey)
