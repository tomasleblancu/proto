import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase.js'
import type { User } from '@supabase/supabase-js'

interface Company {
  id: string
  name: string
}

interface Profile {
  full_name: string | null
  role_title: string | null
  onboarding_completed: boolean
}

interface AuthState {
  user: User | null
  role: 'admin' | 'client' | null
  companyId: string | null
  companies: Company[]
  profile: Profile | null
  loading: boolean
}

export function useAuth(): AuthState & { signOut: () => void; setCompanyId: (id: string) => void; reload: () => Promise<void> } {
  const [state, setState] = useState<AuthState>({
    user: null, role: null, companyId: null, companies: [], profile: null, loading: true,
  })

  const loadUser = useCallback(async (user: User | null) => {
    if (!user) {
      setState({ user: null, role: null, companyId: null, companies: [], profile: null, loading: false })
      return
    }

    const [{ data: owned }, { data: profile }] = await Promise.all([
      supabase.from('companies').select('id, name').eq('owner_id', user.id),
      supabase.from('profiles').select('full_name, role_title, onboarding_completed').eq('id', user.id).maybeSingle(),
    ])

    if (owned && owned.length > 0) {
      setState({ user, role: 'admin', companyId: owned[0].id, companies: owned, profile: profile || null, loading: false })
      return
    }

    const { data: memberships } = await supabase
      .from('company_users')
      .select('company_id, companies(id, name)')
      .eq('user_id', user.id)

    const clientCompanies = (memberships || []).map((m: any) => m.companies).filter(Boolean)
    setState({
      user, role: clientCompanies.length > 0 ? 'client' : null,
      companyId: clientCompanies[0]?.id || null, companies: clientCompanies,
      profile: profile || null, loading: false,
    })
  }, [])

  useEffect(() => {
    let active = true
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (active) loadUser(user)
    }).catch(() => {})

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_ev, session) => {
      if (active) loadUser(session?.user || null)
    })
    return () => { active = false; subscription.unsubscribe() }
  }, [loadUser])

  return {
    ...state,
    signOut: () => supabase.auth.signOut(),
    setCompanyId: (id: string) => setState(s => ({ ...s, companyId: id })),
    reload: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      await loadUser(user)
    },
  }
}
