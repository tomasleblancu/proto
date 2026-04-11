/**
 * Primitive building blocks for agent-generated UIs.
 *
 * Each primitive is a simple React component that accepts typed props and
 * optional `children` (already rendered by Generative). Primitives have no
 * side effects beyond `onSendToChat` for interactive ones.
 */
import { useState, type ReactNode } from 'react'
import { ExternalLinkIcon, StarIcon, ShieldCheckIcon, Loader2Icon, CheckIcon } from 'lucide-react'
import { Badge as UIBadge } from '../../ui/badge'
import { ACTIONS } from './actions'

type OnChat = (message: string) => void

// ---------- Layout ----------

export function Stack({ gap = 2, children }: { gap?: number; children?: ReactNode }) {
  return <div className={`flex flex-col gap-${Math.min(gap, 6)}`}>{children}</div>
}

export function Row({ gap = 2, align = 'center', children }: { gap?: number; align?: 'start' | 'center' | 'end' | 'baseline'; children?: ReactNode }) {
  const a = { start: 'items-start', center: 'items-center', end: 'items-end', baseline: 'items-baseline' }[align]
  return <div className={`flex flex-row gap-${Math.min(gap, 6)} ${a}`}>{children}</div>
}

export function Grid({ cols = 3, gap = 2, children }: { cols?: 1 | 2 | 3 | 4; gap?: number; children?: ReactNode }) {
  // Default to 3 columns. Tight breakpoints so it actually shows 3 at normal shell widths.
  const c = {
    1: 'grid-cols-1',
    2: 'grid-cols-2',
    3: 'grid-cols-3',
    4: 'grid-cols-4',
  }[cols] || 'grid-cols-4'
  return <div className={`grid ${c} gap-${Math.min(gap, 6)}`}>{children}</div>
}

// ---------- Typography ----------

export function Heading({ text, level = 2 }: { text: string; level?: 1 | 2 | 3 }) {
  const size = level === 1 ? 'text-lg font-semibold' : level === 2 ? 'text-sm font-semibold' : 'text-xs font-medium text-muted-foreground'
  return <p className={size}>{text}</p>
}

export function Text({ text, muted, size = 'sm' }: { text: string; muted?: boolean; size?: 'xs' | 'sm' }) {
  return <p className={`${size === 'xs' ? 'text-[11px]' : 'text-xs'} ${muted ? 'text-muted-foreground' : ''}`}>{text}</p>
}

// ---------- Content ----------

export function Image({ src, alt, aspect = 'square', fit = 'contain' }: { src: string; alt?: string; aspect?: 'square' | 'video' | 'auto'; fit?: 'cover' | 'contain' }) {
  const a = aspect === 'square' ? 'aspect-square max-h-32' : aspect === 'video' ? 'aspect-video' : ''
  const f = fit === 'contain' ? 'object-contain' : 'object-cover'
  return (
    <div className={`${a} bg-muted/20 overflow-hidden rounded-md flex items-center justify-center`}>
      <img src={src} alt={alt || ''} loading="lazy" className={`w-full h-full ${f}`} />
    </div>
  )
}

export function Badge({ text, variant = 'default' }: { text: string; variant?: 'default' | 'secondary' | 'outline' | 'success' | 'warning' }) {
  const colors: Record<string, string> = {
    success: 'bg-emerald-600/15 text-emerald-500 border-emerald-600/30',
    warning: 'bg-amber-500/15 text-amber-500 border-amber-500/30',
  }
  if (colors[variant]) {
    return <span className={`text-[10px] px-1.5 py-0.5 rounded border ${colors[variant]}`}>{text}</span>
  }
  return <UIBadge variant={variant as any} className="text-[10px]">{text}</UIBadge>
}

export function Stat({ label, value, hint, tone = 'default' }: { label: string; value: string; hint?: string; tone?: 'default' | 'success' | 'warning' | 'danger' }) {
  const color = { default: '', success: 'text-emerald-500', warning: 'text-amber-500', danger: 'text-red-500' }[tone]
  return (
    <div className="bg-accent/40 border border-border/60 rounded-lg p-2.5">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={`text-base font-semibold ${color}`}>{value}</p>
      {hint && <p className="text-[10px] text-muted-foreground/60 mt-0.5">{hint}</p>}
    </div>
  )
}

export function Rating({ score, count }: { score: number; count?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-[11px]">
      <StarIcon className="w-3 h-3 text-yellow-500 fill-yellow-500" />
      {score.toFixed(1)}
      {count ? <span className="text-muted-foreground/60"> ({count})</span> : null}
    </span>
  )
}

export function GoldSupplier({ years }: { years: number }) {
  if (!years) return null
  return (
    <span className="inline-flex items-center gap-0.5 text-[11px] text-amber-500">
      <ShieldCheckIcon className="w-3 h-3" /> {years}y Gold
    </span>
  )
}

// ---------- Containers ----------

export function Card({ children }: { children?: ReactNode }) {
  return (
    <div className="bg-accent/40 border border-border/60 rounded-lg overflow-hidden flex flex-col hover:border-primary/40 transition-colors">
      {children}
    </div>
  )
}

export function CardBody({ children }: { children?: ReactNode }) {
  return <div className="p-2.5 flex flex-col gap-1.5 flex-1">{children}</div>
}

// ---------- Interactive ----------

export function LinkOut({ href, label }: { href: string; label?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-[11px] py-1 px-2 rounded border border-border hover:bg-accent transition-colors"
    >
      {label || 'Ver'} <ExternalLinkIcon className="w-2.5 h-2.5" />
    </a>
  )
}

export function Button({
  label,
  send,
  action,
  actionPayload,
  variant = 'default',
  onSendToChat,
}: {
  label: string
  send?: string
  action?: string
  actionPayload?: Record<string, any>
  variant?: 'default' | 'primary' | 'ghost'
  onSendToChat?: OnChat
}) {
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [result, setResult] = useState<string | null>(null)

  const cls =
    state === 'done'
      ? 'bg-emerald-600/20 text-emerald-500 border border-emerald-600/30 cursor-default'
      : variant === 'primary'
      ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
      : variant === 'ghost'
      ? 'hover:bg-accent'
      : 'border border-border hover:bg-accent'

  async function handle() {
    if (state === 'running' || state === 'done') return
    // Direct action takes priority
    if (action && ACTIONS[action]) {
      setState('running')
      try {
        const msg = await ACTIONS[action](actionPayload || {})
        setResult(msg)
        setState('done')
      } catch (e: any) {
        setResult(`Error: ${e?.message || String(e)}`)
        setState('error')
        setTimeout(() => setState('idle'), 2500)
      }
      return
    }
    // Fallback: send chat message
    if (send) onSendToChat?.(send)
  }

  return (
    <button
      onClick={handle}
      disabled={state === 'running' || state === 'done'}
      className={`text-[11px] py-1 px-2 rounded transition-colors inline-flex items-center gap-1 ${cls}`}
    >
      {state === 'running' && <Loader2Icon className="w-2.5 h-2.5 animate-spin" />}
      {state === 'done' && <CheckIcon className="w-2.5 h-2.5" />}
      <span>{state === 'done' ? result || 'Guardado' : state === 'error' ? result || 'Error' : label}</span>
    </button>
  )
}

// ---------- Tabular ----------

export function Table({
  columns,
  rows,
}: {
  columns: string[]
  rows: (string | number)[][]
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b border-border">
            {columns.map((c, i) => (
              <th key={i} className="text-left py-1 px-2 font-medium text-muted-foreground">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border/40 hover:bg-accent/30">
              {row.map((cell, j) => (
                <td key={j} className="py-1 px-2">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
