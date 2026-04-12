import { useState } from 'react'
import { supabase } from 'proto/web'
import { Skeleton } from 'proto/web'
import { cacheGet, cacheSet } from 'proto/web'
import { useData } from 'proto/web'
import {
  MailIcon, FileTextIcon, AlertCircleIcon, DollarSignIcon,
  TruckIcon, UserPlusIcon, InfoIcon, SparklesIcon, PencilIcon,
} from 'lucide-react'
import { BaseProps, formatAgo } from './shared'

type Category = 'status_update' | 'issue' | 'payment' | 'logistics' | 'document' | 'contact' | 'other'
type Source = 'email' | 'document' | 'manual' | 'agent_inference'

interface Finding {
  id: string
  source: Source
  category: Category
  summary: string
  details: string | null
  actor: string | null
  phase: string | null
  gmail_message_id: string | null
  occurred_at: string
  created_at: string
}

const CATEGORY_META: Record<Category, { Icon: any; color: string; label: string }> = {
  status_update: { Icon: InfoIcon, color: 'text-sky-500', label: 'Estado' },
  issue: { Icon: AlertCircleIcon, color: 'text-amber-500', label: 'Incidencia' },
  payment: { Icon: DollarSignIcon, color: 'text-emerald-500', label: 'Pago' },
  logistics: { Icon: TruckIcon, color: 'text-indigo-500', label: 'Logistica' },
  document: { Icon: FileTextIcon, color: 'text-violet-500', label: 'Documento' },
  contact: { Icon: UserPlusIcon, color: 'text-pink-500', label: 'Contacto' },
  other: { Icon: InfoIcon, color: 'text-muted-foreground', label: 'Otro' },
}

const SOURCE_ICON: Record<Source, any> = {
  email: MailIcon,
  document: FileTextIcon,
  manual: PencilIcon,
  agent_inference: SparklesIcon,
}

export function OrderFindingsWidget({ orderId, refreshKey }: BaseProps) {
  const key = `order-findings:${orderId}`
  const [expanded, setExpanded] = useState<string | null>(null)

  const { data: findings } = useData(
    async () => {
      const { data } = await supabase
        .from('order_findings')
        .select('*')
        .eq('order_id', orderId)
        .order('occurred_at', { ascending: false })
        .limit(50)
      const rows = (data || []) as Finding[]
      cacheSet(key, rows)
      return rows
    },
    [orderId, refreshKey, key],
    cacheGet<Finding[] | null>(key) ?? null,
  )

  if (findings === null) return (
    <div className="space-y-1.5">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="border border-border/40 rounded px-2 py-1.5">
          <div className="flex items-start gap-2">
            <Skeleton className="w-3 h-3 rounded-full mt-0.5 shrink-0" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-3" style={{ maxWidth: `${160 + (i % 3) * 40}px` }} />
              <Skeleton className="h-2 w-24" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )

  if (findings.length === 0) {
    return (
      <div className="text-center py-4">
        <p className="text-xs text-muted-foreground">Sin hallazgos registrados.</p>
        <p className="text-[10px] text-muted-foreground/60 mt-0.5">
          El agente los ira agregando al leer correos y documentos.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      {findings.map(f => {
        const meta = CATEGORY_META[f.category] || CATEGORY_META.other
        const Icon = meta.Icon
        const SrcIcon = SOURCE_ICON[f.source]
        const isExpanded = expanded === f.id
        return (
          <div
            key={f.id}
            className="border border-border/40 rounded px-2 py-1.5 hover:bg-muted/20 cursor-pointer"
            onClick={() => setExpanded(isExpanded ? null : f.id)}
          >
            <div className="flex items-start gap-2">
              <Icon className={`w-3 h-3 mt-0.5 shrink-0 ${meta.color}`} />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-foreground leading-tight">{f.summary}</p>
                <div className="flex items-center gap-1.5 mt-0.5 text-[9px] text-muted-foreground/60">
                  <SrcIcon className="w-2.5 h-2.5" />
                  {f.actor && <span className="truncate">{f.actor}</span>}
                  {f.actor && <span>·</span>}
                  <span>{formatAgo(f.occurred_at)}</span>
                  {f.phase && (
                    <>
                      <span>·</span>
                      <span className="font-mono">{f.phase}</span>
                    </>
                  )}
                </div>
                {isExpanded && f.details && (
                  <p className="mt-1 text-[11px] text-muted-foreground whitespace-pre-wrap">
                    {f.details}
                  </p>
                )}
                {isExpanded && f.gmail_message_id && (
                  <a
                    href={`https://mail.google.com/mail/u/0/#inbox/${f.gmail_message_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-block mt-1 text-[10px] text-primary hover:underline"
                  >
                    Abrir mail ↗
                  </a>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
