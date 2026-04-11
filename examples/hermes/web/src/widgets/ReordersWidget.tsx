import { supabase } from '@proto/core-web'
import { useData } from '@proto/core-web'
import { Badge } from '@proto/core-web'

interface Props { companyId: string }

export default function ReordersWidget({ companyId }: Props) {
  const { data: rules, loading } = useData(
    async () => {
      const { data } = await supabase
        .from('reorder_rules')
        .select('*')
        .eq('company_id', companyId)
        .eq('active', true)
        .order('next_order_date')
      return data || []
    },
    [companyId],
    [],
  )

  if (loading) return <p className="text-xs text-muted-foreground">Cargando...</p>

  if (rules.length === 0) return <p className="text-xs text-muted-foreground text-center py-4">Sin reglas de recompra</p>

  const today = new Date().toISOString().split('T')[0]

  return (
    <div className="space-y-1.5">
      {rules.map(rule => {
        const due = rule.next_order_date && rule.next_order_date <= today
        return (
          <div key={rule.id} className="p-2 rounded-lg border border-border">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[10px] font-medium">{rule.product_description}</span>
              {due && <Badge variant="destructive" className="text-[9px] h-4">Vencida</Badge>}
            </div>
            <p className="text-[9px] text-muted-foreground">
              {rule.quantity} uds · cada {rule.frequency_days} dias · {rule.supplier_name}
            </p>
            {rule.next_order_date && (
              <p className="text-[9px] text-muted-foreground/60">Proxima: {rule.next_order_date}</p>
            )}
          </div>
        )
      })}
    </div>
  )
}
