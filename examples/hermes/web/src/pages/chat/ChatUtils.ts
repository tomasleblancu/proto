import type React from 'react'
import type { StreamEvent } from '@tleblancureta/proto/web'
import type { Message, ActiveEntity } from './ChatTypes'

/** Parses `activate_<name>` / `deactivate_<name>` tool names (with optional MCP prefix). */
export function parseEntityToolName(tool: string | undefined, verb: 'activate' | 'deactivate'): string | null {
  if (!tool) return null
  const suffix = tool.includes('__') ? tool.split('__').pop()! : tool
  const match = suffix.match(new RegExp(`^${verb}_([a-z_]+)$`))
  return match ? match[1] : null
}

export const ALL_SKILLS = ['hermes-company', 'hermes-products', 'hermes-intake', 'hermes-orders', 'hermes-documents', 'hermes-reorders', 'hermes-customs-cl', 'hermes-inventory', 'hermes-gmail', 'hermes-sourcing', 'hermes-ui', 'hermes-scheduling']

export const SUGGESTIONS = [
  'Lista los pedidos activos',
  'Crea un nuevo pedido de importacion',
  'Revisa documentos pendientes',
  'Muestra reglas de recompra',
]

export function sessionKeyFor(activeEntity?: ActiveEntity | null) {
  if (activeEntity?.type === 'order') return `order-${activeEntity.id}`
  if (activeEntity?.type === 'product') return `product-${activeEntity.id}`
  return 'web'
}

export function storageKey(companyId: string, session: string) { return `hermes-chat-${companyId}-${session}` }

export function loadMessages(companyId: string, session: string): Message[] {
  try {
    const raw = localStorage.getItem(storageKey(companyId, session))
    if (!raw) return []
    return (JSON.parse(raw) as Message[]).map(m => ({
      ...m, loading: false,
      toolCalls: m.toolCalls?.map(tc => ({ ...tc, status: 'done' as const })),
    }))
  } catch { return [] }
}

export function saveMessages(companyId: string, session: string, messages: Message[]) {
  try { localStorage.setItem(storageKey(companyId, session), JSON.stringify(messages.filter(m => !m.loading || m.text))) } catch {}
}

export interface StreamHandlerCallbacks {
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>
  setStreaming: (v: boolean) => void
  streamingRef: React.MutableRefObject<boolean>
  scroll: () => void
  onStreamComplete?: () => void
  onAgentMount?: (spec: any, title?: string) => void
  onAgentActivateEntity?: (type: string, id: string) => void
  onAgentDeactivateEntity?: (type: string) => void
  save: (updated: Message[]) => void
  drainQueue?: () => void
  notifyOnToolResult?: boolean
}

function allDone(tcs: Message['toolCalls']) {
  return (tcs || []).map(tc => ({ ...tc, status: 'done' as const }))
}

export function handleStreamEvent(event: StreamEvent, cb: StreamHandlerCallbacks) {
  cb.setMessages(prev => {
    const updated = [...prev]
    const last = updated[updated.length - 1]
    if (last.role !== 'assistant') return updated

    switch (event.type) {
      case 'text':
        updated[updated.length - 1] = {
          ...last, text: last.text + (event.text || ''), loading: false,
          toolCalls: allDone(last.toolCalls),
        }
        break
      case 'tool_use':
        if ((event.tool === 'render_ui' || event.tool?.endsWith('__render_ui')) && (event as any).args) {
          const args = (event as any).args
          cb.onAgentMount?.(args.spec, args.title)
        }
        {
          const activateName = parseEntityToolName(event.tool, 'activate')
          if (activateName) {
            const args = (event as any).args
            const id = args?.[`${activateName}_id`]
            if (id) cb.onAgentActivateEntity?.(activateName, id)
          }
          const deactivateName = parseEntityToolName(event.tool, 'deactivate')
          if (deactivateName) {
            cb.onAgentDeactivateEntity?.(deactivateName)
          }
        }
        updated[updated.length - 1] = {
          ...last,
          toolCalls: [...allDone(last.toolCalls), { tool: event.tool || '', status: 'running', args: (event as any).args }],
        }
        break
      case 'thinking':
        updated[updated.length - 1] = {
          ...last,
          toolCalls: [...(last.toolCalls || []), { tool: '__thinking__', status: 'done', args: { text: event.text } }],
        }
        break
      case 'tool_result':
        updated[updated.length - 1] = { ...last, toolCalls: allDone(last.toolCalls) }
        if (cb.notifyOnToolResult) cb.onStreamComplete?.()
        break
      case 'result':
        updated[updated.length - 1] = {
          ...last, text: last.text || event.text || '', loading: false,
          toolCalls: allDone(last.toolCalls),
        }
        cb.setStreaming(false)
        cb.streamingRef.current = false
        cb.onStreamComplete?.()
        cb.save(updated)
        cb.drainQueue?.()
        break
      case 'error':
        updated[updated.length - 1] = {
          role: 'assistant', text: `Error: ${event.message}`,
          toolCalls: allDone(last.toolCalls),
        }
        cb.setStreaming(false)
        cb.streamingRef.current = false
        cb.onStreamComplete?.()
        cb.save(updated)
        cb.drainQueue?.()
        break
    }
    cb.scroll()
    return updated
  })
}
