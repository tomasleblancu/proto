import { GATEWAY_URL, INTERNAL_SECRET as SECRET, WS_URL } from './config.js'
import { toast } from 'sonner'

export interface StreamEvent {
  type: 'init' | 'text' | 'tool_use' | 'tool_result' | 'result' | 'error' | 'thinking' | 'auth' | 'pong' | 'shell_refresh' | 'shell_toast'
  text?: string
  tool?: string
  args?: Record<string, unknown>
  content?: string
  message?: string
  session_id?: string
  duration_ms?: number
  cost_usd?: number
  status?: string
}

type EventHandler = (event: StreamEvent) => void

class ProtoSocket {
  private ws: WebSocket | null = null
  private authenticated = false
  private messageHandler: EventHandler | null = null
  private shellRefreshHandler: (() => void) | null = null
  private connectPromise: Promise<void> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private reconnectDelay = 3000
  private static readonly MAX_RECONNECT_DELAY = 60000

  connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN && this.authenticated) {
      return Promise.resolve()
    }

    if (this.connectPromise) return this.connectPromise

    this.connectPromise = new Promise((resolve, reject) => {
      this.ws = new WebSocket(WS_URL)

      this.ws.onopen = () => {
        // Authenticate
        this.ws!.send(JSON.stringify({ type: 'auth', secret: SECRET }))
      }

      this.ws.onmessage = (e) => {
        try {
          const event: StreamEvent = JSON.parse(e.data)

          if (event.type === 'auth' && event.status === 'ok') {
            this.authenticated = true
            this.connectPromise = null
            this.reconnectDelay = 3000 // reset on successful auth
            // Start keepalive ping every 25s to prevent idle disconnects
            if (this.pingTimer) clearInterval(this.pingTimer)
            this.pingTimer = setInterval(() => {
              if (this.ws?.readyState === WebSocket.OPEN) {
                try { this.ws.send(JSON.stringify({ type: 'ping' })) } catch {}
              }
            }, 25000)
            resolve()
            return
          }

          if (event.type === 'shell_refresh') {
            this.shellRefreshHandler?.()
            return
          }

          if (event.type === 'shell_toast') {
            const variant = (event as any).variant || 'info'
            const title = (event as any).title || event.text || ''
            const description = (event as any).description
            if (variant === 'success') toast.success(title, { description })
            else if (variant === 'error') toast.error(title, { description })
            else toast(title, { description })
            return
          }

          if (event.type === 'pong') return

          this.messageHandler?.(event)
        } catch {}
      }

      this.ws.onclose = () => {
        this.authenticated = false
        this.connectPromise = null
        if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null }
        // Synthesize an error event ONLY if a stream is in flight (handler set)
        // so the chat turn can reset. Fire only once then clear.
        if (this.messageHandler) {
          try { this.messageHandler({ type: 'error', message: 'Conexion perdida. Reintenta.' }) } catch {}
          this.messageHandler = null
        }
        // Auto-reconnect with exponential backoff (3s → 6s → 12s → ... → 60s max)
        if (!this.reconnectTimer) {
          this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null
            this.connect().catch(() => {})
          }, this.reconnectDelay)
          this.reconnectDelay = Math.min(this.reconnectDelay * 2, ProtoSocket.MAX_RECONNECT_DELAY)
        }
      }

      this.ws.onerror = () => {
        this.connectPromise = null
        try { this.messageHandler?.({ type: 'error', message: 'Error de conexion WebSocket' }) } catch {}
        reject(new Error('WebSocket connection failed'))
      }

      // Timeout
      setTimeout(() => {
        if (!this.authenticated) {
          this.connectPromise = null
          reject(new Error('WebSocket auth timeout'))
        }
      }, 10000)
    })

    return this.connectPromise
  }

  onMessage(handler: EventHandler) {
    this.messageHandler = handler
  }

  onShellRefresh(handler: () => void) {
    this.shellRefreshHandler = handler
  }

  async send(data: any) {
    await this.connect()
    this.ws?.send(JSON.stringify(data))
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN && this.authenticated
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.ws?.close()
    this.ws = null
    this.authenticated = false
  }
}

// Singleton
export const protoSocket = new ProtoSocket()

/** @deprecated Use protoSocket instead. */
export const hermesSocket = protoSocket

// Chat request params
interface ChatParams {
  company_id: string
  user_id: string
  message: string
  session_key?: string
  enabled_skills?: string[]
  company_context?: string
}

/**
 * Send a chat message via WebSocket. Events come through protoSocket.onMessage().
 */
export async function sendChatWs(params: ChatParams) {
  await protoSocket.send({ type: 'chat', channel: 'web', ...params })
}

/**
 * Reset the Claude CLI session for a company so the next message starts
 * a fresh conversation (no --resume history).
 */
export async function resetSession(companyId: string, sessionKey = 'web') {
  try {
    await fetch(`${GATEWAY_URL}/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': SECRET },
      body: JSON.stringify({ company_id: companyId, session_key: sessionKey }),
    })
  } catch {}
}

/**
 * Legacy: Send chat via REST (blocking).
 */
export async function sendChat(params: ChatParams) {
  const res = await fetch(`${GATEWAY_URL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': SECRET },
    body: JSON.stringify({ channel: 'web', ...params }),
  })
  if (!res.ok) throw new Error(`Error ${res.status}`)
  return res.json()
}

/**
 * Legacy: SSE stream (kept for fallback).
 */
export function streamChat(
  params: ChatParams,
  onEvent: (event: StreamEvent) => void,
): AbortController {
  const controller = new AbortController()

  fetch(`${GATEWAY_URL}/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': SECRET },
    body: JSON.stringify({ channel: 'web', ...params }),
    signal: controller.signal,
  }).then(async (res) => {
    if (!res.ok) { onEvent({ type: 'error', message: `Error ${res.status}` }); return }
    const reader = res.body?.getReader()
    if (!reader) return
    const decoder = new TextDecoder()
    let buffer = ''
    let gotResult = false

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const event = JSON.parse(line.slice(6))
            if (event.type === 'result' || event.type === 'error') gotResult = true
            onEvent(event)
          } catch {}
        }
      }
    }
    if (!gotResult) onEvent({ type: 'result', text: '' })
  }).catch((err) => {
    if (err.name !== 'AbortError') onEvent({ type: 'error', message: err.message })
  })

  return controller
}
