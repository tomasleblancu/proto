import { useState } from 'react'
import { cn } from '../../lib/utils.js'

interface ToolCall {
  tool: string
  status: 'running' | 'done'
  args?: Record<string, unknown>
}

export interface ChatMessageData {
  role: 'user' | 'assistant'
  text: string
  loading?: boolean
  toolCalls?: ToolCall[]
}

function getToolLabel(tool: string): string | null {
  const hidden = new Set(['ToolSearch', 'Skill', '__thinking__'])
  if (hidden.has(tool)) return null
  // Strip MCP prefix: mcp__appname__tool_name → tool_name
  const suffix = tool.includes('__') ? tool.split('__').pop()! : tool
  return suffix.replace(/_/g, ' ')
}

export function ChatMessage({ role, text, loading, toolCalls }: ChatMessageData) {
  const [showTools, setShowTools] = useState(false)

  if (role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-md px-4 py-2.5 text-sm leading-relaxed bg-muted">
          {text}
        </div>
      </div>
    )
  }

  const visibleTools = (toolCalls || []).filter(tc => getToolLabel(tc.tool) !== null)
  const hasText = !!text
  const hasActiveTools = visibleTools.some(tc => tc.status === 'running')
  const showDots = loading && !hasText && !hasActiveTools && visibleTools.length === 0

  return (
    <div className="flex gap-3">
      <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center text-xs font-bold text-primary-foreground flex-shrink-0 mt-0.5">
        A
      </div>
      <div className="flex-1 min-w-0">
        {visibleTools.length > 0 && (
          <div className="mb-2">
            {hasActiveTools ? (
              <div className="space-y-1">
                {visibleTools.slice(-3).map((tc, i) => (
                  <div key={i} className={cn(
                    'flex items-center gap-2 text-xs',
                    tc.status === 'running' ? 'text-muted-foreground' : 'text-muted-foreground/40'
                  )}>
                    {tc.status === 'running' ? (
                      <span className="w-3 h-3 border-2 border-muted border-t-primary rounded-full animate-spin" />
                    ) : (
                      <span className="w-3 h-3 flex items-center justify-center text-primary text-[10px]">&#10003;</span>
                    )}
                    {getToolLabel(tc.tool)}
                  </div>
                ))}
              </div>
            ) : (
              <>
                <button
                  onClick={() => setShowTools(!showTools)}
                  className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                >
                  <span className="text-primary">&#10003;</span>
                  {visibleTools.length === 1 ? getToolLabel(visibleTools[0].tool) : `${visibleTools.length} actions`}
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    className={cn('transition-transform', showTools && 'rotate-180')}>
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                {showTools && (
                  <div className="mt-1 space-y-0.5 pl-4">
                    {visibleTools.map((tc, i) => (
                      <div key={i} className="text-[11px] text-muted-foreground/40 flex items-center gap-1.5">
                        <span className="text-primary/60">&#10003;</span>
                        {getToolLabel(tc.tool)}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {showDots && (
          <div className="flex gap-1 py-2">
            <span className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-pulse" />
            <span className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-pulse [animation-delay:150ms]" />
            <span className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-pulse [animation-delay:300ms]" />
          </div>
        )}

        {hasText && (
          <div className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
            {text}
          </div>
        )}
      </div>
    </div>
  )
}
