import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useData } from '@/hooks/useData'
import { GATEWAY_URL } from '@/lib/config'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { UserIcon, BuildingIcon, MailIcon, SaveIcon, CheckIcon, LinkIcon, ArrowLeftIcon, PhoneIcon, HashIcon, AtSignIcon } from 'lucide-react'

interface Props {
  companyId: string
  refreshKey: number
}

type View = 'home' | 'profile' | 'company' | 'gmail'

export default function SettingsWidget({ companyId, refreshKey }: Props) {
  const [view, setView] = useState<View>('home')
  const [saving, setSaving] = useState(false)

  const [profileLocal, setProfileLocal] = useState<{ full_name: string; role_title: string; phone: string } | null>(null)
  const [companyLocal, setCompanyLocal] = useState<{ name: string; rut: string; contact_email: string; contact_phone: string } | null>(null)

  const { data: fetched, loading } = useData(
    async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return { profile: { full_name: '', role_title: '', phone: '' }, company: { name: '', rut: '', contact_email: '', contact_phone: '' }, gmail: null as { email: string; connected_at: string } | null }
      const [p, c, g] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('companies').select('*').eq('id', companyId).single(),
        supabase.from('gmail_tokens').select('email, connected_at').eq('user_id', user.id).single(),
      ])
      return {
        profile: p.data ? { full_name: p.data.full_name || '', role_title: p.data.role_title || '', phone: p.data.phone || '' } : { full_name: '', role_title: '', phone: '' },
        company: c.data ? { name: c.data.name || '', rut: c.data.rut || '', contact_email: c.data.contact_email || '', contact_phone: c.data.contact_phone || '' } : { name: '', rut: '', contact_email: '', contact_phone: '' },
        gmail: (g.data as { email: string; connected_at: string } | null),
      }
    },
    [companyId, refreshKey],
    { profile: { full_name: '', role_title: '', phone: '' }, company: { name: '', rut: '', contact_email: '', contact_phone: '' }, gmail: null as { email: string; connected_at: string } | null },
  )

  const profile = profileLocal ?? fetched.profile
  const setProfile = (updater: ((p: typeof profile) => typeof profile) | typeof profile) => {
    setProfileLocal(typeof updater === 'function' ? updater(profile) : updater)
  }
  const company = companyLocal ?? fetched.company
  const setCompany = (updater: ((c: typeof company) => typeof company) | typeof company) => {
    setCompanyLocal(typeof updater === 'function' ? updater(company) : updater)
  }
  const gmail = fetched.gmail

  async function saveProfile() {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) await supabase.from('profiles').upsert({ id: user.id, ...profile, updated_at: new Date().toISOString() })
    setSaving(false)
  }

  async function saveCompany() {
    setSaving(true)
    await supabase.from('companies').update({ ...company }).eq('id', companyId)
    setSaving(false)
  }

  async function connectGmail() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const res = await fetch(`${GATEWAY_URL}/gmail/auth?user_id=${user.id}`)
    const { url } = await res.json()
    if (url) window.open(url, '_blank', 'width=500,height=600')
  }

  if (loading) return <div className="space-y-2"><Skeleton className="h-16 w-full rounded-xl" /><Skeleton className="h-16 w-full rounded-xl" /></div>

  // Detail views
  if (view !== 'home') {
    return (
      <div className="space-y-2">
        <button onClick={() => setView('home')} className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeftIcon className="w-3 h-3" /> Volver
        </button>

        {view === 'profile' && (
          <div className="space-y-2">
            <Field label="Nombre" value={profile.full_name} onChange={v => setProfile(p => ({ ...p, full_name: v }))} />
            <Field label="Cargo" value={profile.role_title} onChange={v => setProfile(p => ({ ...p, role_title: v }))} />
            <Field label="Telefono" value={profile.phone} onChange={v => setProfile(p => ({ ...p, phone: v }))} placeholder="+56 9 ..." />
            <Button size="sm" className="h-7 text-[10px] w-full bg-emerald-600 hover:bg-emerald-500" onClick={saveProfile} disabled={saving}>
              <SaveIcon className="w-3 h-3 mr-1" />{saving ? '...' : 'Guardar'}
            </Button>
          </div>
        )}

        {view === 'company' && (
          <div className="space-y-2">
            <Field label="Nombre" value={company.name} onChange={v => setCompany(c => ({ ...c, name: v }))} />
            <Field label="RUT" value={company.rut} onChange={v => setCompany(c => ({ ...c, rut: v }))} placeholder="76.123.456-7" />
            <Field label="Email" value={company.contact_email} onChange={v => setCompany(c => ({ ...c, contact_email: v }))} />
            <Field label="Telefono" value={company.contact_phone} onChange={v => setCompany(c => ({ ...c, contact_phone: v }))} />
            <Button size="sm" className="h-7 text-[10px] w-full bg-emerald-600 hover:bg-emerald-500" onClick={saveCompany} disabled={saving}>
              <SaveIcon className="w-3 h-3 mr-1" />{saving ? '...' : 'Guardar'}
            </Button>
          </div>
        )}

        {view === 'gmail' && (
          <div className="space-y-2">
            {gmail ? (
              <>
                <div className="flex items-center gap-2 p-2 rounded-lg bg-emerald-600/10">
                  <CheckIcon className="w-4 h-4 text-emerald-400" />
                  <div>
                    <p className="text-xs font-medium">{gmail.email}</p>
                    <p className="text-xs text-muted-foreground">Conectado</p>
                  </div>
                </div>
                <Button variant="outline" size="sm" className="h-7 text-[10px] w-full" onClick={connectGmail}>Reconectar</Button>
              </>
            ) : (
              <div className="text-center py-4 space-y-2">
                <p className="text-xs text-muted-foreground">No conectado</p>
                <Button size="sm" className="h-7 text-[10px] bg-emerald-600 hover:bg-emerald-500" onClick={connectGmail}>
                  <LinkIcon className="w-3 h-3 mr-1" />Conectar Gmail
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // Home: iOS-style cards
  return (
    <div className="grid grid-cols-2 gap-2">
      {/* Profile card */}
      <button onClick={() => setView('profile')}
        className="bg-accent/50 rounded-xl p-3 text-left hover:bg-accent transition-colors group">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-lg bg-blue-600/20 flex items-center justify-center">
            <UserIcon className="w-4 h-4 text-blue-400" />
          </div>
          {profile.full_name ? (
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{profile.full_name}</p>
              <p className="text-xs text-muted-foreground truncate">{profile.role_title || 'Sin cargo'}</p>
            </div>
          ) : (
            <p className="text-[10px] text-muted-foreground">Sin configurar</p>
          )}
        </div>
        {profile.phone && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground/60">
            <PhoneIcon className="w-2.5 h-2.5" />{profile.phone}
          </div>
        )}
        <p className="text-[11px] text-primary/60 mt-1 group-hover:text-primary transition-colors">Perfil</p>
      </button>

      {/* Company card */}
      <button onClick={() => setView('company')}
        className="bg-accent/50 rounded-xl p-3 text-left hover:bg-accent transition-colors group">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-lg bg-purple-600/20 flex items-center justify-center">
            <BuildingIcon className="w-4 h-4 text-purple-400" />
          </div>
          {company.name ? (
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{company.name}</p>
              {company.rut && <p className="text-xs text-muted-foreground">{company.rut}</p>}
            </div>
          ) : (
            <p className="text-[10px] text-muted-foreground">Sin configurar</p>
          )}
        </div>
        {company.contact_email && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground/60">
            <AtSignIcon className="w-2.5 h-2.5" />{company.contact_email}
          </div>
        )}
        <p className="text-[11px] text-primary/60 mt-1 group-hover:text-primary transition-colors">Empresa</p>
      </button>

      {/* Gmail card - full width */}
      <button onClick={() => setView('gmail')}
        className="col-span-2 bg-accent/50 rounded-xl p-3 text-left hover:bg-accent transition-colors group">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${gmail ? 'bg-emerald-600/20' : 'bg-muted'}`}>
            <MailIcon className={`w-4 h-4 ${gmail ? 'text-emerald-400' : 'text-muted-foreground/40'}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-medium">{gmail ? gmail.email : 'Gmail'}</p>
            <p className="text-xs text-muted-foreground">{gmail ? 'Conectado' : 'No conectado'}</p>
          </div>
          {gmail ? (
            <CheckIcon className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          ) : (
            <LinkIcon className="w-3 h-3 text-muted-foreground/40 flex-shrink-0" />
          )}
        </div>
        <p className="text-[11px] text-primary/60 mt-1 group-hover:text-primary transition-colors">Correo</p>
      </button>
    </div>
  )
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="text-[10px] text-muted-foreground">{label}</label>
      <Input value={value} onChange={e => onChange(e.target.value)} className="h-7 text-xs" placeholder={placeholder} />
    </div>
  )
}
