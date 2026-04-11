/**
 * buildWorkflowTools — generates MCP tools from a WorkflowDefinition.
 *
 * Emits 9 tools per workflow (names are configurable via `toolNames`):
 *
 *   get_item_state, list_items_by_phase, advance_step,
 *   block_item, unblock_item, hold_item, resume_item, cancel_item,
 *   request_human_approval
 *
 * Defaults keep the tool names stable so existing skills keep working. If an
 * app has multiple workflows, set `toolNames` on each to avoid collisions.
 */
import { z } from 'zod'
import type {
  WorkflowDefinition,
  WorkflowPhase,
} from '@proto/core-shared'
import {
  workflowPhaseNames,
  workflowPhaseSteps,
  workflowPhaseIndex,
  workflowIsValidStep,
  workflowRequiresHumanApproval,
  workflowExecution,
} from '@proto/core-shared'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { defineTool, registerTools, type ToolDefinition } from './define-tool.js'
import { getSupabase } from './supabase.js'
import { agent, agentErr } from './tools/_helpers.js'

const DEFAULT_COLS = {
  phase: 'current_phase',
  step: 'current_step',
  onHold: 'on_hold',
  blocked: 'blocked_reason',
  cancelled: 'cancelled',
  company: 'company_id',
  updatedAt: 'updated_at',
}

const DEFAULT_NAMES = {
  getState: 'get_item_state',
  listByPhase: 'list_items_by_phase',
  advanceStep: 'advance_step',
  blockItem: 'block_item',
  unblockItem: 'unblock_item',
  holdItem: 'hold_item',
  resumeItem: 'resume_item',
  cancelItem: 'cancel_item',
  requestHumanApproval: 'request_human_approval',
}

function resolveCols(wf: WorkflowDefinition) {
  return { ...DEFAULT_COLS, ...(wf.columns || {}) }
}

function resolveNames(wf: WorkflowDefinition) {
  return { ...DEFAULT_NAMES, ...(wf.toolNames || {}) }
}

function flagsSummary(item: Record<string, any>, cols: ReturnType<typeof resolveCols>): string {
  const flags: string[] = []
  if (item[cols.onHold]) flags.push('ON HOLD')
  if (item[cols.blocked]) flags.push(`BLOCKED: ${item[cols.blocked]}`)
  if (item[cols.cancelled]) flags.push('CANCELLED')
  return flags.length ? ` [${flags.join(', ')}]` : ''
}

function buildStepHint(wf: WorkflowDefinition, phase: string, step: string): string | undefined {
  const key = `${phase}.${step}`
  if (wf.stepHints?.[key]) return wf.stepHints[key]

  if (workflowRequiresHumanApproval(wf, phase, step)) {
    return 'Este step requiere aprobacion humana. Llama request_human_approval con el packet de datos.'
  }

  const steps = workflowPhaseSteps(wf, phase)
  const idx = steps.indexOf(step)
  if (idx === -1) return undefined

  if (idx < steps.length - 1) {
    return `Proximo step en ${phase}: "${steps[idx + 1]}"`
  }

  const phaseIdx = workflowPhaseIndex(wf, phase)
  if (phaseIdx < wf.phases.length - 1) {
    const nextPhase = wf.phases[phaseIdx + 1]
    return `Ultimo step de ${phase}. Proxima fase: "${nextPhase.name}" (primer step: "${workflowPhaseSteps(wf, nextPhase.name)[0]}")`
  }
  return undefined
}

export function buildWorkflowTools(wf: WorkflowDefinition) {
  const cols = resolveCols(wf)
  const names = resolveNames(wf)
  const phaseNames = workflowPhaseNames(wf)
  const executions = workflowExecution(wf)

  // Zod enum needs a non-empty tuple; cast fits.
  const phaseEnum = z.enum(phaseNames as [string, ...string[]])

  return [
    defineTool({
      name: names.getState,
      description: `Snapshot del state machine para un item del workflow ${wf.name}: fase, sub-paso, flags, y si requiere aprobacion humana.`,
      schema: { item_id: z.string() },
      handler: async ({ item_id }) => {
        const db = getSupabase()
        const selectCols = [
          'id', 'order_id',
          cols.phase, cols.step, cols.onHold, cols.blocked, cols.cancelled,
        ].join(', ')
        const { data: item, error } = await db
          .from(wf.entityTable)
          .select(selectCols)
          .eq('id', item_id)
          .single()
        if (error || !item) return agentErr(error?.message ?? 'Item no encontrado')

        const phase = (item as any)[cols.phase]
        const step = (item as any)[cols.step]
        const stepsForPhase = workflowPhaseSteps(wf, phase)
        const stepIdx = stepsForPhase.indexOf(step)

        return agent({
          summary: `Item ${item_id}: ${phase}.${step}${flagsSummary(item as any, cols)}`,
          data: {
            item_id: (item as any).id,
            order_id: (item as any).order_id,
            phase,
            step,
            on_hold: (item as any)[cols.onHold],
            blocked_reason: (item as any)[cols.blocked],
            cancelled: (item as any)[cols.cancelled],
            steps_in_phase: stepsForPhase,
            step_index: stepIdx,
            is_last_step: stepIdx === stepsForPhase.length - 1,
            requires_human_approval: workflowRequiresHumanApproval(wf, phase, step),
            execution_context: executions[phase] ?? null,
          },
          hint: buildStepHint(wf, phase, step),
        })
      },
    }),

    defineTool({
      name: names.listByPhase,
      description: `Lista items de una empresa en el workflow ${wf.name}, opcionalmente filtrando por fase.`,
      schema: {
        company_id: z.string(),
        phase: phaseEnum.optional(),
        include_cancelled: z.boolean().default(false),
      },
      handler: async ({ company_id, phase, include_cancelled }) => {
        const db = getSupabase()
        const selectCols = [
          'id', 'order_id', 'description',
          cols.phase, cols.step, cols.onHold, cols.blocked,
        ].join(', ')
        let q = db.from(wf.entityTable).select(selectCols).eq(cols.company, company_id)
        if (phase) q = q.eq(cols.phase, phase)
        if (!include_cancelled) q = q.eq(cols.cancelled, false)
        const { data, error } = await q.order(cols.updatedAt, { ascending: false })
        if (error) return agentErr(`Error listando items: ${error.message}`)

        const items = (data || []).map((i: any) => ({
          id: i.id,
          order_id: i.order_id,
          description: i.description,
          phase: i[cols.phase],
          step: i[cols.step],
          on_hold: i[cols.onHold],
          blocked: !!i[cols.blocked],
        }))

        return agent({
          summary: `${items.length} item(s)${phase ? ` en ${phase}` : ''} para empresa ${company_id}`,
          data: { items },
        })
      },
    }),

    defineTool({
      name: names.advanceStep,
      description: `Avanza un item al siguiente sub-paso o a una nueva fase dentro del workflow ${wf.name}. Valida transicion legal.`,
      schema: {
        item_id: z.string(),
        to_phase: phaseEnum,
        to_step: z.string(),
        actor: z.string().describe('agent | user'),
        reason: z.string().optional(),
        evidence: z.record(z.string(), z.any()).optional(),
      },
      handler: async ({ item_id, to_phase, to_step, actor, reason, evidence }) => {
        const db = getSupabase()
        const selectCols = [
          'id', 'order_id', cols.company,
          cols.phase, cols.step, cols.onHold, cols.blocked, cols.cancelled,
        ].join(', ')
        const { data: item, error: e1 } = await db
          .from(wf.entityTable)
          .select(selectCols)
          .eq('id', item_id)
          .single()
        if (e1 || !item) return agentErr(e1?.message ?? 'Item no encontrado')

        const row = item as any
        if (row[cols.cancelled]) return agentErr('Item cancelado, no se puede avanzar')
        if (row[cols.onHold]) return agentErr('Item en hold. Llama resume_item primero.')
        if (row[cols.blocked]) return agentErr(`Item bloqueado: ${row[cols.blocked]}. Llama unblock_item primero.`)

        if (!workflowIsValidStep(wf, to_phase, to_step)) {
          return agentErr(`Step "${to_step}" no existe en fase "${to_phase}"`, {
            valid_steps: workflowPhaseSteps(wf, to_phase) as unknown as Record<string, unknown>,
          })
        }

        const fromIdx = workflowPhaseIndex(wf, row[cols.phase])
        const toIdx = workflowPhaseIndex(wf, to_phase)
        if (toIdx < fromIdx) return agentErr('No se puede retroceder de fase')
        if (toIdx > fromIdx + 1) return agentErr('Solo se puede avanzar 1 fase a la vez')

        if (workflowRequiresHumanApproval(wf, to_phase, to_step) && actor !== 'user') {
          return agentErr(`Step "${to_phase}.${to_step}" requiere aprobacion humana. Llama request_human_approval.`)
        }

        const { error: e2 } = await db
          .from(wf.entityTable)
          .update({
            [cols.phase]: to_phase,
            [cols.step]: to_step,
            [cols.updatedAt]: new Date().toISOString(),
          })
          .eq('id', item_id)
        if (e2) return agentErr(`Error avanzando: ${e2.message}`)

        await db.from(wf.transitionsTable).insert({
          item_id,
          company_id: row[cols.company],
          from_phase: row[cols.phase],
          to_phase,
          from_step: row[cols.step],
          to_step,
          actor,
          reason,
          evidence: evidence ?? {},
        })

        return agent({
          summary: `Item ${item_id} avanzado a ${to_phase}.${to_step}`,
          data: { item_id, phase: to_phase, step: to_step },
          hint: buildStepHint(wf, to_phase, to_step),
        })
      },
    }),

    defineTool({
      name: names.blockItem,
      description: 'Marca un item como bloqueado con razon.',
      schema: { item_id: z.string(), reason: z.string() },
      handler: async ({ item_id, reason }) => {
        const db = getSupabase()
        const { error } = await db.from(wf.entityTable)
          .update({ [cols.blocked]: reason, [cols.updatedAt]: new Date().toISOString() })
          .eq('id', item_id)
        if (error) return agentErr(`Error bloqueando: ${error.message}`)
        return agent({
          summary: `Item ${item_id} bloqueado: ${reason}`,
          data: { item_id, blocked_reason: reason },
        })
      },
    }),

    defineTool({
      name: names.unblockItem,
      description: 'Quita el bloqueo de un item.',
      schema: { item_id: z.string() },
      handler: async ({ item_id }) => {
        const db = getSupabase()
        const { error } = await db.from(wf.entityTable)
          .update({ [cols.blocked]: null, [cols.updatedAt]: new Date().toISOString() })
          .eq('id', item_id)
        if (error) return agentErr(`Error desbloqueando: ${error.message}`)
        return agent({
          summary: `Item ${item_id} desbloqueado.`,
          data: { item_id },
          hint: 'Item puede avanzar. Revisa get_item_state para ver posicion actual.',
        })
      },
    }),

    defineTool({
      name: names.holdItem,
      description: 'Pausa un item (on_hold=true).',
      schema: { item_id: z.string() },
      handler: async ({ item_id }) => {
        const db = getSupabase()
        const { error } = await db.from(wf.entityTable)
          .update({ [cols.onHold]: true, [cols.updatedAt]: new Date().toISOString() })
          .eq('id', item_id)
        if (error) return agentErr(`Error pausando: ${error.message}`)
        return agent({
          summary: `Item ${item_id} pausado.`,
          data: { item_id, on_hold: true },
        })
      },
    }),

    defineTool({
      name: names.resumeItem,
      description: 'Reanuda un item pausado.',
      schema: { item_id: z.string() },
      handler: async ({ item_id }) => {
        const db = getSupabase()
        const { error } = await db.from(wf.entityTable)
          .update({ [cols.onHold]: false, [cols.updatedAt]: new Date().toISOString() })
          .eq('id', item_id)
        if (error) return agentErr(`Error reanudando: ${error.message}`)
        return agent({
          summary: `Item ${item_id} reanudado.`,
          data: { item_id, on_hold: false },
          hint: 'Item puede avanzar. Revisa get_item_state para ver posicion actual.',
        })
      },
    }),

    defineTool({
      name: names.cancelItem,
      description: 'Cancela un item (terminal).',
      schema: { item_id: z.string(), reason: z.string().optional() },
      handler: async ({ item_id, reason }) => {
        const db = getSupabase()
        const selectCols = [cols.company, cols.phase, cols.step].join(', ')
        const { data: item } = await db.from(wf.entityTable)
          .select(selectCols)
          .eq('id', item_id)
          .single()
        const { error } = await db.from(wf.entityTable)
          .update({ [cols.cancelled]: true, [cols.updatedAt]: new Date().toISOString() })
          .eq('id', item_id)
        if (error) return agentErr(`Error cancelando: ${error.message}`)

        if (item) {
          const row = item as any
          await db.from(wf.transitionsTable).insert({
            item_id,
            company_id: row[cols.company],
            from_phase: row[cols.phase],
            to_phase: row[cols.phase],
            from_step: row[cols.step],
            to_step: 'cancelled',
            actor: 'agent',
            reason,
          })
        }

        return agent({
          summary: `Item ${item_id} cancelado.`,
          data: { item_id, cancelled: true },
        })
      },
    }),

    defineTool({
      name: names.requestHumanApproval as string,
      description: 'Marca un item como esperando aprobacion humana. La UI debe llamar advance_step con actor=user para confirmar.',
      schema: {
        item_id: z.string(),
        packet: z.record(z.string(), z.any()).describe('Datos a presentar al humano (resumen de costos, docs, etc.)'),
      },
      handler: async ({ item_id, packet }) => {
        const db = getSupabase()
        const selectCols = [cols.company, cols.phase, cols.step].join(', ')
        const { data: item } = await db.from(wf.entityTable)
          .select(selectCols)
          .eq('id', item_id)
          .single()
        if (!item) return agentErr('Item no encontrado')
        const row = item as any
        if (!workflowRequiresHumanApproval(wf, row[cols.phase], row[cols.step])) {
          return agentErr('Este step no es un gate de aprobacion humana')
        }

        await db.from(wf.transitionsTable).insert({
          item_id,
          company_id: row[cols.company],
          from_phase: row[cols.phase],
          to_phase: row[cols.phase],
          from_step: row[cols.step],
          to_step: row[cols.step],
          actor: 'agent',
          reason: 'awaiting_human_approval',
          evidence: packet,
        })

        return agent({
          summary: `Aprobacion humana solicitada para item ${item_id} en ${row[cols.phase]}.${row[cols.step]}`,
          data: { item_id, phase: row[cols.phase], step: row[cols.step] },
          hint: 'NO llames advance_step. El usuario aprobara via UI, que llama advance_step con actor="user".',
        })
      },
    }),
  ]
}

export function registerWorkflowTools(server: McpServer, wf: WorkflowDefinition): void {
  registerTools(server, buildWorkflowTools(wf) as unknown as readonly ToolDefinition[])
}
