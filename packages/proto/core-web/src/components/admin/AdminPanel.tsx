import { createElement, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth.js'
import { useData } from '../../hooks/useData.js'
import { useTheme } from '../../hooks/useTheme.js'
import { supabase } from '../../lib/supabase.js'
import { Button } from '../ui/button.js'
import {
  ArrowLeftIcon, UsersIcon, Building2Icon, WrenchIcon,
  LayoutGridIcon, SearchIcon, SettingsIcon,
} from 'lucide-react'
import { SystemTab } from './SystemTab.js'
import type { WidgetRegistry } from '../../lib/define-widget.js'

type Tab = 'users' | 'companies' | 'widgets' | 'system'

interface AdminPanelProps {
  widgets?: WidgetRegistry
}

export function AdminPanel({ widgets }: AdminPanelProps) {
  useTheme()
  const navigate = useNavigate()
  const { role, loading } = useAuth()
  const [activeTab, setActiveTab] = useState<Tab>('users')

  if (loading) {
    return <div className="flex h-screen items-center justify-center text-muted-foreground">Loading...</div>
  }

  if (role !== 'admin') {
    return (
      <div className="flex h-screen items-center justify-center text-muted-foreground">
        No tienes acceso a esta seccion.
      </div>
    )
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'users', label: 'Usuarios', icon: <UsersIcon className="w-4 h-4" /> },
    { id: 'companies', label: 'Empresas', icon: <Building2Icon className="w-4 h-4" /> },
    { id: 'widgets', label: 'Widgets', icon: <LayoutGridIcon className="w-4 h-4" /> },
    { id: 'system', label: 'Sistema', icon: <WrenchIcon className="w-4 h-4" /> },
  ]

  return (
    <div className="h-screen flex flex-col bg-background text-foreground">
      <div className="border-b border-border px-4 py-3 flex items-center gap-3 bg-background/80 backdrop-blur">
        <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={() => navigate('/')}>
          <ArrowLeftIcon className="w-4 h-4" /> Shell
        </Button>
        <div className="h-4 w-px bg-border" />
        <h1 className="text-sm font-semibold">Admin</h1>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <nav className="w-48 border-r border-border p-2 flex flex-col gap-0.5 shrink-0">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                activeTab === tab.id
                  ? 'bg-accent text-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>

        <main className="flex-1 overflow-y-auto p-6">
          {activeTab === 'users' && <UsersTab />}
          {activeTab === 'companies' && <CompaniesTab />}
          {activeTab === 'widgets' && <WidgetsTab widgets={widgets} />}
          {activeTab === 'system' && <SystemTab />}
        </main>
      </div>
    </div>
  )
}

/* ── Users Tab ─────────────────────────────────────────── */

function UsersTab() {
  const [search, setSearch] = useState('')

  const { data: users } = useData('admin-users', async () => {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, role_title, onboarding_completed')
      .order('full_name')
    if (!profiles) return []

    const { data: companies } = await supabase
      .from('companies')
      .select('id, name, owner_id')

    const { data: memberships } = await supabase
      .from('company_users')
      .select('user_id, company_id')

    return profiles.map((p: any) => {
      const owned = (companies || []).filter((c: any) => c.owner_id === p.id)
      const memberOf = (memberships || [])
        .filter((m: any) => m.user_id === p.id)
        .map((m: any) => (companies || []).find((c: any) => c.id === m.company_id))
        .filter(Boolean)
      return {
        ...p,
        role: owned.length > 0 ? 'admin' : memberOf.length > 0 ? 'client' : 'none',
        companies: owned.length > 0 ? owned : memberOf,
      }
    })
  }, [], [])

  const filtered = useMemo(() => {
    if (!search) return users
    const q = search.toLowerCase()
    return users.filter((u: any) =>
      u.full_name?.toLowerCase().includes(q) ||
      u.role_title?.toLowerCase().includes(q) ||
      u.role?.includes(q)
    )
  }, [users, search])

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Usuarios</h2>
        <div className="relative">
          <SearchIcon className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 pr-3 py-2 text-sm bg-background border border-border rounded-md w-60 focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>
      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b border-border">
              <th className="text-left px-4 py-2 font-medium text-muted-foreground">Nombre</th>
              <th className="text-left px-4 py-2 font-medium text-muted-foreground">Cargo</th>
              <th className="text-left px-4 py-2 font-medium text-muted-foreground">Rol</th>
              <th className="text-left px-4 py-2 font-medium text-muted-foreground">Empresa</th>
              <th className="text-left px-4 py-2 font-medium text-muted-foreground">Onboarding</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u: any) => (
              <tr key={u.id} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                <td className="px-4 py-2.5">{u.full_name || <span className="text-muted-foreground italic">Sin nombre</span>}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{u.role_title || '—'}</td>
                <td className="px-4 py-2.5"><RoleBadge role={u.role} /></td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  {u.companies.map((c: any) => c.name).join(', ') || '—'}
                </td>
                <td className="px-4 py-2.5">
                  {u.onboarding_completed
                    ? <span className="text-green-600 dark:text-green-400">Completo</span>
                    : <span className="text-amber-600 dark:text-amber-400">Pendiente</span>}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No hay usuarios</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground mt-2">{users.length} usuarios total</p>
    </div>
  )
}

/* ── Companies Tab ─────────────────────────────────────── */

function CompaniesTab() {
  const { data: companies } = useData('admin-companies', async () => {
    const { data } = await supabase
      .from('companies')
      .select('id, name, owner_id, created_at')
      .order('name')
    if (!data) return []

    const { data: profiles } = await supabase.from('profiles').select('id, full_name')
    const { data: memberships } = await supabase.from('company_users').select('company_id, user_id')

    return data.map((c: any) => ({
      ...c,
      owner_name: (profiles || []).find((p: any) => p.id === c.owner_id)?.full_name || '—',
      member_count: (memberships || []).filter((m: any) => m.company_id === c.id).length,
    }))
  }, [], [])

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">Empresas</h2>
      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b border-border">
              <th className="text-left px-4 py-2 font-medium text-muted-foreground">Nombre</th>
              <th className="text-left px-4 py-2 font-medium text-muted-foreground">Owner</th>
              <th className="text-left px-4 py-2 font-medium text-muted-foreground">Miembros</th>
              <th className="text-left px-4 py-2 font-medium text-muted-foreground">Creada</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((c: any) => (
              <tr key={c.id} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                <td className="px-4 py-2.5 font-medium">{c.name}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{c.owner_name}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{c.member_count}</td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  {new Date(c.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
            {companies.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No hay empresas</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground mt-2">{companies.length} empresas total</p>
    </div>
  )
}

/* ── Widgets Tab ───────────────────────────────────────── */

function WidgetsTab({ widgets }: { widgets?: WidgetRegistry }) {
  const { companyId } = useAuth()
  const [selectedWidget, setSelectedWidget] = useState<string | null>(null)

  const entries = useMemo(() => {
    if (!widgets) return []
    return Array.from(widgets.values()).map(w => ({
      type: w.type, title: w.title, icon: w.icon || '▦', category: w.category || 'general',
      hasConfig: !!w.configPanel,
    }))
  }, [widgets])

  // Detail view: show config panel for selected widget
  if (selectedWidget && widgets && companyId) {
    const def = widgets.get(selectedWidget)
    if (!def?.configPanel) { setSelectedWidget(null); return null }
    return (
      <div>
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={() => setSelectedWidget(null)}>
            <ArrowLeftIcon className="w-4 h-4" /> Widgets
          </Button>
          <div className="h-4 w-px bg-border" />
          <span className="text-lg">{def.icon || '▦'}</span>
          <h2 className="text-lg font-semibold">{def.title}</h2>
          <span className="text-xs px-2 py-0.5 bg-muted rounded-full text-muted-foreground">{def.type}</span>
        </div>
        <div className="border border-border rounded-lg p-6">
          {createElement(def.configPanel, { companyId, widgetType: def.type })}
        </div>
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">Widgets registrados</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {entries.map(w => (
          <div
            key={w.type}
            onClick={w.hasConfig ? () => setSelectedWidget(w.type) : undefined}
            className={`border border-border rounded-lg p-4 transition-colors ${
              w.hasConfig ? 'cursor-pointer hover:bg-accent/30 hover:border-primary/30' : 'hover:bg-accent/30'
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">{w.icon}</span>
              <span className="font-medium text-sm">{w.title}</span>
              {w.hasConfig && <SettingsIcon className="w-3.5 h-3.5 text-muted-foreground ml-auto" />}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs px-2 py-0.5 bg-muted rounded-full text-muted-foreground">{w.type}</span>
              <span className="text-xs px-2 py-0.5 bg-muted rounded-full text-muted-foreground">{w.category}</span>
            </div>
          </div>
        ))}
        {entries.length === 0 && (
          <p className="text-muted-foreground text-sm col-span-3">No hay widgets registrados</p>
        )}
      </div>
      <p className="text-xs text-muted-foreground mt-3">{entries.length} widgets total</p>
    </div>
  )
}

/* ── Shared ────────────────────────────────────────────── */

function RoleBadge({ role }: { role: string }) {
  const styles: Record<string, string> = {
    admin: 'bg-primary/10 text-primary border-primary/20',
    client: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
    none: 'bg-muted text-muted-foreground border-border',
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border ${styles[role] || styles.none}`}>
      {role}
    </span>
  )
}
