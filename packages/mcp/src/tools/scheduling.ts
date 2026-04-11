import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getSupabase } from '../supabase.js'
import { isValidCronExpr, TASK_OUTPUT_CHANNELS, TASK_NOTIFY_TRIGGERS } from '@hermes/shared'
import { err, json } from './_helpers.js'

/**
 * Agent-facing CRUD + control for scheduled tasks.
 *
 * The gateway owns the dispatch layer (`packages/gateway/src/scheduler.ts`).
 * These tools let the agent create, pause, inspect, and manually trigger
 * tasks on behalf of the user, and also let the agent "program itself"
 * ("programa un check de mail cada 15 min").
 *
 * After every write, we call gateway `/cron/recalc` so `next_run_at` stays
 * authoritative. The gateway URL/secret are read from env.
 */

const DEFAULT_GATEWAY = process.env.GATEWAY_URL || 'http://localhost:8092'
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET || ''

async function recalcNextRun(taskId: string): Promise<string | null> {
  try {
    const res = await fetch(`${DEFAULT_GATEWAY}/cron/recalc`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': INTERNAL_SECRET,
      },
      body: JSON.stringify({ task_id: taskId }),
    })
    if (!res.ok) return null
    const body = await res.json() as { next_run_at?: string | null }
    return body.next_run_at ?? null
  } catch {
    return null
  }
}

export function registerSchedulingTools(server: McpServer) {
  server.tool(
    'schedule_task',
    'Crea una tarea programada (cron) que ejecuta al agente con un prompt dado en intervalos regulares. Ej: "revisa mail cada 15 min", "escanea recompras todos los dias a las 9am". El cron_expr es formato estandar de 5 campos (min hora dia mes dow). Despues de crear, computa next_run_at automaticamente.',
    {
      company_id: z.string(),
      name: z.string().min(1).max(80).describe('Slug corto unico por empresa, ej: "check-inbox", "daily-reorders"'),
      description: z.string().optional().describe('Para que sirve esta tarea — se muestra en la UI'),
      cron_expr: z.string().describe('Expresion cron de 5 campos: "min hora dia mes dow". Ej: "*/15 * * * *" cada 15min, "0 9 * * *" 9am diario, "0 9 * * 1" lunes 9am'),
      timezone: z.string().default('America/Santiago'),
      prompt: z.string().describe('Instruccion literal que se le enviara al agente cuando el cron dispare. Debe ser self-contained — el agente no recuerda contexto entre runs a menos que uses session_key.'),
      enabled_skills: z.array(z.string()).default([]).describe('Skills habilitadas durante el run, ej: ["hermes-gmail","hermes-orders"]'),
      session_key: z.string().optional().describe('Opcional: session_key persistente para que runs sucesivos compartan historial de Claude CLI. Omitir para one-shot (recomendado para la mayoria).'),
      max_runtime_seconds: z.number().int().positive().default(300),
      output_channel: z.enum(TASK_OUTPUT_CHANNELS).default('silent').describe('Donde entregar el resultado. "silent" = solo queda en task_runs (visible en la UI). "email" = se envia al output_recipient desde el mail interno de Hermes (no requiere Gmail del usuario).'),
      output_recipient: z.string().email().optional().describe('Email de destino si output_channel="email". El remitente siempre es el mail del sistema Hermes, no la cuenta del usuario.'),
      notify_on: z.enum(TASK_NOTIFY_TRIGGERS).default('always').describe('Cuando disparar la notificacion: "always" en cada run, "on_change" solo si el status cambio, "on_error" solo en fallas, "never" nunca (util para desactivar temporalmente).'),
    },
    async (args) => {
      if (!isValidCronExpr(args.cron_expr)) {
        return err(`cron_expr invalido: "${args.cron_expr}". Formato esperado: 5 campos separados por espacio. Ejemplos: "*/15 * * * *", "0 9 * * *"`)
      }
      if (args.output_channel === 'email' && !args.output_recipient) {
        return err('output_channel="email" requiere output_recipient')
      }
      const db = getSupabase()
      const { data, error } = await db.from('scheduled_tasks').insert({
        company_id: args.company_id,
        name: args.name,
        description: args.description,
        cron_expr: args.cron_expr,
        timezone: args.timezone,
        prompt: args.prompt,
        enabled_skills: args.enabled_skills,
        session_key: args.session_key,
        max_runtime_seconds: args.max_runtime_seconds,
        output_channel: args.output_channel,
        output_recipient: args.output_recipient,
        notify_on: args.notify_on,
        enabled: true,
      }).select().single()
      if (error) return err(error.message)

      const nextRunAt = await recalcNextRun(data.id)
      return json({ ...data, next_run_at: nextRunAt })
    }
  )

  server.tool(
    'list_scheduled_tasks',
    'Lista las tareas programadas de una empresa con su estado actual y proximo run.',
    {
      company_id: z.string(),
      include_disabled: z.boolean().default(true),
    },
    async ({ company_id, include_disabled }) => {
      const db = getSupabase()
      let q = db
        .from('scheduled_tasks')
        .select('id, name, description, cron_expr, timezone, enabled, next_run_at, last_run_at, last_run_status, enabled_skills')
        .eq('company_id', company_id)
        .order('next_run_at', { ascending: true, nullsFirst: false })
      if (!include_disabled) q = q.eq('enabled', true)
      const { data, error } = await q
      return error ? err(error.message) : json(data)
    }
  )

  server.tool(
    'get_task_runs',
    'Devuelve el historial de ejecuciones recientes de una tarea programada. Util para debuggear fallas o ver cuanto dura.',
    {
      task_id: z.string(),
      limit: z.number().int().positive().default(20),
    },
    async ({ task_id, limit }) => {
      const db = getSupabase()
      const { data, error } = await db
        .from('task_runs')
        .select('id, status, trigger, triggered_by, started_at, finished_at, duration_ms, error, metadata')
        .eq('task_id', task_id)
        .order('started_at', { ascending: false })
        .limit(limit)
      return error ? err(error.message) : json(data)
    }
  )

  server.tool(
    'pause_task',
    'Desactiva una tarea programada sin borrarla. No correra mas hasta llamar resume_task.',
    { task_id: z.string() },
    async ({ task_id }) => {
      const db = getSupabase()
      const { error } = await db
        .from('scheduled_tasks')
        .update({ enabled: false, next_run_at: null })
        .eq('id', task_id)
      return error ? err(error.message) : json({ ok: true, paused: task_id })
    }
  )

  server.tool(
    'resume_task',
    'Reactiva una tarea pausada y computa su proximo run.',
    { task_id: z.string() },
    async ({ task_id }) => {
      const db = getSupabase()
      const { error } = await db
        .from('scheduled_tasks')
        .update({ enabled: true })
        .eq('id', task_id)
      if (error) return err(error.message)
      const nextRunAt = await recalcNextRun(task_id)
      return json({ ok: true, resumed: task_id, next_run_at: nextRunAt })
    }
  )

  server.tool(
    'update_task',
    'Actualiza campos de una tarea programada (cron_expr, prompt, description, enabled_skills, etc). Solo pasa los campos que querés cambiar.',
    {
      task_id: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      cron_expr: z.string().optional(),
      timezone: z.string().optional(),
      prompt: z.string().optional(),
      enabled_skills: z.array(z.string()).optional(),
      session_key: z.string().optional().nullable(),
      max_runtime_seconds: z.number().int().positive().optional(),
      output_channel: z.enum(TASK_OUTPUT_CHANNELS).optional(),
      output_recipient: z.string().email().optional().nullable(),
      notify_on: z.enum(TASK_NOTIFY_TRIGGERS).optional(),
    },
    async (args) => {
      const { task_id, ...updates } = args
      if (updates.cron_expr && !isValidCronExpr(updates.cron_expr)) {
        return err(`cron_expr invalido: "${updates.cron_expr}"`)
      }
      const patch = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined))
      if (Object.keys(patch).length === 0) return err('Nada que actualizar')

      const db = getSupabase()
      const { data, error } = await db
        .from('scheduled_tasks')
        .update(patch)
        .eq('id', task_id)
        .select()
        .single()
      if (error) return err(error.message)

      // Recompute next_run if schedule-affecting fields changed
      if (patch.cron_expr || patch.timezone) {
        await recalcNextRun(task_id)
      }
      return json(data)
    }
  )

  server.tool(
    'delete_task',
    'Borra una tarea programada y su historial de runs (cascade).',
    { task_id: z.string() },
    async ({ task_id }) => {
      const db = getSupabase()
      const { error } = await db.from('scheduled_tasks').delete().eq('id', task_id)
      return error ? err(error.message) : json({ ok: true, deleted: task_id })
    }
  )

  server.tool(
    'trigger_task_now',
    'Dispara manualmente una tarea programada ahora, sin esperar al cron. Ideal para pruebas o para el boton "Run now" de la UI. El run aparece en el historial con trigger="manual".',
    {
      task_id: z.string(),
      triggered_by: z.string().optional().default('agent'),
    },
    async ({ task_id, triggered_by }) => {
      try {
        const res = await fetch(`${DEFAULT_GATEWAY}/cron/trigger`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Internal-Secret': INTERNAL_SECRET,
          },
          body: JSON.stringify({ task_id, triggered_by }),
        })
        if (!res.ok) return err(`gateway returned ${res.status}`)
        const body = await res.json()
        return json(body)
      } catch (e: any) {
        return err(e?.message || 'gateway unreachable')
      }
    }
  )
}
