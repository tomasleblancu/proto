import { Cron } from 'croner'
import { getSupabase } from './supabase.js'
import { runClaude } from './claude-runner.js'
import { sendSystemMail } from './email-sender.js'
import { config } from './config.js'
import type { TaskNotifyTrigger, TaskOutputChannel } from '@proto/core-shared'

/**
 * Scheduler core: next-run calculation, due-task scan, dispatch.
 *
 * The scheduling model is "next_run_at is canonical". On any schedule change
 * (insert, update, or after a run finishes) we compute the next_run_at from
 * the cron expression + timezone and store it. `scanDueTasks` just queries
 * for rows where next_run_at <= now() AND enabled = true. This is cheap and
 * race-free.
 */

export interface ScheduledTaskRow {
  id: string
  company_id: string
  name: string
  description: string | null
  cron_expr: string
  timezone: string
  prompt: string
  enabled_skills: string[]
  session_key: string | null
  user_id: string
  enabled: boolean
  max_runtime_seconds: number
  next_run_at: string | null
  last_run_at: string | null
  last_run_status: string | null
  output_channel: TaskOutputChannel
  output_recipient: string | null
  notify_on: TaskNotifyTrigger
}

/**
 * Compute the next firing instant of `expr` strictly after `from`.
 * Returns null if the expression is invalid.
 */
export function computeNextRun(expr: string, timezone: string, from: Date = new Date()): Date | null {
  try {
    const c = new Cron(expr, { timezone })
    const next = c.nextRun(from)
    return next ?? null
  } catch {
    return null
  }
}

/**
 * Recompute and persist next_run_at for a task. Call this after INSERT/UPDATE
 * and after a run finishes.
 */
export async function recalcNextRun(taskId: string): Promise<Date | null> {
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
  await db.from('scheduled_tasks').update({ next_run_at: next?.toISOString() ?? null }).eq('id', taskId)
  return next
}

/**
 * Find tasks whose next_run_at has passed. Returns at most `limit` rows.
 */
export async function scanDueTasks(limit = 20): Promise<ScheduledTaskRow[]> {
  const db = getSupabase()
  const nowIso = new Date().toISOString()
  const { data, error } = await db
    .from('scheduled_tasks')
    .select('*')
    .eq('enabled', true)
    .lte('next_run_at', nowIso)
    .order('next_run_at', { ascending: true })
    .limit(limit)
  if (error) {
    console.error('[scheduler] scan error', error)
    return []
  }
  return (data || []) as ScheduledTaskRow[]
}

interface DispatchOptions {
  trigger: 'scheduled' | 'manual' | 'retry'
  triggeredBy?: string
}

/**
 * Execute a task: creates a task_runs row, invokes runClaude with the task's
 * prompt/skills, then writes back the result and recomputes next_run_at.
 *
 * Runs are non-blocking from the caller's perspective — the tick endpoint
 * fires these and returns immediately while dispatch continues in the
 * background. We guard against double-dispatch by claiming the row first
 * (set last_run_at + clear next_run_at).
 */
export async function dispatchTask(task: ScheduledTaskRow, opts: DispatchOptions): Promise<void> {
  const db = getSupabase()
  const startedAt = new Date()

  // 1. Claim the row. For scheduled runs, use an optimistic lock on
  //    next_run_at to prevent races between overlapping ticks. For manual
  //    triggers the user explicitly wants it to run now, so we skip the
  //    lock — otherwise we'd also fail when next_run_at is null (e.g.,
  //    task created via direct DB insert without recalc).
  let claimQuery = db
    .from('scheduled_tasks')
    .update({
      next_run_at: null,          // cleared; recomputed after run
      last_run_at: startedAt.toISOString(),
      last_run_status: 'running',
    })
    .eq('id', task.id)

  if (opts.trigger === 'scheduled' && task.next_run_at) {
    claimQuery = claimQuery.eq('next_run_at', task.next_run_at)
  }

  const { data: claimed, error: claimErr } = await claimQuery.select('id').single()

  if (claimErr || !claimed) {
    // Someone else claimed it (scheduled race), or it was edited mid-flight.
    return
  }

  // 2. Insert run row
  const { data: run, error: runErr } = await db
    .from('task_runs')
    .insert({
      task_id: task.id,
      company_id: task.company_id,
      status: 'running',
      trigger: opts.trigger,
      triggered_by: opts.triggeredBy ?? 'cron',
      started_at: startedAt.toISOString(),
    })
    .select('id')
    .single()

  if (runErr || !run) {
    console.error('[scheduler] failed to insert task_run', runErr)
    return
  }

  // 3. Link run id to task
  await db.from('scheduled_tasks').update({ last_run_id: run.id }).eq('id', task.id)

  // 4. Invoke the agent
  let status: 'success' | 'error' = 'success'
  let response: string | null = null
  let errorText: string | null = null
  let costUsd: number | undefined
  let sessionId: string | undefined

  try {
    const sessionKey = task.session_key || `cron-${task.name}-${Date.now()}`
    const result = await runClaude({
      company_id: task.company_id,
      user_id: task.user_id,
      message: task.prompt,
      channel: 'cron',
      session_key: sessionKey,
      enabled_skills: task.enabled_skills,
      company_context: `[Cron task "${task.name}" firing via ${opts.trigger}]`,
      selected_files: [],
    })
    response = result.response
    costUsd = result.cost_usd
    sessionId = result.session_id
  } catch (err: any) {
    status = 'error'
    errorText = err?.message || String(err)
    console.error(`[scheduler] task ${task.name} failed:`, err)
  }

  const finishedAt = new Date()
  const durationMs = finishedAt.getTime() - startedAt.getTime()

  // 5. Write run result
  await db
    .from('task_runs')
    .update({
      status,
      finished_at: finishedAt.toISOString(),
      duration_ms: durationMs,
      response,
      error: errorText,
      metadata: { cost_usd: costUsd, session_id: sessionId },
    })
    .eq('id', run.id)

  // 6. Recompute next_run_at + update last_run_status on task
  const next = computeNextRun(task.cron_expr, task.timezone)
  await db
    .from('scheduled_tasks')
    .update({
      next_run_at: next?.toISOString() ?? null,
      last_run_status: status,
    })
    .eq('id', task.id)

  // 7. Deliver via output channel (email) if configured
  await maybeNotify(task, {
    runId: run.id,
    status,
    response,
    errorText,
    previousStatus: task.last_run_status,
  })
}

interface NotifyCtx {
  runId: string
  status: 'success' | 'error'
  response: string | null
  errorText: string | null
  previousStatus: string | null
}

/**
 * Decide whether + how to notify for a finished run and perform delivery.
 * Writes back `notified_at` / `notify_error` on the task_runs row.
 */
async function maybeNotify(task: ScheduledTaskRow, ctx: NotifyCtx): Promise<void> {
  if (task.output_channel === 'silent') return
  if (!task.output_recipient) return

  // Apply notify_on filter
  const shouldNotify = (() => {
    switch (task.notify_on) {
      case 'never':     return false
      case 'always':    return true
      case 'on_error':  return ctx.status === 'error'
      case 'on_change': return ctx.status !== ctx.previousStatus
    }
  })()
  if (!shouldNotify) return

  // Build the message
  const subject =
    ctx.status === 'error'
      ? `[${config.display_name}] Tarea "${task.name}" fallo`
      : `[${config.display_name}] ${task.name}`
  const bodyLines: string[] = []
  bodyLines.push(`Tarea: ${task.name}`)
  if (task.description) bodyLines.push(`Descripcion: ${task.description}`)
  bodyLines.push(`Estado: ${ctx.status}`)
  bodyLines.push(`Cron: ${task.cron_expr}`)
  bodyLines.push('')
  if (ctx.status === 'error') {
    bodyLines.push('Error:')
    bodyLines.push(ctx.errorText ?? '(sin detalle)')
  } else {
    bodyLines.push('Resultado:')
    bodyLines.push(ctx.response ?? '(sin respuesta)')
  }
  bodyLines.push('')
  bodyLines.push('---')
  bodyLines.push(`${config.display_name} · tarea programada`)
  const body = bodyLines.join('\n')

  if (task.output_channel === 'email') {
    const result = await sendSystemMail({
      companyId: task.company_id,
      to: task.output_recipient,
      subject,
      body,
      sourceTaskId: task.id,
      sessionKey: task.session_key || undefined,
    })
    const db = getSupabase()
    if (result.ok) {
      await db
        .from('task_runs')
        .update({ notified_at: new Date().toISOString() })
        .eq('id', ctx.runId)
    } else {
      await markNotifyError(ctx.runId, result.error || 'unknown send error')
    }
  }
}

async function markNotifyError(runId: string, msg: string): Promise<void> {
  const db = getSupabase()
  await db.from('task_runs').update({ notify_error: msg }).eq('id', runId)
}

/**
 * Scan + dispatch in background. Called by the pg_cron webhook.
 * Returns immediately with the number of tasks claimed; actual execution
 * runs async.
 */
export async function tick(): Promise<{ dispatched: number }> {
  const due = await scanDueTasks()
  for (const task of due) {
    // Fire and forget — each dispatch logs its own errors
    dispatchTask(task, { trigger: 'scheduled', triggeredBy: 'cron' }).catch(err =>
      console.error(`[scheduler] dispatch error for ${task.name}:`, err)
    )
  }
  return { dispatched: due.length }
}
