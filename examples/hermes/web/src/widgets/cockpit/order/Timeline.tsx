import { supabase } from '@proto/core-web'
import { Skeleton } from '@proto/core-web'
import { cacheGet, cacheSet } from '@proto/core-web'
import { useData } from '@proto/core-web'
import { BaseProps, formatAgo } from './shared'

export function OrderTimelineWidget({ orderId, refreshKey }: BaseProps) {
  const key = `order-timeline:${orderId}`

  const { data: events, loading } = useData(
    async () => {
      const { data } = await supabase
        .from('order_events')
        .select('id, event_type, description, created_at, metadata')
        .eq('order_id', orderId)
        .order('created_at', { ascending: false })
        .limit(30)
      const rows = data || []
      cacheSet(key, rows)
      return rows
    },
    [orderId, refreshKey, key],
    cacheGet<any[] | null>(key) ?? null,
  )

  if (events === null) return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex gap-2">
          <Skeleton className="w-1 h-1 rounded-full mt-1.5 shrink-0" />
          <div className="flex-1 space-y-1">
            <div className="flex justify-between">
              <Skeleton className="h-2.5 w-20" />
              <Skeleton className="h-2 w-10" />
            </div>
            <Skeleton className="h-3" style={{ maxWidth: `${140 + (i % 3) * 50}px` }} />
          </div>
        </div>
      ))}
    </div>
  )

  if (events.length === 0) {
    return <p className="text-xs text-muted-foreground text-center py-4">Sin actividad todavia.</p>
  }

  return (
    <div className="space-y-1.5">
      {events.map(ev => (
        <div key={ev.id} className="flex gap-2 text-[11px]">
          <div className="w-1 h-1 rounded-full bg-emerald-600 mt-1.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 justify-between">
              <span className="font-mono text-[10px] text-muted-foreground/60 truncate">
                {ev.event_type}
              </span>
              <span className="text-[9px] text-muted-foreground/40 shrink-0">
                {formatAgo(ev.created_at)}
              </span>
            </div>
            {ev.description && (
              <p className="text-foreground/80 truncate">{ev.description}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
