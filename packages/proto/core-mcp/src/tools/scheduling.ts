import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { Cron } from 'croner'
import { getSupabase } from '../supabase.js'
import { json, err } from './_helpers.js'
import {
  isValidCronExpr,
  TASK_OUTPUT_CHANNELS,
  TASK_NOTIFY_TRIGGERS,
} from '../../../core-shared/src/index.js'

/**
 * Compute next firing instant of a cron expression strictly after `from`.
 */
function computeNextRun(expr: string, timezone: string, from: Date = new Date()): Date | null {
  try {
    const c = new Cron(expr, { timezone })
    return c.nextRun(from) ?? null
  } catch {
    return null
  }
}

/**
 * Recompute and persist next_run_at for a task.
 */
async function recalcNextRun(taskId: string): Promise<string | null> {
  const db = getSupabase()
  const { data: t, error } = await db
    .from('scheduled_tasks')
    .select('id, cron_expr, timezone, enabled')
    .eq('id', taskId)
    .single()
  if (error || !t) return null
  if (!t.enabled) {
    await db.from('scheduled_tasks').update({ next_run_at: null }).eq('id', taskId)
    return null
  }
  const next = computeNextRun(t.cron_expr, t.timezone)
  const iso = next?.toISOString() ?? null
  await db.from('scheduled_tasks').update({ next_run_at: iso }).eq('id', taskId)
  return iso
}

/**
 * Register built-in scheduling tools on the MCP server.
 * Every proto app gets these automatically — the agent can create, manage,
 * and trigger its own cron jobs out of the box.
 */
export function registerSchedulingTools(server: McpServer) {
  const companyId = () => process.env.COMPANY_ID || ''

  // ── schedule_task ─────────────────────────────────────────────────────
  server.tool(
    'schedule_task',
    'Create a scheduled task (cron) that invokes the agent with a prompt at regular intervals. The cron_expr is standard 5-field format (min hour dom mon dow).',
    {
      name: z.string().min(1).max(80).describe('Unique slug per company, e.g. "check-inbox"'),
      description: z.string().optional().describe('What this task does — shown in the UI'),
      cron_expr: z.string().describe('5-field cron: "*/15 * * * *" = every 15min, "0 9 * * *" = 9am daily'),
      timezone: z.string().default('America/Santiago'),
      prompt: z.string().describe('Instruction sent to the agent when the cron fires. Must be self-contained.'),
      enabled_skills: z.array(z.string()).default([]).describe('Skills enabled during the run'),
      session_key: z.string().optional().describe('Persistent session key for shared history between runs. Omit for one-shot.'),
      max_runtime_seconds: z.number().int().positive().default(300),
      output_channel: z.enum(TASK_OUTPUT_CHANNELS).default('silent').describe('"silent" = result stays in task_runs. "email" = sent to output_recipient.'),
      output_recipient: z.string().email().optional().describe('Email destination if output_channel="email"'),
      notify_on: z.enum(TASK_NOTIFY_TRIGGERS).default('always').describe('"always", "on_change", "on_error", or "never"'),
    },
    async (args) => {
      const company_id = companyId()
      if (!isValidCronExpr(args.cron_expr)) {
        return err(`Invalid cron_expr: "${args.cron_expr}". Expected 5 space-separated fields.`)
      }
      if (args.output_channel === 'email' && !args.output_recipient) {
        return err('output_channel="email" requires output_recipient')
      }
      const db = getSupabase()
      const { data, error } = await db.from('scheduled_tasks').insert({
        company_id,
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

      const next = await recalcNextRun(data.id)
      return json({ ...data, next_run_at: next })
    },
  )

  // ── list_scheduled_tasks ──────────────────────────────────────────────
  server.tool(
    'list_scheduled_tasks',
    'List scheduled tasks for the current company with status and next run.',
    {
      include_disabled: z.boolean().default(true),
    },
    async ({ include_disabled }) => {
      const db = getSupabase()
      let q = db
        .from('scheduled_tasks')
        .select('id, name, description, cron_expr, timezone, enabled, next_run_at, last_run_at, last_run_status, enabled_skills')
        .eq('company_id', companyId())
        .order('next_run_at', { ascending: true, nullsFirst: false })
      if (!include_disabled) q = q.eq('enabled', true)
      const { data, error } = await q
      return error ? err(error.message) : json(data)
    },
  )

  // ── get_task_runs ─────────────────────────────────────────────────────
  server.tool(
    'get_task_runs',
    'Get recent execution history for a scheduled task. Useful for debugging failures.',
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
    },
  )

  // ── pause_task ────────────────────────────────────────────────────────
  server.tool(
    'pause_task',
    'Disable a scheduled task without deleting it. It won\'t run until resumed.',
    { task_id: z.string() },
    async ({ task_id }) => {
      const db = getSupabase()
      const { error } = await db
        .from('scheduled_tasks')
        .update({ enabled: false, next_run_at: null })
        .eq('id', task_id)
      return error ? err(error.message) : json({ ok: true, paused: task_id })
    },
  )

  // ── resume_task ───────────────────────────────────────────────────────
  server.tool(
    'resume_task',
    'Re-enable a paused task and compute its next run.',
    { task_id: z.string() },
    async ({ task_id }) => {
      const db = getSupabase()
      const { error } = await db
        .from('scheduled_tasks')
        .update({ enabled: true })
        .eq('id', task_id)
      if (error) return err(error.message)
      const next = await recalcNextRun(task_id)
      return json({ ok: true, resumed: task_id, next_run_at: next })
    },
  )

  // ── update_task ───────────────────────────────────────────────────────
  server.tool(
    'update_task',
    'Update fields of a scheduled task (cron_expr, prompt, description, etc). Only pass fields you want to change.',
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
        return err(`Invalid cron_expr: "${updates.cron_expr}"`)
      }
      const patch = Object.fromEntries(
        Object.entries(updates).filter(([, v]) => v !== undefined),
      )
      if (Object.keys(patch).length === 0) return err('Nothing to update')

      const db = getSupabase()
      const { data, error } = await db
        .from('scheduled_tasks')
        .update(patch)
        .eq('id', task_id)
        .select()
        .single()
      if (error) return err(error.message)

      if (patch.cron_expr || patch.timezone) {
        await recalcNextRun(task_id)
      }
      return json(data)
    },
  )

  // ── delete_task ───────────────────────────────────────────────────────
  server.tool(
    'delete_task',
    'Delete a scheduled task and its run history (cascade).',
    { task_id: z.string() },
    async ({ task_id }) => {
      const db = getSupabase()
      const { error } = await db.from('scheduled_tasks').delete().eq('id', task_id)
      return error ? err(error.message) : json({ ok: true, deleted: task_id })
    },
  )

  // ── trigger_task_now ──────────────────────────────────────────────────
  server.tool(
    'trigger_task_now',
    'Manually trigger a scheduled task right now, without waiting for the cron. The run appears in history with trigger="manual".',
    {
      task_id: z.string(),
      triggered_by: z.string().optional().default('agent'),
    },
    async ({ task_id, triggered_by }) => {
      const gatewayUrl = process.env.GATEWAY_URL || 'http://localhost:8092'
      const secret = process.env.INTERNAL_API_SECRET || ''
      try {
        const res = await fetch(`${gatewayUrl}/cron/trigger`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Internal-Secret': secret,
          },
          body: JSON.stringify({ task_id, triggered_by }),
        })
        if (!res.ok) return err(`Gateway returned ${res.status}`)
        const body = await res.json()
        return json(body)
      } catch (e: any) {
        return err(e?.message || 'Gateway unreachable')
      }
    },
  )
}
