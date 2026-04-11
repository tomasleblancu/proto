import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getSupabase } from '../supabase.js'
import {
  PHASES,
  PHASE_STEPS,
  PHASE_EXECUTION,
  requiresHumanApproval,
  type Phase,
  detectTlcRequirement,
} from '@proto/core-shared'
import { agent, agentErr, isValidStep } from './_helpers.js'

const PHASE_ORDER = PHASES as readonly Phase[]
const phaseIdx = (p: Phase) => PHASE_ORDER.indexOf(p)

// ── Step hints ──

const STEP_HINTS: Record<string, string> = {
  'purchase_order.register_deposit_payment': 'Registra el deposito con record_payment(type="deposit"), luego avanza a po_confirmed_by_supplier.',
  'documentation.collect_commercial_invoice': 'Usa attach_document(kind="commercial_invoice") con extracted. Despues de todos los docs, llama validate_document_set.',
  'customs_cl.register_customs_funds_provision': 'Adjunta customs_funds_provision y registra el pago. La provision cubre duties + port + customs_agent.',
  'shipping.arrived_port_cl': 'Prepara aduana: verifica docs completos (validate_document_set) antes de avanzar a customs_cl.',
  'closed.compute_real_vs_estimated': 'Llama get_costing para comparar estimado vs actual. Revisa el delta.',
}

function buildStepHint(phase: Phase, step: string): string | undefined {
  const key = `${phase}.${step}`
  if (STEP_HINTS[key]) return STEP_HINTS[key]

  if (requiresHumanApproval(phase, step)) {
    return 'Este step requiere aprobacion humana. Llama request_human_approval con el packet de datos.'
  }

  const steps = PHASE_STEPS[phase] as readonly string[]
  const idx = steps.indexOf(step)

  if (idx < steps.length - 1) {
    return `Proximo step en ${phase}: "${steps[idx + 1]}"`
  }

  const nextPhaseIdx = PHASE_ORDER.indexOf(phase) + 1
  if (nextPhaseIdx < PHASE_ORDER.length) {
    const nextPhase = PHASE_ORDER[nextPhaseIdx]
    return `Ultimo step de ${phase}. Proxima fase: "${nextPhase}" (primer step: "${(PHASE_STEPS[nextPhase] as readonly string[])[0]}")`
  }
  return undefined
}

function flagsSummary(item: any): string {
  const flags: string[] = []
  if (item.on_hold) flags.push('ON HOLD')
  if (item.blocked_reason) flags.push(`BLOCKED: ${item.blocked_reason}`)
  if (item.cancelled) flags.push('CANCELLED')
  return flags.length ? ` [${flags.join(', ')}]` : ''
}

// ── Tools ──

export function registerWorkflowTools(server: McpServer) {
  server.tool(
    'get_item_state',
    'Snapshot del state machine para un item: fase, sub-paso, flags, y si requiere aprobacion humana.',
    { item_id: z.string() },
    async ({ item_id }) => {
      const db = getSupabase()
      const { data: item, error } = await db
        .from('order_items')
        .select('id, order_id, current_phase, current_step, on_hold, blocked_reason, cancelled, metadata')
        .eq('id', item_id)
        .single()
      if (error || !item) return agentErr(error?.message ?? 'Item no encontrado')

      const phase = item.current_phase as Phase
      const exec = PHASE_EXECUTION[phase]
      const stepsForPhase = PHASE_STEPS[phase] as readonly string[]
      const stepIdx = stepsForPhase.indexOf(item.current_step)

      return agent({
        summary: `Item ${item_id}: ${phase}.${item.current_step}${flagsSummary(item)}`,
        data: {
          item_id: item.id,
          order_id: item.order_id,
          phase: item.current_phase,
          step: item.current_step,
          on_hold: item.on_hold,
          blocked_reason: item.blocked_reason,
          cancelled: item.cancelled,
          steps_in_phase: stepsForPhase,
          step_index: stepIdx,
          is_last_step: stepIdx === stepsForPhase.length - 1,
          requires_human_approval: requiresHumanApproval(phase, item.current_step),
          execution_context: exec,
        },
        hint: buildStepHint(phase, item.current_step),
      })
    }
  )

  server.tool(
    'list_items_by_phase',
    'Lista items de una empresa, opcionalmente filtrando por fase.',
    {
      company_id: z.string(),
      phase: z.enum(PHASES).optional(),
      include_cancelled: z.boolean().default(false),
    },
    async ({ company_id, phase, include_cancelled }) => {
      const db = getSupabase()
      let q = db
        .from('order_items')
        .select('id, order_id, description, current_phase, current_step, on_hold, blocked_reason')
        .eq('company_id', company_id)
      if (phase) q = q.eq('current_phase', phase)
      if (!include_cancelled) q = q.eq('cancelled', false)
      const { data, error } = await q.order('updated_at', { ascending: false })
      if (error) return agentErr(`Error listando items: ${error.message}`)

      const items = (data || []).map(i => ({
        id: i.id,
        order_id: i.order_id,
        description: i.description,
        phase: i.current_phase,
        step: i.current_step,
        on_hold: i.on_hold,
        blocked: !!i.blocked_reason,
      }))

      return agent({
        summary: `${items.length} item(s)${phase ? ` en ${phase}` : ''} para empresa ${company_id}`,
        data: { items },
      })
    }
  )

  server.tool(
    'advance_step',
    'Avanza un item al siguiente sub-paso o a una nueva fase. Valida transicion legal.',
    {
      item_id: z.string(),
      to_phase: z.enum(PHASES),
      to_step: z.string(),
      actor: z.string().describe('agent | user'),
      reason: z.string().optional(),
      evidence: z.record(z.string(), z.any()).optional(),
    },
    async ({ item_id, to_phase, to_step, actor, reason, evidence }) => {
      const db = getSupabase()
      const { data: item, error: e1 } = await db
        .from('order_items')
        .select('id, order_id, company_id, current_phase, current_step, on_hold, blocked_reason, cancelled')
        .eq('id', item_id).single()
      if (e1 || !item) return agentErr(e1?.message ?? 'Item no encontrado')

      if (item.cancelled) return agentErr('Item cancelado, no se puede avanzar')
      if (item.on_hold) return agentErr('Item en hold. Llama resume_item primero.')
      if (item.blocked_reason) return agentErr(`Item bloqueado: ${item.blocked_reason}. Llama unblock_item primero.`)

      if (!isValidStep(to_phase, to_step)) {
        const validSteps = PHASE_STEPS[to_phase] as readonly string[]
        return agentErr(`Step "${to_step}" no existe en fase "${to_phase}"`, { valid_steps: validSteps as unknown as Record<string, unknown> })
      }

      const fromIdx = phaseIdx(item.current_phase as Phase)
      const toIdx = phaseIdx(to_phase)
      if (toIdx < fromIdx) return agentErr('No se puede retroceder de fase')
      if (toIdx > fromIdx + 1) return agentErr('Solo se puede avanzar 1 fase a la vez')

      if (requiresHumanApproval(to_phase, to_step) && actor !== 'user') {
        return agentErr(`Step "${to_phase}.${to_step}" requiere aprobacion humana. Llama request_human_approval.`)
      }

      const { error: e2 } = await db
        .from('order_items')
        .update({ current_phase: to_phase, current_step: to_step, updated_at: new Date().toISOString() })
        .eq('id', item_id)
      if (e2) return agentErr(`Error avanzando: ${e2.message}`)

      await db.from('phase_transitions').insert({
        item_id,
        company_id: item.company_id,
        from_phase: item.current_phase,
        to_phase,
        from_step: item.current_step,
        to_step,
        actor,
        reason,
        evidence: evidence ?? {},
      })

      return agent({
        summary: `Item ${item_id} avanzado a ${to_phase}.${to_step}`,
        data: { item_id, phase: to_phase, step: to_step },
        hint: buildStepHint(to_phase as Phase, to_step),
      })
    }
  )

  server.tool(
    'block_item',
    'Marca un item como bloqueado con razon.',
    { item_id: z.string(), reason: z.string() },
    async ({ item_id, reason }) => {
      const db = getSupabase()
      const { error } = await db.from('order_items')
        .update({ blocked_reason: reason, updated_at: new Date().toISOString() })
        .eq('id', item_id)
      if (error) return agentErr(`Error bloqueando: ${error.message}`)
      return agent({
        summary: `Item ${item_id} bloqueado: ${reason}`,
        data: { item_id, blocked_reason: reason },
      })
    }
  )

  server.tool(
    'unblock_item',
    'Quita el bloqueo de un item.',
    { item_id: z.string() },
    async ({ item_id }) => {
      const db = getSupabase()
      const { error } = await db.from('order_items')
        .update({ blocked_reason: null, updated_at: new Date().toISOString() })
        .eq('id', item_id)
      if (error) return agentErr(`Error desbloqueando: ${error.message}`)
      return agent({
        summary: `Item ${item_id} desbloqueado.`,
        data: { item_id },
        hint: 'Item puede avanzar. Revisa get_item_state para ver posicion actual.',
      })
    }
  )

  server.tool(
    'hold_item',
    'Pausa un item (on_hold=true).',
    { item_id: z.string() },
    async ({ item_id }) => {
      const db = getSupabase()
      const { error } = await db.from('order_items')
        .update({ on_hold: true, updated_at: new Date().toISOString() })
        .eq('id', item_id)
      if (error) return agentErr(`Error pausando: ${error.message}`)
      return agent({
        summary: `Item ${item_id} pausado.`,
        data: { item_id, on_hold: true },
      })
    }
  )

  server.tool(
    'resume_item',
    'Reanuda un item pausado.',
    { item_id: z.string() },
    async ({ item_id }) => {
      const db = getSupabase()
      const { error } = await db.from('order_items')
        .update({ on_hold: false, updated_at: new Date().toISOString() })
        .eq('id', item_id)
      if (error) return agentErr(`Error reanudando: ${error.message}`)
      return agent({
        summary: `Item ${item_id} reanudado.`,
        data: { item_id, on_hold: false },
        hint: 'Item puede avanzar. Revisa get_item_state para ver posicion actual.',
      })
    }
  )

  server.tool(
    'cancel_item',
    'Cancela un item (terminal).',
    { item_id: z.string(), reason: z.string().optional() },
    async ({ item_id, reason }) => {
      const db = getSupabase()
      const { data: item } = await db.from('order_items')
        .select('company_id, current_phase, current_step')
        .eq('id', item_id).single()
      const { error } = await db.from('order_items')
        .update({ cancelled: true, updated_at: new Date().toISOString() })
        .eq('id', item_id)
      if (error) return agentErr(`Error cancelando: ${error.message}`)

      if (item) {
        await db.from('phase_transitions').insert({
          item_id,
          company_id: item.company_id,
          from_phase: item.current_phase,
          to_phase: item.current_phase,
          from_step: item.current_step,
          to_step: 'cancelled',
          actor: 'agent',
          reason,
        })
      }

      return agent({
        summary: `Item ${item_id} cancelado.`,
        data: { item_id, cancelled: true },
      })
    }
  )

  server.tool(
    'request_human_approval',
    'Marca un item como esperando aprobacion humana. La UI debe llamar advance_step con actor=user para confirmar.',
    {
      item_id: z.string(),
      packet: z.record(z.string(), z.any()).describe('Datos a presentar al humano (resumen de costos, docs, etc.)'),
    },
    async ({ item_id, packet }) => {
      const db = getSupabase()
      const { data: item } = await db.from('order_items')
        .select('company_id, current_phase, current_step')
        .eq('id', item_id).single()
      if (!item) return agentErr('Item no encontrado')
      if (!requiresHumanApproval(item.current_phase, item.current_step)) {
        return agentErr('Este step no es un gate de aprobacion humana')
      }

      await db.from('phase_transitions').insert({
        item_id,
        company_id: item.company_id,
        from_phase: item.current_phase,
        to_phase: item.current_phase,
        from_step: item.current_step,
        to_step: item.current_step,
        actor: 'agent',
        reason: 'awaiting_human_approval',
        evidence: packet,
      })

      return agent({
        summary: `Aprobacion humana solicitada para item ${item_id} en ${item.current_phase}.${item.current_step}`,
        data: { item_id, phase: item.current_phase, step: item.current_step },
        hint: 'NO llames advance_step. El usuario aprobara via UI, que llama advance_step con actor="user".',
      })
    }
  )

  server.tool(
    'detect_tlc_requirement',
    'Dado un pais origen (ISO alpha-2), devuelve si requiere form_f, certificate_of_origin, o ninguno.',
    { country_code: z.string() },
    async ({ country_code }) => {
      const result = detectTlcRequirement(country_code)
      return agent({
        summary: `${country_code}: ${result === 'none' ? 'sin TLC, arancel general' : `requiere ${result}`}`,
        data: { country_code, requires: result },
        hint: result !== 'none'
          ? `En documentation, adjunta ${result} con attach_document(kind="${result}").`
          : 'Sin TLC. Arancel general 6% aplica. Anotar en metadata del item.',
      })
    }
  )
}
