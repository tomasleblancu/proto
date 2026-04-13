/**
 * ChatPanel — framework-provided chat panel with WebSocket streaming.
 *
 * Replicates the streaming logic from Hermes Chat (tool_use → tool_result → text → result)
 * in a generic, domain-agnostic way. Plugs into ProtoApp as the left panel.
 */
import { useState, useRef, useCallback } from 'react'
import { protoSocket, sendChatWs, resetSession, type StreamEvent } from '../../lib/api.js'
import { GATEWAY_URL, INTERNAL_SECRET as SECRET } from '../../lib/config.js'
import { ChatMessage, type ChatMessageData } from './ChatMessage.js'
import { ChatInput, type Attachment } from './ChatInput.js'

interface ActiveEntity {
  type: string
  id: string
  label: string
}

interface Props {
  companyId: string
  userId: string
  appName?: string
  companyContext?: string
  onStreamComplete?: () => void
  /** Expose a send function so the Shell can send messages programmatically */
  onRegisterSend?: (fn: (msg: string) => void) => void
  /** Active entity — when set, chat uses a dedicated session for this entity */
  activeEntity?: ActiveEntity | null
  /** Called when user wants to exit entity context */
  onClearEntity?: () => void
}

const STORAGE_PREFIX = 'proto-chat-'

function sessionKeyFor(entity?: ActiveEntity | null): string {
  if (entity?.type && entity?.id) return `${entity.type}-${entity.id}`
  return 'web'
}

function storageKey(companyId: string, session: string) {
  return `${STORAGE_PREFIX}${companyId}-${session}`
}

function loadMessages(companyId: string, session: string): ChatMessageData[] {
  try {
    const raw = localStorage.getItem(storageKey(companyId, session))
    if (!raw) return []
    return (JSON.parse(raw) as ChatMessageData[]).map(m => ({
      ...m, loading: false,
      toolCalls: m.toolCalls?.map(tc => ({ ...tc, status: 'done' as const })),
    }))
  } catch { return [] }
}

function saveMessages(companyId: string, session: string, messages: ChatMessageData[]) {
  try {
    localStorage.setItem(
      storageKey(companyId, session),
      JSON.stringify(messages.filter(m => !m.loading || m.text)),
    )
  } catch {}
}

function allDone(tcs: ChatMessageData['toolCalls']) {
  return (tcs || []).map(tc => ({ ...tc, status: 'done' as const }))
}

export function ChatPanel({ companyId, userId, appName, companyContext, onStreamComplete, onRegisterSend, activeEntity, onClearEntity }: Props) {
  const sessionKey = sessionKeyFor(activeEntity)
  const [messages, setMessages] = useState<ChatMessageData[]>(() => loadMessages(companyId, sessionKey))
  const [streaming, setStreaming] = useState(false)
  const [queue, setQueue] = useState<Array<{ text: string; serverPaths?: string[]; displayImages?: string[]; files?: { name: string; type: string }[] }>>([])
  const queueRef = useRef<Array<{ text: string; serverPaths?: string[]; displayImages?: string[]; files?: { name: string; type: string }[] }>>([])
  const bottomRef = useRef<HTMLDivElement>(null)
  const streamingRef = useRef(false)
  const companyRef = useRef(companyId)
  const sessionRef = useRef(sessionKey)
  const scrolledOnMount = useRef(false)

  // Reset state when company or session changes
  if (companyRef.current !== companyId || sessionRef.current !== sessionKey) {
    companyRef.current = companyId
    sessionRef.current = sessionKey
    setMessages(loadMessages(companyId, sessionKey))
    queueRef.current = []
    setQueue([])
    setStreaming(false)
    streamingRef.current = false
    scrolledOnMount.current = false
  }

  // Scroll to bottom on first render with messages
  if (!scrolledOnMount.current && messages.length > 0) {
    scrolledOnMount.current = true
    queueMicrotask(() => bottomRef.current?.scrollIntoView())
  }

  const scroll = () => bottomRef.current?.scrollIntoView()

  const sendRef = useRef<(msg: string) => void>(() => {})
  if (onRegisterSend) {
    onRegisterSend((msg: string) => sendRef.current(msg))
  }

  const addFilesRef = useRef<(files: File[]) => void>(() => {})

  const drainQueue = () => {
    const next = queueRef.current.shift()
    setQueue([...queueRef.current])
    if (next) {
      setTimeout(() => processMessageRef.current(next.text, next.serverPaths, next.displayImages, next.files), 0)
    }
  }

  const processMessageRef = useRef<(text: string, serverPaths?: string[], displayImages?: string[], files?: { name: string; type: string }[]) => void>(() => {})

  const processMessage = useCallback((text: string, serverPaths?: string[], displayImages?: string[], files?: { name: string; type: string }[]) => {
    let fullMessage = text
    if (serverPaths && serverPaths.length > 0) {
      const filePaths = serverPaths.filter(url => url.startsWith('/'))
      if (filePaths.length > 0) {
        fullMessage += '\n\n[The user attached files (images and/or PDFs). Read each one with the Read tool to process them: ' + filePaths.join(', ') + ']'
      }
    }

    setMessages(prev => [
      ...prev,
      { role: 'user' as const, text, images: displayImages, files },
      { role: 'assistant' as const, text: '', loading: true, toolCalls: [] },
    ])
    setStreaming(true)
    streamingRef.current = true
    scroll()

    // Handle streaming events for this chat turn
    protoSocket.onMessage((event: StreamEvent) => {
      setMessages(prev => {
        const updated = [...prev]
        const last = updated[updated.length - 1]
        if (last.role !== 'assistant') return updated

        switch (event.type) {
          case 'text':
            updated[updated.length - 1] = {
              ...last,
              text: last.text + (event.text || ''),
              loading: false,
              toolCalls: allDone(last.toolCalls),
            }
            break

          case 'tool_use':
            updated[updated.length - 1] = {
              ...last,
              toolCalls: [
                ...allDone(last.toolCalls),
                { tool: event.tool || '', status: 'running', args: (event as any).args },
              ],
            }
            break

          case 'tool_result':
            updated[updated.length - 1] = { ...last, toolCalls: allDone(last.toolCalls) }
            break

          case 'result':
            updated[updated.length - 1] = {
              ...last,
              text: last.text || event.text || '',
              loading: false,
              toolCalls: allDone(last.toolCalls),
            }
            setStreaming(false)
            streamingRef.current = false
            onStreamComplete?.()
            saveMessages(companyId, sessionKey, updated)
            drainQueue()
            break

          case 'error':
            updated[updated.length - 1] = {
              role: 'assistant',
              text: `Error: ${event.message}`,
              toolCalls: allDone(last.toolCalls),
            }
            setStreaming(false)
            streamingRef.current = false
            onStreamComplete?.()
            saveMessages(companyId, sessionKey, updated)
            drainQueue()
            break
        }

        scroll()
        return updated
      })
    })

    // Send via WebSocket
    sendChatWs({
      company_id: companyId,
      user_id: userId,
      message: fullMessage,
      session_key: sessionKey,
      company_context: companyContext,
    }).catch(err => {
      setStreaming(false)
      streamingRef.current = false
      setMessages(prev => {
        const copy = [...prev]
        const last = copy[copy.length - 1]
        if (last.role === 'assistant') {
          copy[copy.length - 1] = { role: 'assistant', text: `Connection error: ${err.message}` }
        }
        return copy
      })
    })
  }, [companyId, userId, companyContext, onStreamComplete])

  processMessageRef.current = processMessage

  const handleSend = useCallback(async (text: string, attachments?: Attachment[]) => {
    let serverPaths: string[] | undefined
    let displayImages: string[] | undefined
    let fileMeta: { name: string; type: string }[] | undefined

    if (attachments && attachments.length > 0) {
      displayImages = attachments.map(a => a.preview).filter(Boolean)
      fileMeta = attachments
        .filter(a => !a.file.type.startsWith('image/'))
        .map(a => ({ name: a.file.name, type: a.file.type }))
      const paths: string[] = []

      for (const att of attachments) {
        const form = new FormData()
        form.append('file', att.file)
        form.append('company_id', companyId)
        try {
          const res = await fetch(`${GATEWAY_URL}/upload`, {
            method: 'POST',
            headers: { 'X-Internal-Secret': SECRET },
            body: form,
          })
          if (res.ok) { const { path } = await res.json(); paths.push(path) }
        } catch {}
      }
      serverPaths = paths.length > 0 ? paths : undefined
    }

    if (streamingRef.current) {
      queueRef.current.push({ text, serverPaths, displayImages, files: fileMeta })
      setQueue([...queueRef.current])
      return
    }
    processMessage(text, serverPaths, displayImages, fileMeta)
  }, [processMessage, companyId])

  sendRef.current = handleSend

  function clearChat() {
    setMessages([])
    setStreaming(false)
    streamingRef.current = false
    queueRef.current = []
    setQueue([])
    localStorage.removeItem(storageKey(companyId, sessionKey))
    resetSession(companyId, sessionKey)
  }

  const msgCount = messages.filter(m => m.role === 'user').length

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center text-xs font-bold text-primary-foreground">
            {(appName || 'P')[0].toUpperCase()}
          </div>
          <span className="font-semibold text-sm">{appName || 'Chat'}</span>
        </div>
        {msgCount > 0 && (
          <button
            onClick={clearChat}
            className="p-1.5 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-accent transition-colors"
            title="Clear conversation"
            aria-label="Clear conversation"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 20H7L2 5h17l-2 8" /><path d="M18 15l-5 5" /><path d="M18 20l-5-5" />
            </svg>
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-auto px-4 py-6 space-y-6">
          {messages.length === 0 && (
            <div className="pt-[15vh] text-center">
              <div className="w-10 h-10 rounded-2xl bg-primary flex items-center justify-center text-lg font-bold text-primary-foreground mx-auto mb-4">
                {(appName || 'P')[0].toUpperCase()}
              </div>
              <p className="text-muted-foreground text-sm">How can I help you?</p>
            </div>
          )}
          {messages.map((msg, i) => (
            <ChatMessage key={i} {...msg} />
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-border bg-background">
        <div className="px-3 py-2">
          {activeEntity && (
            <div className="mb-2 flex items-center gap-2 px-2 py-1.5 rounded-lg bg-primary/5 border border-primary/20">
              <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-primary/80 leading-tight">
                  Session for {activeEntity.type}
                </p>
                <p className="text-xs font-medium truncate">{activeEntity.label}</p>
              </div>
              {onClearEntity && (
                <button
                  onClick={onClearEntity}
                  className="text-muted-foreground/60 hover:text-foreground transition-colors shrink-0"
                  aria-label="Exit entity context"
                  title="Exit entity context"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12"/>
                  </svg>
                </button>
              )}
            </div>
          )}
          {queue.length > 0 && (
            <div className="mb-2 space-y-1">
              {queue.map((q, i) => (
                <div key={i} className="flex items-center gap-2 px-2 py-1 rounded-md bg-muted/50 border border-border/50 text-[11px]">
                  <span className="text-muted-foreground/60 shrink-0">Queued</span>
                  <span className="flex-1 truncate">{q.text}</span>
                  <button
                    onClick={() => {
                      queueRef.current.splice(i, 1)
                      setQueue([...queueRef.current])
                    }}
                    className="text-muted-foreground/40 hover:text-foreground shrink-0"
                    aria-label="Remove from queue"
                  >
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18M6 6l12 12"/>
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
          <ChatInput
            onSend={handleSend}
            placeholder={streaming ? 'Agent working — your message will be queued...' : 'Type a message...'}
            onRegisterAddFiles={(fn) => { addFilesRef.current = fn }}
          />
          {streaming && (
            <div className="flex items-center justify-end mt-1.5">
              <button
                onClick={() => {
                  setStreaming(false)
                  streamingRef.current = false
                  setMessages(prev => {
                    const copy = [...prev]
                    const last = copy[copy.length - 1]
                    if (last?.role === 'assistant' && last.loading) {
                      copy[copy.length - 1] = { ...last, loading: false, text: last.text || '(cancelled)' }
                    }
                    return copy
                  })
                }}
                className="text-[10px] text-muted-foreground/60 hover:text-red-500 transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
