import { supabase } from '@/lib/supabase'
import { useData } from '@/hooks/useData'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { UserIcon, BuildingIcon, MailIcon, PhoneIcon } from 'lucide-react'

interface Props {
  companyId: string
  refreshKey: number
  onSendToChat: (message: string) => void
}

export default function ProfileWidget({ companyId, refreshKey, onSendToChat }: Props) {
  const { data: fetched, loading } = useData(
    async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return { profile: null, company: null, stats: { orders: 0, products: 0, docs: 0 } }

      const [profileRes, companyRes, ordersRes, productsRes, docsRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('companies').select('*').eq('id', companyId).single(),
        supabase.from('orders').select('id', { count: 'exact', head: true }).eq('company_id', companyId),
        supabase.from('products').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('active', true),
        supabase.from('documents').select('id', { count: 'exact', head: true }).eq('company_id', companyId),
      ])

      return {
        profile: profileRes.data,
        company: companyRes.data,
        stats: {
          orders: ordersRes.count || 0,
          products: productsRes.count || 0,
          docs: docsRes.count || 0,
        },
      }
    },
    [companyId, refreshKey],
    { profile: null as any, company: null as any, stats: { orders: 0, products: 0, docs: 0 } },
  )

  const { profile, company, stats } = fetched

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Skeleton className="w-10 h-10 rounded-full" />
          <div className="space-y-1">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
        <Skeleton className="h-16 w-full" />
      </div>
    )
  }

  const user_email = profile?.id ? undefined : null // we'll get it from auth
  const completeness = [
    profile?.full_name,
    profile?.role_title,
    profile?.phone,
    company?.name,
    company?.rut,
  ].filter(Boolean).length
  const total = 5
  const pct = Math.round((completeness / total) * 100)

  return (
    <div className="space-y-3">
      {/* Profile */}
      <div className="flex items-center gap-2.5">
        <div className="w-10 h-10 rounded-full bg-emerald-600/20 flex items-center justify-center">
          <UserIcon className="w-5 h-5 text-emerald-500" />
        </div>
        <div>
          <p className="text-sm font-medium">{profile?.full_name || 'Sin nombre'}</p>
          <p className="text-[10px] text-muted-foreground">{profile?.role_title || 'Sin cargo'}</p>
        </div>
      </div>

      {profile?.phone && (
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <PhoneIcon className="w-3 h-3" /> {profile.phone}
        </div>
      )}

      <Separator />

      {/* Company */}
      <div className="flex items-center gap-2">
        <BuildingIcon className="w-3.5 h-3.5 text-muted-foreground/60" />
        <div>
          <p className="text-xs font-medium">{company?.name || 'Sin empresa'}</p>
          {company?.rut && <p className="text-[10px] text-muted-foreground">{company.rut}</p>}
        </div>
      </div>

      {company?.contact_email && (
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <MailIcon className="w-3 h-3" /> {company.contact_email}
        </div>
      )}

      <Separator />

      {/* Completeness */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-muted-foreground">Perfil completo</span>
          <span className="text-[10px] text-muted-foreground">{pct}%</span>
        </div>
        <div className="h-1.5 bg-accent rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-emerald-500' : 'bg-emerald-600/60'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        {pct < 100 && (
          <p className="text-[9px] text-muted-foreground/50 mt-1">
            Faltan: {[
              !profile?.full_name && 'nombre',
              !profile?.role_title && 'cargo',
              !profile?.phone && 'telefono',
              !company?.name && 'empresa',
              !company?.rut && 'RUT',
            ].filter(Boolean).join(', ')}
          </p>
        )}
      </div>

      <Separator />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-lg font-semibold">{stats.orders}</p>
          <p className="text-[9px] text-muted-foreground">Pedidos</p>
        </div>
        <div>
          <p className="text-lg font-semibold">{stats.products}</p>
          <p className="text-[9px] text-muted-foreground">Productos</p>
        </div>
        <div>
          <p className="text-lg font-semibold">{stats.docs}</p>
          <p className="text-[9px] text-muted-foreground">Docs</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-1">
        <Button variant="outline" size="sm" className="h-6 text-[10px]"
          onClick={() => onSendToChat('Actualiza mi perfil')}>
          Editar perfil
        </Button>
        <Button variant="outline" size="sm" className="h-6 text-[10px]"
          onClick={() => onSendToChat('Actualiza los datos de mi empresa')}>
          Editar empresa
        </Button>
      </div>
    </div>
  )
}
