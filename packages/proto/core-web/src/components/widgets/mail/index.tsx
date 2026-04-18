/**
 * Mail inbox widget — built-in proto widget.
 *
 * Shows mail_threads scoped to the active company. Clicking a thread
 * opens an inline message view. Requires the mail_channels migration.
 *
 * Visible only when there is at least one mail_thread row for the company;
 * otherwise shows a quiet empty state.
 */
import { useState } from 'react'
import { defineWidget } from '../../../lib/define-widget.js'
import { useData } from '../../../hooks/useData.js'
import { supabase } from '../../../lib/supabase.js'
import { Badge } from '../../ui/badge.js'
import { ScrollArea } from '../../ui/scroll-area.js'
import { Skeleton } from '../../ui/skeleton.js'
import { Separator } from '../../ui/separator.js'
import type { ShellContext } from '../../../lib/define-widget.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface MailThread {
  id: string
  subject: string | null
  external_address: string
  initiated_by: 'in' | 'out'
  closed: boolean
  last_activity_at: string
  created_at: string
}

interface MailMessage {
  id: string
  direction: 'in' | 'out'
  from_address: string
  to_address: string
  subject: string | null
  body: string | null
  created_at: string
}

// ---------------------------------------------------------------------------
// Widget definition
// ---------------------------------------------------------------------------
export const mailWidget = defineWidget({
  type: 'mail-inbox',
  title: 'Mail',
  icon: '📧',
  category: 'general',
  defaultSize: { w: 4, h: 6, minW: 3, minH: 4 },
  render: (_, ctx) => <MailInbox {...ctx} />,
})

export default mailWidget

// ---------------------------------------------------------------------------
// Root component
// ---------------------------------------------------------------------------
function MailInbox({ companyId, refreshKey }: ShellContext) {
  const [selected, setSelected] = useState<MailThread | null>(null)

  if (selected) {
    return (
      <ThreadView
        thread={selected}
        companyId={companyId}
        onBack={() => setSelected(null)}
      />
    )
  }

  return (
    <ThreadList
      companyId={companyId}
      refreshKey={refreshKey}
      onSelect={setSelected}
    />
  )
}

// ---------------------------------------------------------------------------
// Thread list
// ---------------------------------------------------------------------------
interface ThreadListProps {
  companyId: string
  refreshKey: number
  onSelect: (t: MailThread) => void
}

function ThreadList({ companyId, refreshKey, onSelect }: ThreadListProps) {
  const { data: threads, loading } = useData<MailThread[]>(
    'mail-threads',
    async () => {
      const { data } = await supabase
        .from('mail_threads')
        .select('id,subject,external_address,initiated_by,closed,last_activity_at,created_at')
        .eq('company_id', companyId)
        .order('last_activity_at', { ascending: false })
        .limit(50)
      return (data || []) as MailThread[]
    },
    [companyId, refreshKey],
    []
  )

  if (loading) {
    return (
      <div className="p-3 space-y-2">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full rounded-md" />)}
      </div>
    )
  }

  if (threads.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-muted-foreground">No hay conversaciones por mail.</p>
      </div>
    )
  }

  return (
    <ScrollArea className="h-full">
      <div className="divide-y">
        {threads.map(t => (
          <ThreadRow key={t.id} thread={t} onClick={() => onSelect(t)} />
        ))}
      </div>
    </ScrollArea>
  )
}

// ---------------------------------------------------------------------------
// Thread row
// ---------------------------------------------------------------------------
function ThreadRow({ thread, onClick }: { thread: MailThread; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left px-3 py-2.5 hover:bg-accent/50 transition-colors flex items-start gap-2"
    >
      <span className="mt-0.5 text-xs text-muted-foreground select-none w-4 shrink-0">
        {thread.initiated_by === 'in' ? '←' : '→'}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 justify-between">
          <p className="text-sm font-medium truncate">
            {thread.subject || '(sin asunto)'}
          </p>
          {thread.closed && (
            <Badge variant="secondary" className="text-[10px] h-4 px-1 shrink-0">cerrado</Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate">{thread.external_address}</p>
        <p className="text-[11px] text-muted-foreground/70 mt-0.5">
          {relativeTime(thread.last_activity_at)}
        </p>
      </div>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Thread detail view
// ---------------------------------------------------------------------------
interface ThreadViewProps {
  thread: MailThread
  companyId: string
  onBack: () => void
}

function ThreadView({ thread, companyId, onBack }: ThreadViewProps) {
  const { data: messages, loading } = useData<MailMessage[]>(
    `mail-messages-${thread.id}`,
    async () => {
      const { data } = await supabase
        .from('mail_messages')
        .select('id,direction,from_address,to_address,subject,body,created_at')
        .eq('thread_id', thread.id)
        .eq('company_id', companyId)
        .order('created_at', { ascending: true })
        .limit(50)
      return (data || []) as MailMessage[]
    },
    [thread.id],
    []
  )

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b shrink-0">
        <button
          type="button"
          onClick={onBack}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Volver
        </button>
        <Separator orientation="vertical" className="h-4" />
        <p className="text-sm font-medium truncate flex-1">
          {thread.subject || '(sin asunto)'}
        </p>
      </div>

      {/* Meta */}
      <div className="px-3 py-1.5 bg-muted/30 text-xs text-muted-foreground shrink-0">
        {thread.external_address}
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1">
        {loading && (
          <div className="p-3 space-y-2">
            {[1, 2].map(i => <Skeleton key={i} className="h-20 w-full rounded-md" />)}
          </div>
        )}
        {!loading && messages.length === 0 && (
          <p className="text-sm text-muted-foreground p-3">Sin mensajes.</p>
        )}
        <div className="p-3 space-y-3">
          {messages.map(m => <MessageBubble key={m.id} message={m} />)}
        </div>
      </ScrollArea>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Message bubble
// ---------------------------------------------------------------------------
function MessageBubble({ message }: { message: MailMessage }) {
  const isOut = message.direction === 'out'

  return (
    <div className={`flex flex-col gap-0.5 ${isOut ? 'items-end' : 'items-start'}`}>
      <div
        className={`max-w-[90%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words ${
          isOut
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-foreground'
        }`}
      >
        {message.body || '(sin cuerpo)'}
      </div>
      <p className="text-[11px] text-muted-foreground px-1">
        {isOut ? 'Sistema' : message.from_address} · {relativeTime(message.created_at)}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'ahora'
  if (mins < 60) return `hace ${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `hace ${hrs}h`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `hace ${days}d`
  return new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short' })
}
