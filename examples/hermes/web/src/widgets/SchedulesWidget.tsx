import { useState } from 'react'
import { supabase } from '@tleblancureta/proto/web'
import { useData } from '@tleblancureta/proto/web'
import { useMountEffect } from '@tleblancureta/proto/web'
import { GATEWAY_URL, INTERNAL_SECRET } from '@tleblancureta/proto/web'
import { Button } from '@tleblancureta/proto/web'
import { Input } from '@tleblancureta/proto/web'
import { Badge } from '@tleblancureta/proto/web'
import { Skeleton } from '@tleblancureta/proto/web'
import { PlayIcon, PauseIcon, PlusIcon, TrashIcon, ClockIcon, RefreshCwIcon, XIcon } from 'lucide-react'

interface Props {
  companyId: string
  refreshKey: number
}

interface Task {
  id: string
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
  notify_on: 'always' | 'on_change' | 'on_error' | 'never'
}

interface Run {
  id: string
  status: string
  trigger: string
  started_at: string
  finished_at: string | null
  duration_ms: number | null
  response: string | null
  error: string | null
}

export default function SchedulesWidget({ companyId, refreshKey }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [runs, setRuns] = useState<Record<string, Run[]>>({})
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const { data: tasks } = useData(
    async () => {
      const { data } = await supabase
        .from('scheduled_tasks')
        .select('id, name, description, cron_expr, timezone, prompt, enabled_skills, enabled, next_run_at, last_run_at, last_run_status, output_channel, output_recipient, notify_on')
        .eq('company_id', companyId)
        .order('next_run_at', { ascending: true, nullsFirst: false })
      return (data as Task[]) || []
    },
    [companyId, refreshKey, reloadKey],
    null as Task[] | null,
  )

  const reload = () => setReloadKey(k => k + 1)

  async function callGateway(path: string, body: any): Promise<any> {
    const res = await fetch(`${GATEWAY_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': INTERNAL_SECRET },
      body: JSON.stringify(body),
    })
    return res.json().catch(() => ({}))
  }

  async function toggleTask(task: Task) {
    setBusy(task.id)
    if (task.enabled) {
      await supabase.from('scheduled_tasks').update({ enabled: false, next_run_at: null }).eq('id', task.id)
    } else {
      await supabase.from('scheduled_tasks').update({ enabled: true }).eq('id', task.id)
      await callGateway('/cron/recalc', { task_id: task.id })
    }
    reload()
    setBusy(null)
  }

  async function runNow(task: Task) {
    setBusy(task.id)
    await callGateway('/cron/trigger', { task_id: task.id, triggered_by: 'admin' })
    setTimeout(() => { reload(); setBusy(null) }, 500)
  }

  async function deleteTask(task: Task) {
    if (!confirm(`Eliminar "${task.name}"?`)) return
    setBusy(task.id)
    await supabase.from('scheduled_tasks').delete().eq('id', task.id)
    reload()
    setBusy(null)
  }

  async function loadRuns(taskId: string) {
    const { data } = await supabase
      .from('task_runs')
      .select('id, status, trigger, started_at, finished_at, duration_ms, response, error')
      .eq('task_id', taskId)
      .order('started_at', { ascending: false })
      .limit(10)
    setRuns(prev => ({ ...prev, [taskId]: (data as Run[]) || [] }))
  }

  function toggleExpand(taskId: string) {
    if (expanded === taskId) {
      setExpanded(null)
    } else {
      setExpanded(taskId)
      if (!runs[taskId]) loadRuns(taskId)
    }
  }

  if (tasks === null) return <div className="space-y-2">{[1, 2].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground/60">{tasks.length} tarea{tasks.length === 1 ? '' : 's'}</span>
        <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1" onClick={() => setCreating(true)}>
          <PlusIcon className="w-3 h-3" /> Nueva
        </Button>
      </div>

      {creating && (
        <CreateForm companyId={companyId} onDone={() => { setCreating(false); reload() }} onCancel={() => setCreating(false)} />
      )}

      {tasks.length === 0 && !creating && (
        <div className="text-center py-6">
          <ClockIcon className="w-6 h-6 text-muted-foreground/30 mx-auto mb-1" />
          <p className="text-xs text-muted-foreground/60">Sin tareas programadas</p>
        </div>
      )}

      {tasks.map(task => {
        const isExpanded = expanded === task.id
        const taskRuns = runs[task.id] || []
        return (
          <div key={task.id} className={`border rounded-lg overflow-hidden transition-colors ${task.enabled ? 'border-border' : 'border-border/40 opacity-60'}`}>
            <div className="p-2 space-y-1">
              <div className="flex items-center gap-2">
                <button onClick={() => toggleExpand(task.id)} className="flex-1 min-w-0 text-left">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium truncate">{task.name}</span>
                    {task.last_run_status && (
                      <Badge variant={task.last_run_status === 'success' ? 'default' : task.last_run_status === 'error' ? 'destructive' : 'secondary'} className="text-[9px] h-4 shrink-0">
                        {task.last_run_status}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                    <span className="font-mono">{task.cron_expr}</span>
                    {task.next_run_at && <span>· siguiente {formatFuture(task.next_run_at)}</span>}
                    {!task.enabled && <span className="text-amber-500">· pausada</span>}
                    {task.output_channel === 'email' && (
                      <span className="text-emerald-500" title={`Envia a ${task.output_recipient}`}>✉ {task.notify_on}</span>
                    )}
                  </div>
                </button>
                <div className="flex items-center gap-0.5 shrink-0">
                  <IconBtn onClick={() => runNow(task)} disabled={busy === task.id} title="Ejecutar ahora">
                    <PlayIcon className="w-3 h-3" />
                  </IconBtn>
                  <IconBtn onClick={() => toggleTask(task)} disabled={busy === task.id} title={task.enabled ? 'Pausar' : 'Reanudar'}>
                    {task.enabled ? <PauseIcon className="w-3 h-3" /> : <RefreshCwIcon className="w-3 h-3" />}
                  </IconBtn>
                  <IconBtn onClick={() => deleteTask(task)} disabled={busy === task.id} title="Eliminar">
                    <TrashIcon className="w-3 h-3" />
                  </IconBtn>
                </div>
              </div>
              {task.description && <p className="text-[10px] text-muted-foreground/70 truncate">{task.description}</p>}
            </div>

            {isExpanded && (
              <div className="border-t border-border/50 bg-accent/20 p-2 space-y-2">
                <div>
                  <p className="text-[9px] uppercase tracking-wide text-muted-foreground/50 mb-0.5">Prompt</p>
                  <p className="text-[11px] text-foreground/80 line-clamp-3">{task.prompt}</p>
                </div>
                {task.enabled_skills.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {task.enabled_skills.map(s => (
                      <span key={s} className="text-[9px] px-1.5 py-0.5 rounded bg-background border border-border/60 font-mono text-muted-foreground">{s}</span>
                    ))}
                  </div>
                )}
                <div>
                  <p className="text-[9px] uppercase tracking-wide text-muted-foreground/50 mb-1">Ultimos runs</p>
                  {taskRuns.length === 0 ? (
                    <p className="text-[10px] text-muted-foreground/50">Sin ejecuciones todavia</p>
                  ) : (
                    <div className="space-y-1">
                      {taskRuns.map(r => (
                        <div key={r.id} className="flex items-center gap-1.5 text-[10px]">
                          <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            r.status === 'success' ? 'bg-emerald-500' :
                            r.status === 'error' ? 'bg-red-500' :
                            r.status === 'running' ? 'bg-blue-500 animate-pulse' : 'bg-muted-foreground/40'
                          }`} />
                          <span className="text-muted-foreground/60 shrink-0">{formatPast(r.started_at)}</span>
                          <span className="text-muted-foreground/40 shrink-0">{r.trigger}</span>
                          {r.duration_ms && <span className="text-muted-foreground/40 shrink-0">{(r.duration_ms / 1000).toFixed(1)}s</span>}
                          {r.error && <span className="text-red-500 truncate">{r.error}</span>}
                          {r.response && !r.error && <span className="text-foreground/70 truncate">{r.response}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function IconBtn({ children, onClick, disabled, title }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; title: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="p-1 rounded hover:bg-accent text-muted-foreground/60 hover:text-foreground disabled:opacity-30 transition-colors"
    >
      {children}
    </button>
  )
}

function CreateForm({ companyId, onDone, onCancel }: { companyId: string; onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState('')
  const [cronExpr, setCronExpr] = useState('*/15 * * * *')
  const [prompt, setPrompt] = useState('')
  const [description, setDescription] = useState('')
  const [skills, setSkills] = useState('')
  const [outputChannel, setOutputChannel] = useState<'silent' | 'email'>('silent')
  const [outputRecipient, setOutputRecipient] = useState('')
  const [notifyOn, setNotifyOn] = useState<'always' | 'on_change' | 'on_error' | 'never'>('always')
  const [validation, setValidation] = useState<{ valid: boolean; next?: string; error?: string } | null>(null)
  const [saving, setSaving] = useState(false)

  async function validateCron(expr: string) {
    setCronExpr(expr)
    try {
      const res = await fetch(`${GATEWAY_URL}/cron/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': INTERNAL_SECRET },
        body: JSON.stringify({ cron_expr: expr, timezone: 'America/Santiago' }),
      })
      const body = await res.json()
      setValidation({ valid: body.valid, next: body.next_run_at, error: body.error })
    } catch {
      setValidation({ valid: false, error: 'no validator' })
    }
  }

  useMountEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setOutputRecipient(data.user?.email ?? '')
    })
    validateCron(cronExpr)
  })

  async function save() {
    if (!name.trim() || !prompt.trim() || !validation?.valid) return
    if (outputChannel === 'email' && !outputRecipient.trim()) {
      alert('Falta email destinatario')
      return
    }
    setSaving(true)
    const { data, error } = await supabase.from('scheduled_tasks').insert({
      company_id: companyId,
      name: name.trim(),
      description: description.trim() || null,
      cron_expr: cronExpr,
      prompt: prompt.trim(),
      enabled_skills: skills.split(',').map(s => s.trim()).filter(Boolean),
      output_channel: outputChannel,
      output_recipient: outputChannel === 'email' ? outputRecipient.trim() : null,
      notify_on: notifyOn,
      enabled: true,
    }).select('id').single()
    if (error) {
      alert(error.message)
      setSaving(false)
      return
    }
    // Trigger recalc so next_run_at gets populated
    await fetch(`${GATEWAY_URL}/cron/recalc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': INTERNAL_SECRET },
      body: JSON.stringify({ task_id: data.id }),
    })
    setSaving(false)
    onDone()
  }

  return (
    <div className="border border-primary/30 rounded-lg p-2 bg-primary/5 space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium text-primary">Nueva tarea</span>
        <button onClick={onCancel} className="text-muted-foreground/50 hover:text-foreground">
          <XIcon className="w-3 h-3" />
        </button>
      </div>
      <Input value={name} onChange={e => setName(e.target.value)} placeholder="slug: check-inbox" className="h-7 text-xs" />
      <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="descripcion (opcional)" className="h-7 text-xs" />
      <div className="space-y-0.5">
        <Input value={cronExpr} onChange={e => validateCron(e.target.value)} placeholder="cron: */15 * * * *" className="h-7 text-xs font-mono" />
        {validation && (
          <p className={`text-[9px] ${validation.valid ? 'text-emerald-500' : 'text-red-500'}`}>
            {validation.valid ? `✓ siguiente: ${validation.next ? formatFuture(validation.next) : '?'}` : `✗ ${validation.error}`}
          </p>
        )}
      </div>
      <textarea
        value={prompt}
        onChange={e => setPrompt(e.target.value)}
        placeholder="prompt que recibira el agente..."
        rows={3}
        className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs resize-y min-h-[50px] placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
      <Input value={skills} onChange={e => setSkills(e.target.value)} placeholder="skills (coma): hermes-gmail,hermes-orders" className="h-7 text-xs font-mono" />

      <div className="pt-1 border-t border-border/40 space-y-1">
        <p className="text-[9px] uppercase tracking-wide text-muted-foreground/60">Al terminar cada run</p>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setOutputChannel('silent')}
            className={`flex-1 text-[10px] px-2 py-1 rounded border transition-colors ${outputChannel === 'silent' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}
          >
            Silencioso
          </button>
          <button
            type="button"
            onClick={() => setOutputChannel('email')}
            className={`flex-1 text-[10px] px-2 py-1 rounded border transition-colors ${outputChannel === 'email' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}
          >
            Enviar email
          </button>
        </div>
        {outputChannel === 'email' && (
          <>
            <Input
              value={outputRecipient}
              onChange={e => setOutputRecipient(e.target.value)}
              placeholder="destino@ejemplo.com"
              type="email"
              className="h-7 text-xs"
            />
            <select
              value={notifyOn}
              onChange={e => setNotifyOn(e.target.value as any)}
              className="w-full h-7 rounded-md border border-border bg-background px-2 text-xs"
            >
              <option value="always">En cada run</option>
              <option value="on_change">Solo si cambio el estado</option>
              <option value="on_error">Solo en errores</option>
              <option value="never">Nunca (deshabilitado)</option>
            </select>
            <p className="text-[9px] text-muted-foreground/60">Envia desde el mail del sistema Hermes — no requiere conectar tu Gmail.</p>
          </>
        )}
      </div>

      <div className="flex justify-end gap-1 pt-0.5">
        <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={onCancel}>Cancelar</Button>
        <Button size="sm" className="h-6 text-[10px] bg-emerald-600 hover:bg-emerald-500" onClick={save} disabled={saving || !validation?.valid || !name.trim() || !prompt.trim()}>
          {saving ? '...' : 'Crear'}
        </Button>
      </div>
    </div>
  )
}

function formatFuture(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now()
  if (diff < 0) return 'ya'
  const min = Math.floor(diff / 60000)
  if (min < 1) return '<1m'
  if (min < 60) return `en ${min}m`
  const h = Math.floor(min / 60)
  if (h < 24) return `en ${h}h${min % 60 ? ` ${min % 60}m` : ''}`
  return `en ${Math.floor(h / 24)}d`
}

function formatPast(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'ahora'
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}
