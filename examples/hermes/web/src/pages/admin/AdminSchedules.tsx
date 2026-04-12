import { useState } from 'react'
import { useMountEffect } from '@tleblancureta/proto/web'
import { Card, CardContent } from '@tleblancureta/proto/web'
import { Badge } from '@tleblancureta/proto/web'
import { Button } from '@tleblancureta/proto/web'
import { Input } from '@tleblancureta/proto/web'
import { Separator } from '@tleblancureta/proto/web'
import { SaveIcon, PlayIcon, PauseIcon, TrashIcon, RefreshCwIcon, ChevronDownIcon, ChevronRightIcon } from 'lucide-react'
import { formatTaskTime, formatTaskPast } from './AdminTypes'
import type { Company, SkillDef, ScheduledTask, TaskRun } from './AdminTypes'

interface Props {
  scheduledTasks: ScheduledTask[]
  companies: Company[]
  skills: SkillDef[]
  saving: string | null
  taskBusy: string | null
  expandedTask: string | null
  taskRuns: Record<string, TaskRun[]>
  creatingTask: boolean
  onToggleTask: (task: ScheduledTask) => void
  onRunNow: (task: ScheduledTask) => void
  onDelete: (task: ScheduledTask) => void
  onToggleExpand: (taskId: string) => void
  onLoadRuns: (taskId: string) => void
  onUpdate: (id: string, updates: Partial<ScheduledTask>) => void
  onSave: (task: ScheduledTask) => void
  onCreate: (data: any) => Promise<void>
  onSetCreating: (v: boolean) => void
  callGateway: (path: string, body: any) => Promise<any>
}

export default function AdminSchedules({
  scheduledTasks, companies, skills, saving, taskBusy, expandedTask, taskRuns, creatingTask,
  onToggleTask, onRunNow, onDelete, onToggleExpand, onLoadRuns, onUpdate, onSave, onCreate, onSetCreating, callGateway,
}: Props) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Tareas programadas — <code className="text-[10px] bg-muted px-1 rounded">hermes_cron_tick()</code> cada minuto.
        </p>
        <Button size="sm" className="h-7 text-xs" onClick={() => onSetCreating(true)}>+ Nueva tarea</Button>
      </div>

      {creatingTask && (
        <TaskCreateForm
          companies={companies}
          skills={skills}
          callGateway={callGateway}
          onCreate={onCreate}
          onCancel={() => onSetCreating(false)}
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
                <button onClick={() => onToggleExpand(task.id)} className="shrink-0 text-muted-foreground/50">
                  {isExpanded ? <ChevronDownIcon className="w-3.5 h-3.5" /> : <ChevronRightIcon className="w-3.5 h-3.5" />}
                </button>
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onToggleExpand(task.id)}>
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
                    onClick={() => onRunNow(task)}
                    disabled={taskBusy === task.id}
                    title="Ejecutar ahora"
                  >
                    <PlayIcon className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost" size="sm" className="h-7 w-7 p-0"
                    onClick={() => onToggleTask(task)}
                    disabled={taskBusy === task.id}
                    title={task.enabled ? 'Pausar' : 'Reanudar'}
                  >
                    {task.enabled ? <PauseIcon className="w-3.5 h-3.5" /> : <RefreshCwIcon className="w-3.5 h-3.5" />}
                  </Button>
                  <Button
                    variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                    onClick={() => onDelete(task)}
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
                      onChange={e => onUpdate(task.id, { name: e.target.value })}
                      className="h-7 text-xs font-medium w-48"
                      placeholder="slug"
                    />
                    <Input
                      value={task.description || ''}
                      onChange={e => onUpdate(task.id, { description: e.target.value })}
                      className="h-7 text-xs flex-1"
                      placeholder="descripcion (opcional)"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <p className="text-[10px] text-muted-foreground/50 mb-0.5">Cron</p>
                      <Input
                        value={task.cron_expr}
                        onChange={e => onUpdate(task.id, { cron_expr: e.target.value })}
                        className="h-7 text-xs font-mono"
                        placeholder="*/15 * * * *"
                      />
                    </div>
                    <div className="w-40">
                      <p className="text-[10px] text-muted-foreground/50 mb-0.5">Timezone</p>
                      <Input
                        value={task.timezone}
                        onChange={e => onUpdate(task.id, { timezone: e.target.value })}
                        className="h-7 text-xs"
                      />
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground/50 mb-0.5">Prompt</p>
                    <textarea
                      value={task.prompt}
                      onChange={e => onUpdate(task.id, { prompt: e.target.value })}
                      rows={4}
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs resize-y min-h-[60px] placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground/50 mb-0.5">Skills (coma)</p>
                    <Input
                      value={task.enabled_skills.join(', ')}
                      onChange={e => onUpdate(task.id, { enabled_skills: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                      className="h-7 text-xs font-mono"
                      placeholder="hermes-gmail, hermes-orders"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <div>
                      <p className="text-[10px] text-muted-foreground/50 mb-0.5">Canal</p>
                      <select
                        value={task.output_channel}
                        onChange={e => onUpdate(task.id, { output_channel: e.target.value as 'silent' | 'email' })}
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
                            onChange={e => onUpdate(task.id, { output_recipient: e.target.value })}
                            className="h-7 text-xs"
                            placeholder="email@ejemplo.com"
                            type="email"
                          />
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground/50 mb-0.5">Notificar</p>
                          <select
                            value={task.notify_on}
                            onChange={e => onUpdate(task.id, { notify_on: e.target.value })}
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
                      onClick={() => onSave(task)}
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
                      <Button variant="ghost" size="sm" className="h-5 text-[9px] px-1" onClick={() => onLoadRuns(task.id)}>
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
