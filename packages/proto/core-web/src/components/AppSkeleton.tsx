import { Skeleton } from './ui/skeleton.js'

/** Reads the persisted chat panel width (same key as ResizableLayout). */
function useChatWidth() {
  const saved = localStorage.getItem('proto:chat-width')
  return saved ? Math.max(280, Math.min(600, parseInt(saved, 10))) : 380
}

/**
 * Full-screen skeleton that mirrors the real app layout:
 * chat panel (left) + divider + shell panel (right).
 * Shown while Supabase auth is resolving on first load.
 */
export function AppSkeleton() {
  const chatWidth = useChatWidth()

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* ── Chat panel ─────────────────────────────────── */}
      <div className="flex flex-col shrink-0 border-r border-border" style={{ width: chatWidth }}>
        {/* Header */}
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
          <Skeleton className="h-7 w-7 rounded-full" />
          <Skeleton className="h-4 w-28" />
        </div>

        {/* Messages */}
        <div className="flex-1 flex flex-col gap-4 px-4 py-4 overflow-hidden">
          <MessageSkeleton align="left" lines={2} widths={['70%', '50%']} />
          <MessageSkeleton align="right" lines={1} widths={['55%']} />
          <MessageSkeleton align="left" lines={3} widths={['80%', '65%', '40%']} />
          <MessageSkeleton align="right" lines={2} widths={['60%', '45%']} />
          <MessageSkeleton align="left" lines={1} widths={['72%']} />
        </div>

        {/* Input */}
        <div className="px-3 pb-3 pt-2 border-t border-border">
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      </div>

      {/* ── Divider ────────────────────────────────────── */}
      <div className="w-px bg-border shrink-0" />

      {/* ── Shell panel ────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-3 h-[41px] border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Skeleton className="h-6 w-6 rounded" />
            <Skeleton className="h-4 w-20" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-6 w-6 rounded" />
            <Skeleton className="h-6 w-6 rounded" />
            <Skeleton className="h-6 w-24 rounded" />
          </div>
        </div>

        {/* Widget grid */}
        <div className="flex-1 p-3 overflow-hidden">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3 h-full content-start">
            {WIDGET_HEIGHTS.map((h, i) => (
              <WidgetCardSkeleton key={i} lines={h} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

const WIDGET_HEIGHTS = [5, 4, 6, 4, 5, 3]

function MessageSkeleton({
  align,
  lines,
  widths,
}: {
  align: 'left' | 'right'
  lines: number
  widths: string[]
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${align === 'right' ? 'items-end' : 'items-start'}`}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          className="h-3.5 rounded-full"
          style={{ width: widths[i] || '60%' }}
        />
      ))}
    </div>
  )
}

function WidgetCardSkeleton({ lines }: { lines: number }) {
  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden flex flex-col">
      {/* Card header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/50">
        <Skeleton className="h-3.5 w-20" />
        <Skeleton className="h-3.5 w-3.5 rounded" />
      </div>
      {/* Card body */}
      <div className="flex-1 p-3 flex flex-col gap-2.5">
        {Array.from({ length: lines }, (_, i) => (
          <Skeleton
            key={i}
            className="h-3 rounded-full"
            style={{ width: LINE_WIDTHS[i % LINE_WIDTHS.length] }}
          />
        ))}
      </div>
    </div>
  )
}

const LINE_WIDTHS = ['85%', '70%', '90%', '60%', '75%', '80%']
