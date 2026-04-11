export interface DragContext {
  type: 'order' | 'product' | 'profile'
  id: string
  label: string
  meta?: string
  agentContext: {
    entity: string
    id: string
    summary: Record<string, any>
  }
}

export function setDragData(e: React.DragEvent, ctx: DragContext) {
  e.dataTransfer.setData('application/hermes', JSON.stringify(ctx))
  e.dataTransfer.effectAllowed = 'copy'
}

export function getDragData(e: React.DragEvent): DragContext | null {
  try {
    const raw = e.dataTransfer.getData('application/hermes')
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export function hasDragData(e: React.DragEvent): boolean {
  return e.dataTransfer.types.includes('application/hermes')
}

/**
 * Build structured context for the agent.
 * Injected as context prefix, not as user message text.
 */
export function buildAgentPrompt(ctx: DragContext): string {
  const { entity, id, summary } = ctx.agentContext
  const lines = Object.entries(summary)
    .filter(([_, v]) => v != null && v !== '')
    .map(([k, v]) => `  ${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)

  return [
    `[CONTEXTO: El usuario selecciono un ${entity}]`,
    `ID: ${id}`,
    ...lines,
    `[Consulta datos actualizados con los tools MCP si necesitas mas detalle. No repitas info que ya tienes.]`,
  ].join('\n')
}
