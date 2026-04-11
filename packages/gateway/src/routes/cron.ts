import type { Hono } from 'hono'
import { verifySecret } from '../auth.js'
import { getSupabase } from '../supabase.js'
import { tick, dispatchTask, recalcNextRun, computeNextRun, type ScheduledTaskRow } from '../scheduler.js'
import { isValidCronExpr } from '@hermes/shared'

/**
 * Cron control surface. Three responsibilities:
 *   /cron/tick       — internal; called by pg_cron every minute
 *   /cron/trigger    — manual; run a task right now ("run now" button)
 *   /cron/list       — inspect tasks + next_run_at (debug / admin UI)
 *
 * Task CRUD is owned by the MCP tools (agent-facing) + direct DB access
 * from the web frontend via supabase-js with RLS. The gateway only owns
 * the dispatch layer.
 */
export function registerCronRoutes(app: Hono) {
  // --- pg_cron webhook ---
  app.post('/cron/tick', verifySecret, async (c) => {
    const result = await tick()
    return c.json({ ok: true, ...result })
  })

  // --- Manual trigger ---
  app.post('/cron/trigger', verifySecret, async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const taskId = body?.task_id as string | undefined
    const triggeredBy = (body?.triggered_by as string | undefined) || 'manual'
    if (!taskId) return c.json({ error: 'task_id required' }, 400)

    const db = getSupabase()
    const { data, error } = await db
      .from('scheduled_tasks')
      .select('*')
      .eq('id', taskId)
      .single()
    if (error || !data) return c.json({ error: 'task not found' }, 404)

    // Dispatch in background — don't block the HTTP response
    dispatchTask(data as ScheduledTaskRow, { trigger: 'manual', triggeredBy }).catch(err =>
      console.error('[cron] manual dispatch error', err)
    )
    return c.json({ ok: true, task_id: taskId, trigger: 'manual' })
  })

  // --- List tasks + next runs (debug / admin) ---
  app.get('/cron/list', verifySecret, async (c) => {
    const companyId = c.req.query('company_id')
    const db = getSupabase()
    let q = db
      .from('scheduled_tasks')
      .select('id, company_id, name, cron_expr, timezone, enabled, next_run_at, last_run_at, last_run_status')
      .order('next_run_at', { ascending: true, nullsFirst: false })
    if (companyId) q = q.eq('company_id', companyId)
    const { data, error } = await q
    if (error) return c.json({ error: error.message }, 500)
    return c.json({ tasks: data || [] })
  })

  // --- Recompute next_run for a task (called after CRUD in MCP tools) ---
  app.post('/cron/recalc', verifySecret, async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const taskId = body?.task_id as string | undefined
    if (!taskId) return c.json({ error: 'task_id required' }, 400)
    const next = await recalcNextRun(taskId)
    return c.json({ ok: true, next_run_at: next?.toISOString() ?? null })
  })

  // --- Validate a cron expression (used by frontend form) ---
  app.post('/cron/validate', verifySecret, async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const expr = body?.cron_expr as string | undefined
    const tz = (body?.timezone as string | undefined) || 'America/Santiago'
    if (!expr) return c.json({ error: 'cron_expr required' }, 400)
    if (!isValidCronExpr(expr)) return c.json({ valid: false, error: 'invalid format' })
    const next = computeNextRun(expr, tz)
    if (!next) return c.json({ valid: false, error: 'unparseable' })
    return c.json({ valid: true, next_run_at: next.toISOString() })
  })
}
