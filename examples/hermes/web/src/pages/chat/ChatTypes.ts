import type { DragContext } from '@tleblancureta/proto/web'

export interface Message {
  role: 'user' | 'assistant' | 'context'
  text: string
  images?: string[]
  files?: { name: string; type: string }[]
  loading?: boolean
  toolCalls?: { tool: string; status: 'running' | 'done'; args?: Record<string, unknown> }[]
  context?: DragContext
}

export interface ActiveEntity {
  type: 'order' | 'product'
  id: string
  label: string
}

export interface ChatProps {
  companyId: string
  userId: string
  companyContext?: string
  hasCompany: boolean
  onStreamComplete?: () => void
  onRegisterSend?: (fn: (msg: string) => void) => void
  onRegisterClear?: (fn: () => void) => void
  onMessagesChange?: (count: number) => void
  onAgentMount?: (spec: any, title?: string) => void
  onAgentActivateEntity?: (type: string, id: string) => void
  onAgentDeactivateEntity?: (type: string) => void
  activeEntity?: ActiveEntity | null
  onClearEntity?: () => void
}
