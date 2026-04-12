export interface Company {
  id: string
  name: string
  rut: string | null
  contact_email: string | null
  contact_phone: string | null
  owner_id: string
  created_at: string
}

export interface CompanyUser {
  id: string
  company_id: string
  user_id: string
  role: string
  company_name?: string
  user_email?: string
  full_name?: string | null
}

export interface Order {
  id: string
  company_id: string
  supplier_name: string
  status: string
  po_number: string | null
  total_amount: number | null
  currency: string | null
  estimated_arrival: string | null
  created_at: string
  updated_at: string
  company_name?: string
}

export interface CostingDefault {
  id: string
  key: string
  label: string
  value: number
  unit: string
  currency: string
  category: string
  qty_type: string
  minimum: number
  sort_order: number
  notes: string | null
}

export interface AgentDef {
  id: string
  name: string
  display_name: string
  description: string
  model: string
  skills: string[]
  color: string
  system_prompt: string | null
  enabled: boolean
  company_id: string | null
}

export interface SkillDef {
  id: string
  name: string
  display_name: string
  description: string | null
  mcp_tools: string[]
  category: string | null
  enabled_by_default: boolean
  content: string | null
  depends: string[]
  context: string | null
  fork_agent: string | null
}

export interface ScheduledTask {
  id: string
  company_id: string
  company_name?: string
  name: string
  description: string | null
  cron_expr: string
  timezone: string
  prompt: string
  enabled_skills: string[]
  enabled: boolean
  next_run_at: string | null
  last_run_at: string | null
  last_run_status: string | null
  output_channel: 'silent' | 'email'
  output_recipient: string | null
  notify_on: string
}

export interface TaskRun {
  id: string
  status: string
  trigger: string
  started_at: string
  finished_at: string | null
  duration_ms: number | null
  response: string | null
  error: string | null
}

export const ORDER_STATUSES = [
  'draft','po_sent','production','shipped',
  'in_transit','customs','delivered','cancelled','on_hold'
]

export const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-500',
  po_sent: 'bg-blue-500',
  production: 'bg-indigo-500',
  shipped: 'bg-cyan-500',
  in_transit: 'bg-purple-500',
  customs: 'bg-orange-500',
  delivered: 'bg-emerald-600',
  cancelled: 'bg-red-500',
  on_hold: 'bg-yellow-500',
}

export const COLORS = ['green', 'blue', 'cyan', 'purple', 'orange', 'yellow', 'pink', 'red']
export const MODELS = ['haiku', 'sonnet', 'opus']

export const COLOR_CLASSES: Record<string, string> = {
  green: 'bg-emerald-600',
  blue: 'bg-blue-600',
  cyan: 'bg-cyan-600',
  purple: 'bg-purple-600',
  orange: 'bg-orange-600',
  yellow: 'bg-yellow-600',
  pink: 'bg-pink-600',
  red: 'bg-red-600',
}

export function formatTaskTime(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now()
  if (diff < 0) return 'ya'
  const min = Math.floor(diff / 60000)
  if (min < 1) return '<1m'
  if (min < 60) return `en ${min}m`
  const h = Math.floor(min / 60)
  if (h < 24) return `en ${h}h${min % 60 ? ` ${min % 60}m` : ''}`
  return `en ${Math.floor(h / 24)}d`
}

export function formatTaskPast(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min}m`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h}h`
  return `hace ${Math.floor(h / 24)}d`
}
