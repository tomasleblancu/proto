import { useState, useRef, useCallback } from 'react'
import { hermesSocket, sendChatWs, resetSession, type StreamEvent } from '@tleblancureta/proto/web'
import { GATEWAY_URL, INTERNAL_SECRET } from '@tleblancureta/proto/web'
import { supabase } from '@tleblancureta/proto/web'
import { getDragData, hasDragData, buildAgentPrompt } from '@tleblancureta/proto/web'
import ChatMessage from '../components/ChatMessage'
import ChatContext from '../components/ChatContext'
import ChatInput, { type Attachment } from '../components/ChatInput'
import type { Message, ChatProps } from './chat/ChatTypes'
import { ALL_SKILLS, SUGGESTIONS, sessionKeyFor, storageKey, loadMessages, saveMessages, handleStreamEvent } from './chat/ChatUtils'

export default function Chat({ companyId, userId, companyContext, hasCompany, onStreamComplete, onRegisterSend, onRegisterClear, onMessagesChange, onAgentMount, onAgentActivateEntity, onAgentDeactivateEntity, activeEntity, onClearEntity }: ChatProps) {
  const sessionKey = sessionKeyFor(activeEntity)
  const [messages, setMessages] = useState<Message[]>(() => loadMessages(companyId, sessionKey))
  const [streaming, setStreaming] = useState(false)
  const [queue, setQueue] = useState<Array<{ text: string; serverPaths?: string[]; displayImages?: string[]; files?: { name: string; type: string }[] }>>([])
  const queueRef = useRef<Array<{ text: string; serverPaths?: string[]; displayImages?: string[]; files?: { name: string; type: string }[] }>>([])
  const bottomRef = useRef<HTMLDivElement>(null)
  const streamingRef = useRef(false)
  const companyRef = useRef(companyId)
  const sessionRef = useRef(sessionKey)
  const scrolledOnMount = useRef(false)

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

  const sendRef = useRef<(msg: string) => void>(() => {})
  // Register send handler — parent only sets a ref, safe to call synchronously
  if (onRegisterSend) {
    onRegisterSend((msg: string) => sendRef.current(msg))
  }

  const scroll = () => bottomRef.current?.scrollIntoView()

  const drainQueue = () => {
    const next = queueRef.current.shift()
    setQueue([...queueRef.current])
    if (next) {
      // Defer to next tick so the previous stream's state settles first
      setTimeout(() => processMessageRef.current(next.text, next.serverPaths, next.displayImages, next.files), 0)
    }
  }

  const processMessageRef = useRef<(t: string, sp?: string[], di?: string[], files?: { name: string; type: string }[]) => void>(() => {})

  const processMessage = useCallback((text: string, serverPaths?: string[], displayImages?: string[], files?: { name: string; type: string }[]) => {
    const skills = ALL_SKILLS

    let fullMessage = text
    if (serverPaths && serverPaths.length > 0) {
      const filePaths = serverPaths.filter(url => url.startsWith('/'))
      if (filePaths.length > 0) {
        fullMessage += '\n\n[El usuario adjunto archivos (imagenes y/o PDFs). Lee cada uno con el tool Read para procesarlos: ' + filePaths.join(', ') + ']'
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

    // Set up WS message handler for this chat turn
    hermesSocket.onMessage((event: StreamEvent) => {
      handleStreamEvent(event, {
        setMessages, setStreaming, streamingRef, scroll,
        onStreamComplete, onAgentMount, onAgentActivateEntity, onAgentDeactivateEntity,
        save: (updated) => saveMessages(companyId, sessionKey, updated),
        drainQueue,
      })
    })

    // Send via WebSocket
    sendChatWs({
      company_id: companyId,
      user_id: userId,
      message: fullMessage,
      session_key: sessionKey,
      enabled_skills: skills,
      company_context: companyContext,
    }).catch(err => {
      // WS failed, streaming stuck
      setStreaming(false)
      streamingRef.current = false
      setMessages(prev => {
        const updated = [...prev]
        const last = updated[updated.length - 1]
        if (last.role === 'assistant') {
          updated[updated.length - 1] = { role: 'assistant', text: `Error de conexion: ${err.message}` }
        }
        return updated
      })
    })
  }, [companyId, userId, companyContext, hasCompany])

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
        form.append('session_key', sessionKey)
        try {
          const res = await fetch(`${GATEWAY_URL}/upload`, {
            method: 'POST', headers: { 'X-Internal-Secret': INTERNAL_SECRET }, body: form,
          })
          if (res.ok) { const { path } = await res.json(); paths.push(path) }
        } catch {}

        const storagePath = `${companyId}/${Date.now()}-${att.file.name}`
        const { error } = await supabase.storage.from('documents').upload(storagePath, att.file)
        if (!error) {
          const { data } = supabase.storage.from('documents').getPublicUrl(storagePath)
          if (data?.publicUrl) displayImages = [data.publicUrl]
        }
      }
      serverPaths = paths.length > 0 ? paths : undefined
    }

    if (streamingRef.current) {
      // Encolar para enviar cuando termine el turno actual
      queueRef.current.push({ text, serverPaths, displayImages, files: fileMeta })
      setQueue([...queueRef.current])
      return
    }
    processMessage(text, serverPaths, displayImages, fileMeta)
  }, [processMessage, companyId])

  processMessageRef.current = processMessage

  sendRef.current = handleSend

  const clearChatRef = useRef<() => void>(() => {})
  // Register clear handler — parent only sets a ref, safe to call synchronously
  if (onRegisterClear) {
    onRegisterClear(() => clearChatRef.current())
  }

  // Notify parent of message count changes after commit, not during render
  const lastMsgCountRef = useRef(messages.length)
  if (lastMsgCountRef.current !== messages.length) {
    lastMsgCountRef.current = messages.length
    // Schedule after paint to avoid setState-during-render cascade
    requestAnimationFrame(() => onMessagesChange?.(messages.length))
  }

  function clearChat() {
    setMessages([])
    setStreaming(false)
    streamingRef.current = false
    queueRef.current = []
    setQueue([])
    localStorage.removeItem(storageKey(companyId, sessionKey))
    // Also reset the Claude CLI session on the gateway so next message
    // starts a fresh convo (no --resume history).
    resetSession(companyId, sessionKey)
  }
  clearChatRef.current = clearChat

  const [dragOver, setDragOver] = useState(false)
  const [fileDrag, setFileDrag] = useState(false)
  const fileDragCounter = useRef(0)

  function handleFileDragEnter(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    fileDragCounter.current++
    // Only activate for actual files, not widget drags
    if (e.dataTransfer.types.includes('Files') && !hasDragData(e)) {
      setFileDrag(true)
    }
  }

  function handleFileDragLeave(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    fileDragCounter.current--
    if (fileDragCounter.current === 0) setFileDrag(false)
  }

  const addFilesRef = useRef<(files: File[]) => void>(() => {})

  function handleFileDrop(e: React.DragEvent) {
    if (fileDrag && e.dataTransfer.files.length > 0) {
      e.preventDefault()
      e.stopPropagation()
      fileDragCounter.current = 0
      setFileDrag(false)
      addFilesRef.current(Array.from(e.dataTransfer.files))
    }
  }

  function handleDrop(e: React.DragEvent) {
    // File drop handled by handleFileDrop
    if (fileDrag) {
      handleFileDrop(e)
      return
    }

    e.preventDefault()
    setDragOver(false)
    fileDragCounter.current = 0
    setFileDrag(false)
    const ctx = getDragData(e)
    if (ctx) {
      // Add context card + assistant placeholder (no user bubble)
      setMessages(prev => [
        ...prev,
        { role: 'context' as const, text: '', context: ctx },
        { role: 'assistant' as const, text: '', loading: true, toolCalls: [] },
      ])
      setStreaming(true)
      streamingRef.current = true
      scroll()

      const skills = ALL_SKILLS
      const prompt = buildAgentPrompt(ctx)

      hermesSocket.onMessage((event: StreamEvent) => {
        handleStreamEvent(event, {
          setMessages, setStreaming, streamingRef, scroll,
          onStreamComplete, onAgentMount,
          save: (updated) => saveMessages(companyId, sessionKey, updated),
          notifyOnToolResult: true,
        })
      })

      sendChatWs({
        company_id: companyId,
        user_id: userId,
        message: prompt,
        session_key: sessionKey,
        enabled_skills: skills,
        company_context: companyContext,
      }).catch(() => {
        setStreaming(false)
        streamingRef.current = false
      })
    }
  }

  return (
    <div
      className={`flex flex-col h-full relative transition-colors ${dragOver ? 'bg-emerald-600/5 ring-2 ring-inset ring-emerald-600/30' : ''} ${fileDrag ? 'ring-2 ring-inset ring-emerald-500' : ''}`}
      onDragEnter={handleFileDragEnter}
      onDragLeave={handleFileDragLeave}
      onDragOver={(e) => { e.preventDefault(); if (hasDragData(e)) setDragOver(true) }}
      onDrop={handleDrop}
    >
      {dragOver && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <div className="bg-emerald-600/10 border-2 border-dashed border-emerald-600/40 rounded-2xl px-8 py-4">
            <p className="text-emerald-400 text-sm font-medium">Suelta aqui para hablar sobre esto</p>
          </div>
        </div>
      )}
      {fileDrag && !dragOver && (
        <div className="absolute inset-0 z-10 bg-emerald-500/10 border-2 border-dashed border-emerald-500 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <p className="text-sm font-medium text-emerald-600">Suelta archivos aqui</p>
            <p className="text-[10px] text-emerald-600/60 mt-1">Imagenes y PDFs</p>
          </div>
        </div>
      )}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-auto px-4 py-6 space-y-6">
          {messages.length === 0 && (
            <div className="pt-[15vh] text-center">
              <div className="w-10 h-10 rounded-2xl bg-emerald-600 flex items-center justify-center text-lg font-bold mx-auto mb-4">H</div>
              <p className="text-muted-foreground text-sm mb-6">Como te puedo ayudar?</p>
              <div className="grid grid-cols-1 gap-1.5 max-w-xs mx-auto">
                {SUGGESTIONS.map(s => (
                  <button key={s} onClick={() => handleSend(s)}
                    className="text-left text-xs px-3 py-2 rounded-lg border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            msg.context ? (
              <ChatContext key={i} context={msg.context} />
            ) : msg.role !== 'context' ? (
              <ChatMessage key={i} role={msg.role as 'user' | 'assistant'} text={msg.text} images={msg.images} files={msg.files}
                loading={msg.loading} toolCalls={msg.toolCalls} />
            ) : null
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="border-t border-border bg-background">
        <div className="px-3 py-2">
          {activeEntity && (
            <div className="mb-2 flex items-center gap-2 px-2 py-1.5 rounded-lg bg-primary/5 border border-primary/20">
              <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-primary/80 leading-tight">
                  Conversacion asociada a este {activeEntity.type === 'order' ? 'pedido' : 'producto'}
                </p>
                <p className="text-xs font-medium truncate">{activeEntity.label}</p>
              </div>
              <button
                onClick={onClearEntity}
                className="text-muted-foreground/60 hover:text-foreground transition-colors shrink-0"
                aria-label="Salir del contexto"
                title="Salir del contexto"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
          )}
          {queue.length > 0 && (
            <div className="mb-2 space-y-1">
              {queue.map((q, i) => (
                <div key={i} className="flex items-center gap-2 px-2 py-1 rounded-md bg-muted/50 border border-border/50 text-[11px]">
                  <span className="text-muted-foreground/60 shrink-0">En cola</span>
                  <span className="flex-1 truncate">{q.text}</span>
                  <button
                    onClick={() => {
                      queueRef.current.splice(i, 1)
                      setQueue([...queueRef.current])
                    }}
                    className="text-muted-foreground/40 hover:text-foreground shrink-0"
                    aria-label="Quitar de la cola"
                  >
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                  </button>
                </div>
              ))}
            </div>
          )}
          <ChatInput onSend={handleSend}
            placeholder={streaming ? 'Agente trabajando — tu mensaje quedara en cola...' : (hasCompany ? 'Escribe un mensaje...' : 'Responde para configurar tu cuenta...')}
            onRegisterAddFiles={(fn) => { addFilesRef.current = fn }} />
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
                      copy[copy.length - 1] = { ...last, loading: false, text: last.text || '(cancelado)' }
                    }
                    return copy
                  })
                }}
                className="text-[10px] text-muted-foreground/60 hover:text-red-500 transition-colors"
              >
                Cancelar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
