import { useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

interface ToolCall {
  tool: string
  status: 'running' | 'done'
  args?: Record<string, unknown>
}

interface Props {
  role: 'user' | 'assistant'
  text: string
  images?: string[]
  files?: { name: string; type: string }[]
  loading?: boolean
  queued?: boolean
  toolCalls?: ToolCall[]
}

const TOOL_LABELS: Record<string, string> = {
  'mcp__hermes__create_order': 'Creando pedido',
  'mcp__hermes__update_order_status': 'Actualizando estado',
  'mcp__hermes__get_order': 'Consultando pedido',
  'mcp__hermes__list_orders': 'Buscando pedidos',
  'mcp__hermes__delete_order': 'Eliminando pedido',
  'mcp__hermes__get_order_timeline': 'Revisando historial',
  'mcp__hermes__upload_document': 'Subiendo documento',
  'mcp__hermes__list_documents': 'Buscando documentos',
  'mcp__hermes__validate_document_set': 'Validando documentos',
  'mcp__hermes__get_document': 'Consultando documento',
  'mcp__hermes__create_reorder_rule': 'Creando regla de recompra',
  'mcp__hermes__check_reorders': 'Revisando recompras pendientes',
  'mcp__hermes__trigger_reorder': 'Ejecutando recompra',
  'mcp__hermes__list_reorder_rules': 'Buscando reglas de recompra',
  'mcp__hermes__send_alert': 'Enviando alerta',
  'mcp__hermes__create_product': 'Registrando producto',
  'mcp__hermes__list_products': 'Buscando productos',
  'mcp__hermes__get_product': 'Consultando producto',
  'mcp__hermes__update_product': 'Actualizando producto',
  'mcp__hermes__add_order_item': 'Agregando al pedido',
  'mcp__hermes__list_order_items': 'Consultando items',
  'mcp__hermes__update_order_item': 'Actualizando item',
  'mcp__hermes__delete_order_item': 'Eliminando item',
  'mcp__hermes__get_profile': 'Consultando perfil',
  'mcp__hermes__update_profile': 'Guardando perfil',
  'mcp__hermes__get_inventory': 'Consultando inventario',
  'mcp__hermes__adjust_inventory': 'Ajustando inventario',
  'mcp__hermes__get_inventory_history': 'Historial inventario',
  'mcp__hermes__gmail_status': 'Verificando Gmail',
  'mcp__hermes__read_emails': 'Leyendo correos',
  'mcp__hermes__send_email': 'Enviando correo',
  'mcp__hermes__search_emails': 'Buscando correos',
  'mcp__hermes__get_item_state': 'Consultando estado del item',
  'mcp__hermes__advance_step': 'Avanzando paso',
  'mcp__hermes__record_payment': 'Registrando pago',
  'mcp__hermes__list_payments': 'Consultando pagos',
  'mcp__hermes__attach_document': 'Adjuntando documento',
  'mcp__hermes__list_required_docs': 'Revisando docs requeridos',
  'mcp__hermes__create_supplier': 'Creando proveedor',
  'mcp__hermes__create_order_item': 'Creando item de pedido',
  'mcp__hermes__activate_order': 'Activando pedido',
  'mcp__hermes__deactivate_order': 'Desactivando pedido',
  'mcp__hermes__render_ui': 'Generando vista',
  'mcp__hermes__list_suppliers': 'Buscando proveedores',
  'mcp__hermes__create_company': 'Creando empresa',
  'mcp__hermes__list_companies': 'Buscando empresas',
  'mcp__hermes__add_company_user': 'Agregando usuario',
  'Bash': 'Procesando',
  'Read': 'Leyendo archivo',
  'Write': 'Escribiendo archivo',
  'Edit': 'Editando archivo',
  'Glob': 'Buscando archivos',
  'Grep': 'Buscando contenido',
  'Agent': 'Delegando tarea',
}

const HIDDEN_TOOLS = new Set(['ToolSearch', 'Skill', '__thinking__'])

function getToolLabel(tool: string): string | null {
  if (HIDDEN_TOOLS.has(tool)) return null
  return TOOL_LABELS[tool] || tool.replace('mcp__hermes__', '').replace(/_/g, ' ')
}

/** Generate a contextual description from tool name + args */
function getToolDetail(tool: string, args?: Record<string, unknown>): string | null {
  if (HIDDEN_TOOLS.has(tool)) return null
  if (!args || Object.keys(args).length === 0) return getToolLabel(tool)

  const base = tool.replace('mcp__hermes__', '')

  // Extract common arg values
  const id = (args.order_id || args.product_id || args.item_id || args.supplier_id || args.rule_id || args.document_id) as string | undefined
  const name = args.name as string | undefined
  const status = args.status as string | undefined
  const step = args.step as string | undefined
  const query = args.query as string | undefined
  const filePath = args.file_path as string | undefined
  const to = args.to as string | undefined
  const subject = args.subject as string | undefined
  const pattern = args.pattern as string | undefined

  switch (base) {
    case 'get_order': return id ? `Consultando pedido ${id}` : 'Consultando pedido'
    case 'list_orders': return status ? `Buscando pedidos ${status}` : 'Buscando pedidos'
    case 'get_product': return id ? `Consultando producto ${id}` : (name ? `Consultando ${name}` : 'Consultando producto')
    case 'list_products': return query ? `Buscando productos: "${query}"` : 'Buscando productos'
    case 'create_product': return name ? `Registrando producto: ${name}` : 'Registrando producto'
    case 'update_product': return name ? `Actualizando ${name}` : 'Actualizando producto'
    case 'get_item_state': return id ? `Estado del item ${id}` : 'Consultando estado'
    case 'advance_step': return step ? `Avanzando a ${step.replace(/_/g, ' ')}` : 'Avanzando paso'
    case 'list_order_items': return id ? `Items del pedido ${id}` : 'Consultando items'
    case 'create_order_item': return name ? `Creando item: ${name}` : 'Creando item'
    case 'attach_document': return step ? `Adjuntando doc en ${step.replace(/_/g, ' ')}` : 'Adjuntando documento'
    case 'list_documents': return id ? `Documentos del pedido ${id}` : 'Buscando documentos'
    case 'list_required_docs': return step ? `Docs requeridos para ${step.replace(/_/g, ' ')}` : 'Revisando docs requeridos'
    case 'record_payment': return (args.amount && args.currency) ? `Registrando pago ${args.currency} ${args.amount}` : 'Registrando pago'
    case 'list_payments': return id ? `Pagos del pedido ${id}` : 'Consultando pagos'
    case 'send_email': return to ? `Enviando correo a ${to}` : (subject ? `Enviando: ${subject}` : 'Enviando correo')
    case 'search_emails': return query ? `Buscando correos: "${query}"` : 'Buscando correos'
    case 'read_emails': return 'Leyendo correos recientes'
    case 'create_supplier': return name ? `Creando proveedor: ${name}` : 'Creando proveedor'
    case 'list_suppliers': return 'Buscando proveedores'
    case 'get_inventory': return id ? `Inventario del producto ${id}` : 'Consultando inventario'
    case 'adjust_inventory': return (args.quantity) ? `Ajustando stock: ${Number(args.quantity) > 0 ? '+' : ''}${args.quantity}` : 'Ajustando inventario'
    case 'activate_order': return id ? `Activando pedido ${id}` : 'Activando pedido'
    case 'create_order': return name ? `Creando pedido: ${name}` : 'Creando pedido'
    case 'validate_document_set': return 'Validando documentos completos'
  }

  // Internal Claude tools with path context
  if (tool === 'Read' && filePath) {
    const short = filePath.split('/').slice(-2).join('/')
    return `Leyendo ${short}`
  }
  if (tool === 'Grep' && pattern) return `Buscando: "${pattern}"`
  if (tool === 'Glob' && pattern) return `Buscando archivos: ${pattern}`
  if (tool === 'Bash') {
    const cmd = args.command as string | undefined
    if (cmd) {
      const short = cmd.length > 40 ? cmd.slice(0, 40) + '...' : cmd
      return `Ejecutando: ${short}`
    }
  }

  return getToolLabel(tool)
}

export default function ChatMessage({ role, text, images, files, loading, queued, toolCalls }: Props) {
  const [showTools, setShowTools] = useState(false)

  if (role === 'user') {
    return (
      <div className="flex justify-end items-end gap-2">
        {queued && (
          <span className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-pulse" />
            en cola
          </span>
        )}
        <div className={cn(
          'max-w-[80%] rounded-2xl rounded-br-md px-4 py-2.5 text-sm leading-relaxed',
          queued ? 'bg-muted/50 text-muted-foreground' : 'bg-muted'
        )}>
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
                  <svg className="w-4 h-4 text-muted-foreground shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  <span className="text-xs truncate">{f.name}</span>
                </div>
              ))}
            </div>
          )}
          {text && text !== '(imagen adjunta)' && text !== '(archivo adjunto)' && text}
        </div>
      </div>
    )
  }

  const visibleTools = (toolCalls || []).filter(tc => getToolLabel(tc.tool) !== null)
  const thinkingSteps = (toolCalls || []).filter(tc => tc.tool === '__thinking__')
  const hasText = !!text
  const hasActiveTools = visibleTools.some(tc => tc.status === 'running')
  const showDots = loading && !hasText && !hasActiveTools && visibleTools.length === 0 && thinkingSteps.length === 0

  // Extract last thinking summary (truncated)
  const lastThinking = thinkingSteps.length > 0 ? thinkingSteps[thinkingSteps.length - 1] : null
  const thinkingText = lastThinking?.args?.text as string | undefined
  const thinkingSummary = thinkingText
    ? (thinkingText.length > 80 ? thinkingText.slice(0, 80) + '...' : thinkingText)
    : null

  return (
    <div className="flex gap-3">
      <Avatar className="w-7 h-7 flex-shrink-0 mt-0.5">
        <AvatarFallback className="bg-emerald-600 text-white text-xs font-bold">H</AvatarFallback>
      </Avatar>
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
              /* During streaming: show last 3 + toggle for older */
              <div className="space-y-1">
                {visibleTools.length > 3 && (
                  <button
                    onClick={() => setShowTools(!showTools)}
                    className="flex items-center gap-1.5 text-[11px] text-muted-foreground/40 hover:text-muted-foreground transition-colors"
                  >
                    <span className="text-emerald-600">&#10003;</span>
                    {visibleTools.length - 3} accion(es) anteriores
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
                        <span className="text-emerald-800">&#10003;</span>
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
                      <span className="w-3 h-3 border-2 border-muted border-t-emerald-500 rounded-full animate-spin" />
                    ) : (
                      <span className="w-3 h-3 flex items-center justify-center text-emerald-600 text-[10px]">&#10003;</span>
                    )}
                    {getToolDetail(tc.tool, tc.args)}
                  </div>
                ))}
              </div>
            ) : (
              /* All done: collapsible summary */
              <>
                <button
                  onClick={() => setShowTools(!showTools)}
                  className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                >
                  <span className="text-emerald-600">&#10003;</span>
                  {visibleTools.length === 1 ? getToolDetail(visibleTools[0].tool, visibleTools[0].args) : `${visibleTools.length} acciones ejecutadas`}
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    className={cn('transition-transform', showTools && 'rotate-180')}>
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                {showTools && (
                  <div className="mt-1 space-y-0.5 pl-4">
                    {visibleTools.map((tc, i) => (
                      <div key={i} className="text-[11px] text-muted-foreground/40 flex items-center gap-1.5">
                        <span className="text-emerald-800">&#10003;</span>
                        {getToolDetail(tc.tool, tc.args)}
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
          <div className="prose prose-invert prose-sm max-w-none">
            <Markdown remarkPlugins={[remarkGfm]} components={{
              p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
              ul: ({ children }) => <ul className="mb-2 space-y-1 list-disc list-inside">{children}</ul>,
              ol: ({ children }) => <ol className="mb-2 space-y-1 list-decimal list-inside">{children}</ol>,
              li: ({ children }) => <li className="text-muted-foreground">{children}</li>,
              strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
              code: ({ children, className }) => {
                if (className?.includes('language-')) {
                  return <code className="block bg-card border rounded-lg px-3 py-2 text-xs font-mono overflow-x-auto my-2">{children}</code>
                }
                return <code className="bg-card px-1.5 py-0.5 rounded text-xs font-mono text-emerald-400">{children}</code>
              },
              pre: ({ children }) => <>{children}</>,
              table: ({ children }) => <div className="overflow-x-auto my-2"><table className="w-full text-xs border-collapse">{children}</table></div>,
              th: ({ children }) => <th className="text-left px-3 py-1.5 border-b border-border text-muted-foreground font-medium">{children}</th>,
              td: ({ children }) => <td className="px-3 py-1.5 border-b border-border/50 text-muted-foreground">{children}</td>,
              h1: ({ children }) => <h1 className="text-base font-semibold text-foreground mb-2 mt-3">{children}</h1>,
              h2: ({ children }) => <h2 className="text-sm font-semibold text-foreground mb-1.5 mt-2">{children}</h2>,
              h3: ({ children }) => <h3 className="text-sm font-medium mb-1 mt-2">{children}</h3>,
              blockquote: ({ children }) => <blockquote className="border-l-2 border-emerald-600 pl-3 my-2 text-muted-foreground italic">{children}</blockquote>,
              hr: () => <hr className="border-border my-3" />,
              a: ({ href, children }) => <a href={href} target="_blank" rel="noopener" className="text-emerald-400 hover:text-emerald-300 underline">{children}</a>,
            }}>
              {text}
            </Markdown>
          </div>
        )}
      </div>
    </div>
  )
}
