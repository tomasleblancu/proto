import { useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '../../lib/utils.js'

interface ToolCall {
  tool: string
  status: 'running' | 'done'
  args?: Record<string, unknown>
}

export interface ChatMessageData {
  role: 'user' | 'assistant'
  text: string
  images?: string[]
  files?: { name: string; type: string }[]
  loading?: boolean
  toolCalls?: ToolCall[]
}

const HIDDEN_TOOLS = new Set(['ToolSearch', 'Skill', '__thinking__'])

function getToolLabel(tool: string): string | null {
  if (HIDDEN_TOOLS.has(tool)) return null
  const suffix = tool.includes('__') ? tool.split('__').pop()! : tool
  return suffix.replace(/_/g, ' ')
}

function getToolDetail(tool: string, args?: Record<string, unknown>): string | null {
  if (HIDDEN_TOOLS.has(tool)) return null
  if (!args || Object.keys(args).length === 0) return getToolLabel(tool)

  const filePath = args.file_path as string | undefined
  const pattern = args.pattern as string | undefined
  const cmd = args.command as string | undefined

  if (tool === 'Read' && filePath) {
    return `Reading ${filePath.split('/').slice(-2).join('/')}`
  }
  if (tool === 'Grep' && pattern) return `Searching: "${pattern}"`
  if (tool === 'Glob' && pattern) return `Finding files: ${pattern}`
  if (tool === 'Bash' && cmd) {
    const short = cmd.length > 50 ? cmd.slice(0, 50) + '...' : cmd
    return `Running: ${short}`
  }
  if (tool === 'Edit' && filePath) {
    return `Editing ${filePath.split('/').slice(-2).join('/')}`
  }
  if (tool === 'Write' && filePath) {
    return `Writing ${filePath.split('/').slice(-2).join('/')}`
  }
  if (tool === 'Agent') return 'Delegating task'

  return getToolLabel(tool)
}

export function ChatMessage({ role, text, images, files, loading, toolCalls }: ChatMessageData) {
  const [showTools, setShowTools] = useState(false)

  if (role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-md px-4 py-2.5 text-sm leading-relaxed bg-muted">
          {images && images.length > 0 && (
            <div className="flex gap-1.5 mb-2 flex-wrap">
              {images.map((src, i) => (
                <img key={i} src={src} alt="" className="max-w-[200px] max-h-[150px] rounded-lg object-cover" />
              ))}
            </div>
          )}
          {files && files.length > 0 && (
            <div className="flex gap-1.5 mb-2 flex-wrap">
              {files.map((f, i) => (
                <div key={i} className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-background/40 border border-border/40 max-w-[220px]">
                  <svg className="w-4 h-4 text-muted-foreground shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                  <span className="text-xs truncate">{f.name}</span>
                </div>
              ))}
            </div>
          )}
          {text && text !== '(attached file)' && text}
        </div>
      </div>
    )
  }

  const visibleTools = (toolCalls || []).filter(tc => getToolLabel(tc.tool) !== null)
  const thinkingSteps = (toolCalls || []).filter(tc => tc.tool === '__thinking__')
  const hasText = !!text
  const hasActiveTools = visibleTools.some(tc => tc.status === 'running')
  const showDots = loading && !hasText && !hasActiveTools && visibleTools.length === 0 && thinkingSteps.length === 0

  const lastThinking = thinkingSteps.length > 0 ? thinkingSteps[thinkingSteps.length - 1] : null
  const thinkingText = lastThinking?.args?.text as string | undefined
  const thinkingSummary = thinkingText
    ? (thinkingText.length > 80 ? thinkingText.slice(0, 80) + '...' : thinkingText)
    : null

  return (
    <div className="flex gap-3">
      <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center text-xs font-bold text-primary-foreground flex-shrink-0 mt-0.5">
        A
      </div>
      <div className="flex-1 min-w-0">
        {/* Thinking indicator */}
        {thinkingSummary && !hasText && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground/50 mb-2 italic">
            <span className="w-3 h-3 flex items-center justify-center text-[10px]">&#9679;</span>
            {thinkingSummary}
          </div>
        )}

        {/* Tool timeline */}
        {visibleTools.length > 0 && (
          <div className="mb-2">
            {hasActiveTools ? (
              <div className="space-y-1">
                {visibleTools.length > 3 && (
                  <button
                    onClick={() => setShowTools(!showTools)}
                    className="flex items-center gap-1.5 text-[11px] text-muted-foreground/40 hover:text-muted-foreground transition-colors"
                  >
                    <span className="text-primary">&#10003;</span>
                    {visibleTools.length - 3} previous action(s)
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                      className={cn('transition-transform', showTools && 'rotate-180')}>
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                )}
                {showTools && visibleTools.length > 3 && (
                  <div className="space-y-0.5 pl-4">
                    {visibleTools.slice(0, -3).map((tc, i) => (
                      <div key={i} className="text-[11px] text-muted-foreground/40 flex items-center gap-1.5">
                        <span className="text-primary/60">&#10003;</span>
                        {getToolDetail(tc.tool, tc.args)}
                      </div>
                    ))}
                  </div>
                )}
                {visibleTools.slice(visibleTools.length > 3 ? -3 : 0).map((tc, i) => (
                  <div key={i} className={cn(
                    'flex items-center gap-2 text-xs',
                    tc.status === 'running' ? 'text-muted-foreground' : 'text-muted-foreground/40'
                  )}>
                    {tc.status === 'running' ? (
                      <span className="w-3 h-3 border-2 border-muted border-t-primary rounded-full animate-spin" />
                    ) : (
                      <span className="w-3 h-3 flex items-center justify-center text-primary text-[10px]">&#10003;</span>
                    )}
                    {getToolDetail(tc.tool, tc.args)}
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
                  {visibleTools.length === 1 ? getToolDetail(visibleTools[0].tool, visibleTools[0].args) : `${visibleTools.length} actions`}
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
                        {getToolDetail(tc.tool, tc.args)}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Loading dots — show when still loading with no text and no active tools */}
        {showDots && (
          <div className="flex gap-1 py-2">
            <span className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-pulse" />
            <span className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-pulse [animation-delay:150ms]" />
            <span className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-pulse [animation-delay:300ms]" />
          </div>
        )}

        {/* Processing indicator — tools done, still loading, no text yet */}
        {loading && !hasText && !hasActiveTools && visibleTools.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground/40 mt-1">
            <span className="w-3 h-3 border-2 border-muted border-t-primary rounded-full animate-spin" />
            Processing...
          </div>
        )}

        {/* Message text with markdown */}
        {hasText && (
          <div className="prose prose-sm dark:prose-invert max-w-none text-sm">
            <Markdown remarkPlugins={[remarkGfm]} components={{
              p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
              ul: ({ children }) => <ul className="mb-2 space-y-1 list-disc list-inside">{children}</ul>,
              ol: ({ children }) => <ol className="mb-2 space-y-1 list-decimal list-inside">{children}</ol>,
              li: ({ children }) => <li className="text-muted-foreground">{children}</li>,
              strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
              code: ({ children, className }) => {
                if (className?.includes('language-')) {
                  return <code className="block bg-card border border-border rounded-lg px-3 py-2 text-xs font-mono overflow-x-auto my-2">{children}</code>
                }
                return <code className="bg-card px-1.5 py-0.5 rounded text-xs font-mono text-primary">{children}</code>
              },
              pre: ({ children }) => <>{children}</>,
              table: ({ children }) => <div className="overflow-x-auto my-2"><table className="w-full text-xs border-collapse">{children}</table></div>,
              th: ({ children }) => <th className="text-left px-3 py-1.5 border-b border-border text-muted-foreground font-medium">{children}</th>,
              td: ({ children }) => <td className="px-3 py-1.5 border-b border-border/50 text-muted-foreground">{children}</td>,
              h1: ({ children }) => <h1 className="text-base font-semibold text-foreground mb-2 mt-3">{children}</h1>,
              h2: ({ children }) => <h2 className="text-sm font-semibold text-foreground mb-1.5 mt-2">{children}</h2>,
              h3: ({ children }) => <h3 className="text-sm font-medium mb-1 mt-2">{children}</h3>,
              blockquote: ({ children }) => <blockquote className="border-l-2 border-primary pl-3 my-2 text-muted-foreground italic">{children}</blockquote>,
              hr: () => <hr className="border-border my-3" />,
              a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80 underline">{children}</a>,
            }}>
              {text}
            </Markdown>
          </div>
        )}
      </div>
    </div>
  )
}
