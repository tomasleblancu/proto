import { useState } from 'react'
import { useMountEffect } from '@tleblancureta/proto/web'
import { supabase } from '@tleblancureta/proto/web'
import { GATEWAY_URL, INTERNAL_SECRET } from '@tleblancureta/proto/web'
import { Button } from '@tleblancureta/proto/web'
import { Skeleton } from '@tleblancureta/proto/web'
import AdminCompanies from './admin/AdminCompanies'
import AdminOrders from './admin/AdminOrders'
import AdminUsers from './admin/AdminUsers'
import AdminAgents from './admin/AdminAgents'
import AdminSkills from './admin/AdminSkills'
import AdminCosting from './admin/AdminCosting'
import AdminSchedules from './admin/AdminSchedules'
import type { Company, CompanyUser, Order, CostingDefault, AgentDef, SkillDef, ScheduledTask, TaskRun } from './admin/AdminTypes'

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
    const s = agent.skills.includes(skillName)
      ? agent.skills.filter(sk => sk !== skillName)
      : [...agent.skills, skillName]
    updateAgent(agentId, { skills: s })
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
        <AdminCompanies companies={companies} saving={saving} onUpdate={updateCompany} onSave={saveCompany} />
      )}

      {tab === 'orders' && (
        <AdminOrders orders={orders} onUpdateStatus={updateOrderStatus} />
      )}

      {tab === 'users' && (
        <AdminUsers users={users} onUpdateRole={updateUserRole} />
      )}

      {tab === 'agents' && (
        <AdminAgents
          agents={agents} skills={skills} saving={saving}
          onUpdate={updateAgent} onSave={saveAgent} onCreate={createAgent} onToggleSkill={toggleSkillOnAgent}
        />
      )}

      {tab === 'skills' && (
        <AdminSkills
          skills={skills} agents={agents} saving={saving}
          onUpdate={updateSkill} onSave={saveSkill} onCreate={createSkill}
        />
      )}

      {tab === 'costing' && (
        <AdminCosting
          costingDefaults={costingDefaults} saving={saving}
          onUpdate={updateCostingDefault} onSave={saveCostingDefault} onAdd={addCostingDefault} onDelete={deleteCostingDefault}
        />
      )}

      {tab === 'schedules' && (
        <AdminSchedules
          scheduledTasks={scheduledTasks} companies={companies} skills={skills}
          saving={saving} taskBusy={taskBusy} expandedTask={expandedTask} taskRuns={taskRuns} creatingTask={creatingTask}
          onToggleTask={toggleScheduledTask} onRunNow={runTaskNow} onDelete={deleteScheduledTask}
          onToggleExpand={toggleExpandTask} onLoadRuns={loadTaskRuns}
          onUpdate={updateScheduledTask} onSave={saveScheduledTask} onCreate={createScheduledTask}
          onSetCreating={setCreatingTask} callGateway={callGateway}
        />
      )}
    </div>
  )
}
