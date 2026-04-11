import { z } from 'zod'

/**
 * Shared types + schemas for the scheduled tasks subsystem.
 * Tables live in `supabase/migrations/20260408030000_scheduled_tasks.sql`.
 */

export const TASK_RUN_STATUSES = ['running', 'success', 'error', 'cancelled', 'skipped'] as const
export type TaskRunStatus = typeof TASK_RUN_STATUSES[number]

export const TASK_TRIGGER_SOURCES = ['scheduled', 'manual', 'retry'] as const
export type TaskTriggerSource = typeof TASK_TRIGGER_SOURCES[number]

export const TASK_OUTPUT_CHANNELS = ['silent', 'email'] as const
export type TaskOutputChannel = typeof TASK_OUTPUT_CHANNELS[number]

export const TASK_NOTIFY_TRIGGERS = ['always', 'on_change', 'on_error', 'never'] as const
export type TaskNotifyTrigger = typeof TASK_NOTIFY_TRIGGERS[number]

export const scheduledTaskSchema = z.object({
  id: z.string().uuid().optional(),
  company_id: z.string().uuid(),
  name: z.string().min(1).max(80),
  description: z.string().optional().nullable(),
  cron_expr: z.string().min(9), // "* * * * *" is 9 chars
  timezone: z.string().default('America/Santiago'),
  prompt: z.string().min(1),
  enabled_skills: z.array(z.string()).default([]),
  session_key: z.string().optional().nullable(),
  user_id: z.string().default('cron'),
  enabled: z.boolean().default(true),
  max_runtime_seconds: z.number().int().positive().default(300),
  output_channel: z.enum(TASK_OUTPUT_CHANNELS).default('silent'),
  output_recipient: z.string().email().optional().nullable(),
  notify_on: z.enum(TASK_NOTIFY_TRIGGERS).default('always'),
})

export type ScheduledTaskInput = z.infer<typeof scheduledTaskSchema>

/**
 * Minimal 5-field cron validator. Doesn't exhaustively parse every extension;
 * the gateway re-validates with `croner` at dispatch time.
 */
export function isValidCronExpr(expr: string): boolean {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return false
  // Loose per-field char check — real parsing is in croner.
  const allowed = /^[\d*,\-/?LWlw]+$/
  return parts.every(p => allowed.test(p))
}
