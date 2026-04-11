import { useState } from 'react'
import { useMountEffect } from '@/hooks/useMountEffect'
import { supabase } from '@/lib/supabase'
import { GATEWAY_URL, INTERNAL_SECRET } from '@/lib/config'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { SaveIcon, PlayIcon, PauseIcon, TrashIcon, RefreshCwIcon, ChevronDownIcon, ChevronRightIcon } from 'lucide-react'

interface Company {
  id: string
  name: string
  rut: string | null
  contact_email: string | null
  contact_phone: string | null
  owner_id: string
  created_at: string
}

interface CompanyUser {
  id: string
  company_id: string
  user_id: string
  role: string
  company_name?: string
  user_email?: string
  full_name?: string | null
}

interface Order {
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

const ORDER_STATUSES = [
  'draft','po_sent','production','shipped',
  'in_transit','customs','delivered','cancelled','on_hold'
]

const STATUS_COLORS: Record<string, string> = {
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

interface CostingDefault {
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

interface AgentDef {
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

interface SkillDef {
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

interface ScheduledTask {
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

interface TaskRun {
  id: string
  status: string
  trigger: string
  started_at: string
  finished_at: string | null
  duration_ms: number | null
  response: string | null
  error: string | null
}

const COLORS = ['green', 'blue', 'cyan', 'purple', 'orange', 'yellow', 'pink', 'red']
const MODELS = ['haiku', 'sonnet', 'opus']

const COLOR_CLASSES: Record<string, string> = {
  green: 'bg-emerald-600',
  blue: 'bg-blue-600',
  cyan: 'bg-cyan-600',
  purple: 'bg-purple-600',
  orange: 'bg-orange-600',
  yellow: 'bg-yellow-600',
  pink: 'bg-pink-600',
  red: 'bg-red-600',
}

export default function Admin() {
  const [agents, setAgents] = useState<AgentDef[]>([])
  const [skills, setSkills] = useState<SkillDef[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [users, setUsers] = useState<CompanyUser[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [costingDefaults, setCostingDefaults] = useState<CostingDefault[]>([])
  const [scheduledTasks, setScheduledTasks] = useState<ScheduledTask[]>([])
  const [taskRuns, setTaskRuns] = useState<Record<string, TaskRun[]>>({})
  const [expandedTask, setExpandedTask] = useState<string | null>(null)
  const [taskBusy, setTaskBusy] = useState<string | null>(null)
  const [creatingTask, setCreatingTask] = useState(false)
  const [orderFilter, setOrderFilter] = useState<string>('all')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [tab, setTab] = useState<'companies' | 'users' | 'agents' | 'skills' | 'orders' | 'costing' | 'schedules'>('companies')

  useMountEffect(() => {
    Promise.all([
      supabase.from('agent_definitions').select('*').order('display_name'),
      supabase.from('skill_definitions').select('*').order('category, display_name'),
      supabase.from('companies').select('*').order('name'),
      supabase.from('company_users').select('id, company_id, user_id, role, companies(name), profiles(full_name)'),
      supabase.from('orders').select('*, companies(name)').order('updated_at', { ascending: false }),
      supabase.from('costing_defaults').select('*').order('category, key'),
      supabase.from('scheduled_tasks').select('*, companies(name)').order('next_run_at', { ascending: true, nullsFirst: false }),
    ]).then(([agentsRes, skillsRes, companiesRes, usersRes, ordersRes, costingRes, tasksRes]) => {
      setAgents((agentsRes.data as AgentDef[]) || [])
      setSkills((skillsRes.data as SkillDef[]) || [])
      setCompanies((companiesRes.data as Company[]) || [])
      const rawUsers = (usersRes.data || []) as any[]
      setUsers(rawUsers.map(u => ({
        id: u.id,
        company_id: u.company_id,
        user_id: u.user_id,
        role: u.role,
        company_name: u.companies?.name,
        full_name: u.profiles?.full_name,
      })))
      const rawOrders = (ordersRes.data || []) as any[]
      setOrders(rawOrders.map(o => ({ ...o, company_name: o.companies?.name })))
      setCostingDefaults((costingRes.data as CostingDefault[]) || [])
      const rawTasks = (tasksRes.data || []) as any[]
      setScheduledTasks(rawTasks.map(t => ({ ...t, company_name: t.companies?.name })))
      setLoading(false)
    })
  })

  async function updateOrderStatus(orderId: string, status: string) {
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status } : o))
    await supabase.from('orders').update({ status, updated_at: new Date().toISOString() }).eq('id', orderId)
  }

  async function saveCompany(company: Company) {
    setSaving(company.id)
    const { id, owner_id, created_at, ...rest } = company
    await supabase.from('companies').update(rest).eq('id', id)
    setSaving(null)
  }

  function updateCompany(id: string, updates: Partial<Company>) {
    setCompanies(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c))
  }

  function updateCostingDefault(id: string, updates: Partial<CostingDefault>) {
    setCostingDefaults(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c))
  }

  async function saveCostingDefault(item: CostingDefault) {
    setSaving(item.id)
    const { id, ...rest } = item
    await supabase.from('costing_defaults').update({ ...rest, updated_at: new Date().toISOString() }).eq('id', id)
    setSaving(null)
  }

  async function addCostingDefault() {
    const key = prompt('Clave tecnica (ej: freight_express_kg):')?.trim()
    if (!key) return
    const maxSort = costingDefaults.reduce((max, c) => Math.max(max, c.sort_order || 0), 0)
    const { data } = await supabase.from('costing_defaults').insert({
      key,
      label: key,
      value: 0,
      unit: 'USD',
      currency: 'USD',
      category: 'other',
      qty_type: 'flat',
      minimum: 0,
      sort_order: maxSort + 10,
    }).select().single()
    if (data) setCostingDefaults(prev => [...prev, data as CostingDefault])
  }

  async function deleteCostingDefault(id: string) {
    setCostingDefaults(prev => prev.filter(c => c.id !== id))
    await supabase.from('costing_defaults').delete().eq('id', id)
  }

  function updateSkill(id: string, updates: Partial<SkillDef>) {
    setSkills(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s))
  }

  async function saveSkill(skill: SkillDef) {
    setSaving(skill.id)
    const { id, ...rest } = skill
    await supabase.from('skill_definitions').update(rest).eq('id', id)
    setSaving(null)
  }

  async function createAgent() {
    const name = prompt('Nombre tecnico del agente (slug):')?.trim()
    if (!name) return
    const { data } = await supabase.from('agent_definitions').insert({
      name,
      display_name: name,
      description: '',
      model: 'sonnet',
      skills: [],
      color: 'green',
      enabled: true,
    }).select().single()
    if (data) setAgents(prev => [...prev, data as AgentDef])
  }

  async function createSkill() {
    const name = prompt('Nombre tecnico del skill (slug):')?.trim()
    if (!name) return
    const { data } = await supabase.from('skill_definitions').insert({
      name,
      display_name: name,
      description: '',
      mcp_tools: [],
      depends: [],
      content: '',
      enabled_by_default: false,
    }).select().single()
    if (data) setSkills(prev => [...prev, data as SkillDef])
  }

  async function updateUserRole(userRowId: string, role: string) {
    setUsers(prev => prev.map(u => u.id === userRowId ? { ...u, role } : u))
    await supabase.from('company_users').update({ role }).eq('id', userRowId)
  }

  async function saveAgent(agent: AgentDef) {
    setSaving(agent.id)
    const { id, ...rest } = agent
    await supabase.from('agent_definitions').update({
      ...rest,
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    setSaving(null)
  }

  function updateAgent(id: string, updates: Partial<AgentDef>) {
    setAgents(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a))
  }

  function toggleSkillOnAgent(agentId: string, skillName: string) {
    const agent = agents.find(a => a.id === agentId)
    if (!agent) return
    const skills = agent.skills.includes(skillName)
      ? agent.skills.filter(s => s !== skillName)
      : [...agent.skills, skillName]
    updateAgent(agentId, { skills })
  }

  async function callGateway(path: string, body: any) {
    const res = await fetch(`${GATEWAY_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': INTERNAL_SECRET },
      body: JSON.stringify(body),
    })
    return res.json().catch(() => ({}))
  }

  async function toggleScheduledTask(task: ScheduledTask) {
    setTaskBusy(task.id)
    if (task.enabled) {
      await supabase.from('scheduled_tasks').update({ enabled: false, next_run_at: null }).eq('id', task.id)
      setScheduledTasks(prev => prev.map(t => t.id === task.id ? { ...t, enabled: false, next_run_at: null } : t))
    } else {
      await supabase.from('scheduled_tasks').update({ enabled: true }).eq('id', task.id)
      const res = await callGateway('/cron/recalc', { task_id: task.id })
      setScheduledTasks(prev => prev.map(t => t.id === task.id ? { ...t, enabled: true, next_run_at: res.next_run_at ?? null } : t))
    }
    setTaskBusy(null)
  }

  async function runTaskNow(task: ScheduledTask) {
    setTaskBusy(task.id)
    await callGateway('/cron/trigger', { task_id: task.id, triggered_by: 'admin' })
    setScheduledTasks(prev => prev.map(t => t.id === task.id ? { ...t, last_run_status: 'running' } : t))
    setTaskBusy(null)
  }

  async function deleteScheduledTask(task: ScheduledTask) {
    if (!confirm(`Eliminar "${task.name}"?`)) return
    setTaskBusy(task.id)
    await supabase.from('scheduled_tasks').delete().eq('id', task.id)
    setScheduledTasks(prev => prev.filter(t => t.id !== task.id))
    setTaskBusy(null)
  }

  async function loadTaskRuns(taskId: string) {
    const { data } = await supabase
      .from('task_runs')
      .select('id, status, trigger, started_at, finished_at, duration_ms, response, error')
      .eq('task_id', taskId)
      .order('started_at', { ascending: false })
      .limit(10)
    setTaskRuns(prev => ({ ...prev, [taskId]: (data as TaskRun[]) || [] }))
  }

  function toggleExpandTask(taskId: string) {
    if (expandedTask === taskId) {
      setExpandedTask(null)
    } else {
      setExpandedTask(taskId)
      if (!taskRuns[taskId]) loadTaskRuns(taskId)
    }
  }

  function updateScheduledTask(id: string, updates: Partial<ScheduledTask>) {
    setScheduledTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t))
  }

  async function saveScheduledTask(task: ScheduledTask) {
    setSaving(task.id)
    const { error } = await supabase.from('scheduled_tasks').update({
      name: task.name,
      description: task.description || null,
      cron_expr: task.cron_expr,
      prompt: task.prompt,
      enabled_skills: task.enabled_skills,
      timezone: task.timezone,
      output_channel: task.output_channel,
      output_recipient: task.output_channel === 'email' ? task.output_recipient : null,
      notify_on: task.notify_on,
    }).eq('id', task.id)
    if (error) { alert(error.message); setSaving(null); return }
    await callGateway('/cron/recalc', { task_id: task.id })
    setSaving(null)
  }

  async function createScheduledTask(data: {
    company_id: string; name: string; description: string; cron_expr: string;
    prompt: string; enabled_skills: string[]; output_channel: 'silent' | 'email';
    output_recipient: string; notify_on: string
  }) {
    const { data: row, error } = await supabase.from('scheduled_tasks').insert({
      company_id: data.company_id,
      name: data.name.trim(),
      description: data.description.trim() || null,
      cron_expr: data.cron_expr,
      prompt: data.prompt.trim(),
      enabled_skills: data.enabled_skills,
      output_channel: data.output_channel,
      output_recipient: data.output_channel === 'email' ? data.output_recipient.trim() : null,
      notify_on: data.notify_on,
      enabled: true,
    }).select('*, companies(name)').single()
    if (error) { alert(error.message); return }
    const task = { ...row, company_name: (row as any).companies?.name } as ScheduledTask
    await callGateway('/cron/recalc', { task_id: task.id })
    setScheduledTasks(prev => [task, ...prev])
    setCreatingTask(false)
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="flex gap-2 mb-6 border-b border-border pb-2">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-7 w-24 rounded-md" />)}
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="border border-border rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-3">
                <Skeleton className="h-3 w-3 rounded-full" />
                <Skeleton className="h-7 flex-1 max-w-[200px]" />
                <Skeleton className="h-5 w-16 ml-auto" />
              </div>
              <Skeleton className="h-7 w-full" />
              <div className="flex flex-wrap gap-1.5">
                {[1, 2, 3, 4, 5].map(j => <Skeleton key={j} className="h-5 w-16 rounded-full" />)}
              </div>
              <div className="flex justify-end">
                <Skeleton className="h-7 w-20" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold">Administracion de Hermes</h1>
        <a href="/" className="text-xs text-muted-foreground hover:text-foreground">← Volver al chat</a>
      </div>

      <div className="flex gap-1 mb-6 border-b border-border">
        {([
          ['companies', `Empresas (${companies.length})`],
          ['orders', `Pedidos (${orders.length})`],
          ['users', `Usuarios (${users.length})`],
          ['agents', `Subagentes (${agents.length})`],
          ['skills', `Skills (${skills.length})`],
          ['schedules', `Tareas (${scheduledTasks.length})`],
          ['costing', 'Costeo'],
        ] as const).map(([key, label]) => (
          <Button
            key={key}
            variant={tab === key ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setTab(key)}
          >
            {label}
          </Button>
        ))}
      </div>

      {tab === 'companies' && (
        <div className="space-y-3">
          {companies.map(company => (
            <Card key={company.id}>
              <CardContent className="py-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Input
                    value={company.name}
                    onChange={e => updateCompany(company.id, { name: e.target.value })}
                    className="h-7 text-sm font-medium flex-1"
                  />
                  <Input
                    value={company.rut || ''}
                    onChange={e => updateCompany(company.id, { rut: e.target.value })}
                    placeholder="RUT"
                    className="h-7 text-xs w-32"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    value={company.contact_email || ''}
                    onChange={e => updateCompany(company.id, { contact_email: e.target.value })}
                    placeholder="Email de contacto"
                    className="h-7 text-xs flex-1"
                  />
                  <Input
                    value={company.contact_phone || ''}
                    onChange={e => updateCompany(company.id, { contact_phone: e.target.value })}
                    placeholder="Telefono"
                    className="h-7 text-xs w-40"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="text-[10px] font-mono">{company.id.slice(0, 8)}</Badge>
                  <Button
                    size="sm"
                    className="h-7 text-xs bg-emerald-600 hover:bg-emerald-500"
                    onClick={() => saveCompany(company)}
                    disabled={saving === company.id}
                  >
                    <SaveIcon className="w-3 h-3 mr-1" />
                    {saving === company.id ? 'Guardando...' : 'Guardar'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {companies.length === 0 && (
            <p className="text-xs text-muted-foreground">No hay empresas registradas.</p>
          )}
        </div>
      )}

      {tab === 'orders' && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setOrderFilter('all')}
              className={`text-[11px] px-2 py-0.5 rounded-full border ${orderFilter === 'all' ? 'bg-primary/10 border-primary/30 text-primary' : 'border-border text-muted-foreground'}`}
            >
              Todos ({orders.length})
            </button>
            {ORDER_STATUSES.map(s => {
              const count = orders.filter(o => o.status === s).length
              if (count === 0) return null
              return (
                <button
                  key={s}
                  onClick={() => setOrderFilter(s)}
                  className={`text-[11px] px-2 py-0.5 rounded-full border ${orderFilter === s ? 'bg-primary/10 border-primary/30 text-primary' : 'border-border text-muted-foreground'}`}
                >
                  {s} ({count})
                </button>
              )
            })}
          </div>
          {orders.filter(o => orderFilter === 'all' || o.status === orderFilter).map(order => (
            <Card key={order.id}>
              <CardContent className="py-3 space-y-2">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${STATUS_COLORS[order.status] || 'bg-gray-400'}`} />
                  <span className="text-sm font-medium flex-1 truncate">{order.supplier_name}</span>
                  {order.po_number && <Badge variant="outline" className="text-[10px] font-mono">{order.po_number}</Badge>}
                  <select
                    value={order.status}
                    onChange={e => updateOrderStatus(order.id, e.target.value)}
                    className="h-7 rounded-md border border-border bg-background px-2 text-xs"
                  >
                    {ORDER_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <Separator />
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <Badge variant="secondary" className="text-[10px]">{order.company_name || order.company_id.slice(0, 8)}</Badge>
                  <div className="flex items-center gap-3">
                    {order.total_amount != null && (
                      <span className="font-mono">{order.currency || 'USD'} {Number(order.total_amount).toLocaleString()}</span>
                    )}
                    {order.estimated_arrival && <span>ETA {order.estimated_arrival}</span>}
                    <span>upd {new Date(order.updated_at).toLocaleDateString()}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {orders.length === 0 && (
            <p className="text-xs text-muted-foreground">No hay pedidos registrados.</p>
          )}
        </div>
      )}

      {tab === 'users' && (
        <div className="space-y-2">
          {users.map(u => (
            <Card key={u.id}>
              <CardContent className="py-3 flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{u.full_name || '(sin nombre)'}</div>
                  <div className="text-[11px] text-muted-foreground font-mono truncate">{u.user_id}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-[10px]">{u.company_name || u.company_id.slice(0, 8)}</Badge>
                  <select
                    value={u.role}
                    onChange={e => updateUserRole(u.id, e.target.value)}
                    className="h-7 rounded-md border border-border bg-background px-2 text-xs"
                  >
                    <option value="admin">admin</option>
                    <option value="client">client</option>
                  </select>
                </div>
              </CardContent>
            </Card>
          ))}
          {users.length === 0 && (
            <p className="text-xs text-muted-foreground">No hay usuarios asignados a empresas.</p>
          )}
        </div>
      )}

      {tab === 'agents' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button size="sm" className="h-7 text-xs" onClick={createAgent}>+ Nuevo agente</Button>
          </div>
          {agents.map(agent => (
            <Card key={agent.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${COLOR_CLASSES[agent.color] || 'bg-gray-600'}`} />
                    <Input
                      value={agent.display_name}
                      onChange={e => updateAgent(agent.id, { display_name: e.target.value })}
                      className="h-7 w-40 text-sm font-medium"
                    />
                    <Badge variant="outline" className="text-[10px]">{agent.name}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={agent.model}
                      onChange={e => updateAgent(agent.id, { model: e.target.value })}
                      className="h-7 rounded-md border border-border bg-background px-2 text-xs"
                    >
                      {MODELS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <select
                      value={agent.color}
                      onChange={e => updateAgent(agent.id, { color: e.target.value })}
                      className="h-7 rounded-md border border-border bg-background px-2 text-xs"
                    >
                      {COLORS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <Button
                      variant={agent.enabled ? 'default' : 'outline'}
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => updateAgent(agent.id, { enabled: !agent.enabled })}
                    >
                      {agent.enabled ? 'Activo' : 'Inactivo'}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input
                  value={agent.description}
                  onChange={e => updateAgent(agent.id, { description: e.target.value })}
                  placeholder="Descripcion del agente"
                  className="text-xs"
                />

                <div>
                  <p className="text-[11px] text-muted-foreground mb-1.5">Skills asignados</p>
                  <div className="flex flex-wrap gap-1.5">
                    {skills.map(skill => {
                      const active = agent.skills.includes(skill.name)
                      return (
                        <button
                          key={skill.name}
                          onClick={() => toggleSkillOnAgent(agent.id, skill.name)}
                          className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
                            active
                              ? 'bg-primary/10 border-primary/30 text-primary'
                              : 'border-border text-muted-foreground/50 hover:border-border hover:text-muted-foreground'
                          }`}
                        >
                          {skill.display_name}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <textarea
                  value={agent.system_prompt || ''}
                  onChange={e => updateAgent(agent.id, { system_prompt: e.target.value })}
                  placeholder="System prompt del agente"
                  rows={3}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs resize-y min-h-[60px] placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />

                <div className="flex justify-end">
                  <Button
                    size="sm"
                    className="h-7 text-xs bg-emerald-600 hover:bg-emerald-500"
                    onClick={() => saveAgent(agent)}
                    disabled={saving === agent.id}
                  >
                    <SaveIcon className="w-3 h-3 mr-1" />
                    {saving === agent.id ? 'Guardando...' : 'Guardar'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {tab === 'costing' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Valores de referencia para costeo preliminar. El agente los usa con <code className="text-[10px] bg-muted px-1 rounded">get_costing_defaults</code>.</p>
            <Button size="sm" className="h-7 text-xs" onClick={addCostingDefault}>+ Nuevo valor</Button>
          </div>
          {(['freight', 'port', 'services', 'taxes', 'lastmile', 'other'] as const).map(cat => {
            const items = costingDefaults.filter(c => c.category === cat).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
            if (items.length === 0) return null
            const catLabels: Record<string, string> = {
              freight: 'Flete y seguro',
              taxes: 'Impuestos y aranceles',
              services: 'Servicios',
              port: 'Puerto y almacenaje',
              lastmile: 'Last mile',
              other: 'Otros',
            }
            return (
              <div key={cat}>
                <h3 className="text-xs font-medium text-muted-foreground mb-2">{catLabels[cat] || cat}</h3>
                <div className="space-y-2">
                  {items.map(item => (
                    <Card key={item.id}>
                      <CardContent className="py-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <Input
                            value={item.label}
                            onChange={e => updateCostingDefault(item.id, { label: e.target.value })}
                            className="h-7 text-sm font-medium w-44"
                          />
                          <Input
                            type="number"
                            value={item.value}
                            onChange={e => updateCostingDefault(item.id, { value: Number(e.target.value) })}
                            className="h-7 text-sm font-mono w-24 text-right"
                            step="any"
                          />
                          <select
                            value={item.unit}
                            onChange={e => updateCostingDefault(item.id, { unit: e.target.value })}
                            className="h-7 rounded-md border border-border bg-background px-2 text-xs w-24"
                          >
                            <option value="USD">USD</option>
                            <option value="USD/cbm">USD/cbm</option>
                            <option value="USD/kg">USD/kg</option>
                            <option value="CLP">CLP</option>
                            <option value="CLP/cbm">CLP/cbm</option>
                            <option value="%">%</option>
                          </select>
                          <select
                            value={item.qty_type || 'flat'}
                            onChange={e => updateCostingDefault(item.id, { qty_type: e.target.value })}
                            className="h-7 rounded-md border border-border bg-background px-2 text-xs w-24"
                          >
                            <option value="flat">Fijo</option>
                            <option value="per_cbm">× CBM</option>
                            <option value="pct_fob">% FOB</option>
                            <option value="pct_cif">% CIF</option>
                          </select>
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-muted-foreground/50">Min</span>
                            <Input
                              type="number"
                              value={item.minimum || 0}
                              onChange={e => updateCostingDefault(item.id, { minimum: Number(e.target.value) })}
                              className="h-7 text-xs font-mono w-20 text-right"
                              step="any"
                            />
                          </div>
                          <select
                            value={item.currency || 'USD'}
                            onChange={e => updateCostingDefault(item.id, { currency: e.target.value })}
                            className="h-7 rounded-md border border-border bg-background px-2 text-xs w-16"
                          >
                            <option value="USD">USD</option>
                            <option value="CLP">CLP</option>
                          </select>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px] font-mono shrink-0">{item.key}</Badge>
                          <Input
                            value={item.notes || ''}
                            onChange={e => updateCostingDefault(item.id, { notes: e.target.value })}
                            placeholder="Notas"
                            className="h-7 text-xs flex-1"
                          />
                          <select
                            value={item.category}
                            onChange={e => updateCostingDefault(item.id, { category: e.target.value })}
                            className="h-7 rounded-md border border-border bg-background px-2 text-xs w-24"
                          >
                            <option value="freight">Flete</option>
                            <option value="port">Puerto</option>
                            <option value="services">Servicios</option>
                            <option value="taxes">Impuestos</option>
                            <option value="lastmile">Last mile</option>
                            <option value="other">Otro</option>
                          </select>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-destructive hover:text-destructive"
                            onClick={() => deleteCostingDefault(item.id)}
                          >
                            Eliminar
                          </Button>
                          <Button
                            size="sm"
                            className="h-7 text-xs bg-emerald-600 hover:bg-emerald-500"
                            onClick={() => saveCostingDefault(item)}
                            disabled={saving === item.id}
                          >
                            <SaveIcon className="w-3 h-3 mr-1" />
                            {saving === item.id ? '...' : 'Guardar'}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )
          })}
          {costingDefaults.length === 0 && (
            <p className="text-xs text-muted-foreground">No hay valores de referencia configurados.</p>
          )}
        </div>
      )}

      {tab === 'skills' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button size="sm" className="h-7 text-xs" onClick={createSkill}>+ Nuevo skill</Button>
          </div>
          {skills.map(skill => (
            <Card key={skill.id}>
              <CardContent className="py-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Input
                    value={skill.display_name}
                    onChange={e => updateSkill(skill.id, { display_name: e.target.value })}
                    className="h-7 w-48 text-sm font-medium"
                  />
                  <Badge variant="outline" className="text-[10px]">{skill.name}</Badge>
                  {skill.context === 'fork' && (
                    <Badge variant="secondary" className="text-[10px]">fork → {skill.fork_agent}</Badge>
                  )}
                  <span className="ml-auto text-[10px] text-muted-foreground/40">
                    Usado por {agents.filter(a => a.skills.includes(skill.name)).length} agentes
                  </span>
                </div>
                <Input
                  value={skill.description || ''}
                  onChange={e => updateSkill(skill.id, { description: e.target.value })}
                  placeholder="Descripcion"
                  className="text-xs"
                />
                <div>
                  <p className="text-[11px] text-muted-foreground mb-1">MCP tools (coma)</p>
                  <Input
                    value={skill.mcp_tools.join(', ')}
                    onChange={e => updateSkill(skill.id, { mcp_tools: e.target.value.split(',').map(t => t.trim()).filter(Boolean) })}
                    placeholder="create_order, list_orders"
                    className="text-xs font-mono"
                  />
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground mb-1">Content (markdown)</p>
                  <textarea
                    value={skill.content || ''}
                    onChange={e => updateSkill(skill.id, { content: e.target.value })}
                    rows={6}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs font-mono resize-y min-h-[120px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    className="h-7 text-xs bg-emerald-600 hover:bg-emerald-500"
                    onClick={() => saveSkill(skill)}
                    disabled={saving === skill.id}
                  >
                    <SaveIcon className="w-3 h-3 mr-1" />
                    {saving === skill.id ? 'Guardando...' : 'Guardar'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {tab === 'schedules' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Tareas programadas — <code className="text-[10px] bg-muted px-1 rounded">hermes_cron_tick()</code> cada minuto.
            </p>
            <Button size="sm" className="h-7 text-xs" onClick={() => setCreatingTask(true)}>+ Nueva tarea</Button>
          </div>

          {creatingTask && (
            <TaskCreateForm
              companies={companies}
              skills={skills}
              callGateway={callGateway}
              onCreate={createScheduledTask}
              onCancel={() => setCreatingTask(false)}
            />
          )}

          {scheduledTasks.length === 0 && !creatingTask && (
            <p className="text-xs text-muted-foreground">No hay tareas programadas.</p>
          )}
          {scheduledTasks.map(task => {
            const isExpanded = expandedTask === task.id
            const runs = taskRuns[task.id] || []
            return (
              <Card key={task.id} className={task.enabled ? '' : 'opacity-60'}>
                <CardContent className="py-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <button onClick={() => toggleExpandTask(task.id)} className="shrink-0 text-muted-foreground/50">
                      {isExpanded ? <ChevronDownIcon className="w-3.5 h-3.5" /> : <ChevronRightIcon className="w-3.5 h-3.5" />}
                    </button>
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => toggleExpandTask(task.id)}>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{task.name}</span>
                        <Badge variant="outline" className="text-[10px] font-mono shrink-0">{task.cron_expr}</Badge>
                        {task.last_run_status && (
                          <Badge
                            variant={task.last_run_status === 'success' ? 'default' : task.last_run_status === 'error' ? 'destructive' : 'secondary'}
                            className="text-[9px] h-4 shrink-0"
                          >
                            {task.last_run_status}
                          </Badge>
                        )}
                        {!task.enabled && <Badge variant="outline" className="text-[9px] h-4 text-amber-500 border-amber-500/30">pausada</Badge>}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                        <span>{task.company_name || task.company_id.slice(0, 8)}</span>
                        {task.next_run_at && <span>· siguiente {formatTaskTime(task.next_run_at)}</span>}
                        {task.last_run_at && <span>· ultimo {formatTaskPast(task.last_run_at)}</span>}
                        {task.output_channel === 'email' && (
                          <span className="text-emerald-500">· email → {task.output_recipient}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost" size="sm" className="h-7 w-7 p-0"
                        onClick={() => runTaskNow(task)}
                        disabled={taskBusy === task.id}
                        title="Ejecutar ahora"
                      >
                        <PlayIcon className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="sm" className="h-7 w-7 p-0"
                        onClick={() => toggleScheduledTask(task)}
                        disabled={taskBusy === task.id}
                        title={task.enabled ? 'Pausar' : 'Reanudar'}
                      >
                        {task.enabled ? <PauseIcon className="w-3.5 h-3.5" /> : <RefreshCwIcon className="w-3.5 h-3.5" />}
                      </Button>
                      <Button
                        variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        onClick={() => deleteScheduledTask(task)}
                        disabled={taskBusy === task.id}
                        title="Eliminar"
                      >
                        <TrashIcon className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="ml-5 space-y-2 border-t border-border/50 pt-2">
                      <div className="flex items-center gap-2">
                        <Input
                          value={task.name}
                          onChange={e => updateScheduledTask(task.id, { name: e.target.value })}
                          className="h-7 text-xs font-medium w-48"
                          placeholder="slug"
                        />
                        <Input
                          value={task.description || ''}
                          onChange={e => updateScheduledTask(task.id, { description: e.target.value })}
                          className="h-7 text-xs flex-1"
                          placeholder="descripcion (opcional)"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <p className="text-[10px] text-muted-foreground/50 mb-0.5">Cron</p>
                          <Input
                            value={task.cron_expr}
                            onChange={e => updateScheduledTask(task.id, { cron_expr: e.target.value })}
                            className="h-7 text-xs font-mono"
                            placeholder="*/15 * * * *"
                          />
                        </div>
                        <div className="w-40">
                          <p className="text-[10px] text-muted-foreground/50 mb-0.5">Timezone</p>
                          <Input
                            value={task.timezone}
                            onChange={e => updateScheduledTask(task.id, { timezone: e.target.value })}
                            className="h-7 text-xs"
                          />
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground/50 mb-0.5">Prompt</p>
                        <textarea
                          value={task.prompt}
                          onChange={e => updateScheduledTask(task.id, { prompt: e.target.value })}
                          rows={4}
                          className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs resize-y min-h-[60px] placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground/50 mb-0.5">Skills (coma)</p>
                        <Input
                          value={task.enabled_skills.join(', ')}
                          onChange={e => updateScheduledTask(task.id, { enabled_skills: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                          className="h-7 text-xs font-mono"
                          placeholder="hermes-gmail, hermes-orders"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <div>
                          <p className="text-[10px] text-muted-foreground/50 mb-0.5">Canal</p>
                          <select
                            value={task.output_channel}
                            onChange={e => updateScheduledTask(task.id, { output_channel: e.target.value as 'silent' | 'email' })}
                            className="h-7 rounded-md border border-border bg-background px-2 text-xs"
                          >
                            <option value="silent">Silencioso</option>
                            <option value="email">Email</option>
                          </select>
                        </div>
                        {task.output_channel === 'email' && (
                          <>
                            <div className="flex-1">
                              <p className="text-[10px] text-muted-foreground/50 mb-0.5">Destinatario</p>
                              <Input
                                value={task.output_recipient || ''}
                                onChange={e => updateScheduledTask(task.id, { output_recipient: e.target.value })}
                                className="h-7 text-xs"
                                placeholder="email@ejemplo.com"
                                type="email"
                              />
                            </div>
                            <div>
                              <p className="text-[10px] text-muted-foreground/50 mb-0.5">Notificar</p>
                              <select
                                value={task.notify_on}
                                onChange={e => updateScheduledTask(task.id, { notify_on: e.target.value })}
                                className="h-7 rounded-md border border-border bg-background px-2 text-xs"
                              >
                                <option value="always">Siempre</option>
                                <option value="on_change">Si cambio</option>
                                <option value="on_error">Solo errores</option>
                                <option value="never">Nunca</option>
                              </select>
                            </div>
                          </>
                        )}
                      </div>
                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          className="h-7 text-xs bg-emerald-600 hover:bg-emerald-500"
                          onClick={() => saveScheduledTask(task)}
                          disabled={saving === task.id}
                        >
                          <SaveIcon className="w-3 h-3 mr-1" />
                          {saving === task.id ? 'Guardando...' : 'Guardar'}
                        </Button>
                      </div>

                      <Separator />

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground/50">Ultimos runs</p>
                          <Button variant="ghost" size="sm" className="h-5 text-[9px] px-1" onClick={() => loadTaskRuns(task.id)}>
                            <RefreshCwIcon className="w-2.5 h-2.5 mr-0.5" /> Refrescar
                          </Button>
                        </div>
                        {runs.length === 0 ? (
                          <p className="text-[10px] text-muted-foreground/40">Sin ejecuciones</p>
                        ) : (
                          <div className="space-y-1">
                            {runs.map(r => (
                              <div key={r.id} className="flex items-start gap-1.5 text-[10px]">
                                <div className={`w-1.5 h-1.5 rounded-full mt-1 shrink-0 ${
                                  r.status === 'success' ? 'bg-emerald-500' :
                                  r.status === 'error' ? 'bg-red-500' :
                                  r.status === 'running' ? 'bg-blue-500 animate-pulse' : 'bg-muted-foreground/40'
                                }`} />
                                <span className="text-muted-foreground/60 shrink-0">{formatTaskPast(r.started_at)}</span>
                                <span className="text-muted-foreground/40 shrink-0">{r.trigger}</span>
                                {r.duration_ms != null && <span className="text-muted-foreground/40 shrink-0">{(r.duration_ms / 1000).toFixed(1)}s</span>}
                                {r.error && <span className="text-red-500 truncate">{r.error}</span>}
                                {r.response && !r.error && <span className="text-foreground/60 line-clamp-2">{r.response}</span>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

function TaskCreateForm({ companies, skills, callGateway, onCreate, onCancel }: {
  companies: Company[]
  skills: SkillDef[]
  callGateway: (path: string, body: any) => Promise<any>
  onCreate: (data: any) => Promise<void>
  onCancel: () => void
}) {
  const [companyId, setCompanyId] = useState(companies[0]?.id || '')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [cronExpr, setCronExpr] = useState('*/15 * * * *')
  const [prompt, setPrompt] = useState('')
  const [enabledSkills, setEnabledSkills] = useState('')
  const [outputChannel, setOutputChannel] = useState<'silent' | 'email'>('silent')
  const [outputRecipient, setOutputRecipient] = useState('')
  const [notifyOn, setNotifyOn] = useState('always')
  const [cronValid, setCronValid] = useState<{ valid: boolean; next?: string; error?: string } | null>(null)
  const [saving, setSaving] = useState(false)

  async function validateCron(expr: string) {
    setCronExpr(expr)
    try {
      const res = await callGateway('/cron/validate', { cron_expr: expr, timezone: 'America/Santiago' })
      setCronValid({ valid: res.valid, next: res.next_run_at, error: res.error })
    } catch {
      setCronValid({ valid: false, error: 'sin validador' })
    }
  }

  useMountEffect(() => { validateCron(cronExpr) })

  async function handleCreate() {
    if (!name.trim() || !prompt.trim() || !cronValid?.valid || !companyId) return
    setSaving(true)
    await onCreate({
      company_id: companyId,
      name: name.trim(),
      description,
      cron_expr: cronExpr,
      prompt,
      enabled_skills: enabledSkills.split(',').map(s => s.trim()).filter(Boolean),
      output_channel: outputChannel,
      output_recipient: outputRecipient,
      notify_on: notifyOn,
    })
    setSaving(false)
  }

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="py-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-primary">Nueva tarea programada</span>
          <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={onCancel}>Cancelar</Button>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={companyId}
            onChange={e => setCompanyId(e.target.value)}
            className="h-7 rounded-md border border-border bg-background px-2 text-xs"
          >
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="slug: check-inbox" className="h-7 text-xs flex-1" />
        </div>
        <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="descripcion (opcional)" className="h-7 text-xs" />
        <div>
          <Input value={cronExpr} onChange={e => validateCron(e.target.value)} placeholder="*/15 * * * *" className="h-7 text-xs font-mono" />
          {cronValid && (
            <p className={`text-[9px] mt-0.5 ${cronValid.valid ? 'text-emerald-500' : 'text-red-500'}`}>
              {cronValid.valid ? `siguiente: ${cronValid.next ? formatTaskTime(cronValid.next) : '?'}` : cronValid.error}
            </p>
          )}
        </div>
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="prompt que recibira el agente..."
          rows={3}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs resize-y min-h-[50px] placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Input value={enabledSkills} onChange={e => setEnabledSkills(e.target.value)} placeholder="skills (coma): hermes-gmail, hermes-orders" className="h-7 text-xs font-mono" />
        <div className="flex items-center gap-2">
          <select
            value={outputChannel}
            onChange={e => setOutputChannel(e.target.value as 'silent' | 'email')}
            className="h-7 rounded-md border border-border bg-background px-2 text-xs"
          >
            <option value="silent">Silencioso</option>
            <option value="email">Email</option>
          </select>
          {outputChannel === 'email' && (
            <>
              <Input
                value={outputRecipient}
                onChange={e => setOutputRecipient(e.target.value)}
                placeholder="destino@ejemplo.com"
                type="email"
                className="h-7 text-xs flex-1"
              />
              <select
                value={notifyOn}
                onChange={e => setNotifyOn(e.target.value)}
                className="h-7 rounded-md border border-border bg-background px-2 text-xs"
              >
                <option value="always">Siempre</option>
                <option value="on_change">Si cambio</option>
                <option value="on_error">Solo errores</option>
                <option value="never">Nunca</option>
              </select>
            </>
          )}
        </div>
        <div className="flex justify-end">
          <Button
            size="sm"
            className="h-7 text-xs bg-emerald-600 hover:bg-emerald-500"
            onClick={handleCreate}
            disabled={saving || !cronValid?.valid || !name.trim() || !prompt.trim()}
          >
            {saving ? '...' : 'Crear tarea'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function formatTaskTime(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now()
  if (diff < 0) return 'ya'
  const min = Math.floor(diff / 60000)
  if (min < 1) return '<1m'
  if (min < 60) return `en ${min}m`
  const h = Math.floor(min / 60)
  if (h < 24) return `en ${h}h${min % 60 ? ` ${min % 60}m` : ''}`
  return `en ${Math.floor(h / 24)}d`
}

function formatTaskPast(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min}m`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h}h`
  return `hace ${Math.floor(h / 24)}d`
}
