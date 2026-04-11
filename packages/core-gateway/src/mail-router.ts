import { getSupabase } from './supabase.js'

/**
 * Resolves an inbound sender email address to a company. This is the
 * allowlist: only mails from addresses associated with a company in the
 * system get processed. Anything else is dropped (treated as spam).
 *
 * Lookup order:
 *   1. `companies.contact_email` (exact match, case-insensitive)
 *   2. `profiles.email` joined through `company_users`
 *
 * Returns the first match or null.
 */

export interface RouteResult {
  companyId: string
  userId: string | null
  via: 'company_contact' | 'profile'
}

export async function resolveCompanyByEmail(email: string): Promise<RouteResult | null> {
  const db = getSupabase()
  const normalized = email.trim().toLowerCase()
  if (!normalized) return null

  // 1. Company contact_email
  const { data: company } = await db
    .from('companies')
    .select('id, contact_email')
    .ilike('contact_email', normalized)
    .limit(1)
    .maybeSingle()
  if (company) {
    return { companyId: company.id, userId: null, via: 'company_contact' }
  }

  // 2. Profile email → company_users
  const { data: profile } = await db
    .from('profiles')
    .select('id, email')
    .ilike('email', normalized)
    .limit(1)
    .maybeSingle()
  if (profile) {
    const { data: cu } = await db
      .from('company_users')
      .select('company_id, user_id')
      .eq('user_id', profile.id)
      .limit(1)
      .maybeSingle()
    if (cu) {
      return { companyId: cu.company_id, userId: cu.user_id, via: 'profile' }
    }
  }

  return null
}
