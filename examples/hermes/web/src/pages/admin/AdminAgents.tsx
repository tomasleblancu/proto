import { Card, CardContent, CardHeader } from '@tleblancureta/proto/web'
import { Badge } from '@tleblancureta/proto/web'
import { Button } from '@tleblancureta/proto/web'
import { Input } from '@tleblancureta/proto/web'
import { SaveIcon } from 'lucide-react'
import { COLORS, MODELS, COLOR_CLASSES } from './AdminTypes'
import type { AgentDef, SkillDef } from './AdminTypes'

interface Props {
  agents: AgentDef[]
  skills: SkillDef[]
  saving: string | null
  onUpdate: (id: string, updates: Partial<AgentDef>) => void
  onSave: (agent: AgentDef) => void
  onCreate: () => void
  onToggleSkill: (agentId: string, skillName: string) => void
}

export default function AdminAgents({ agents, skills, saving, onUpdate, onSave, onCreate, onToggleSkill }: Props) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" className="h-7 text-xs" onClick={onCreate}>+ Nuevo agente</Button>
      </div>
      {agents.map(agent => (
        <Card key={agent.id}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${COLOR_CLASSES[agent.color] || 'bg-gray-600'}`} />
                <Input
                  value={agent.display_name}
                  onChange={e => onUpdate(agent.id, { display_name: e.target.value })}
                  className="h-7 w-40 text-sm font-medium"
                />
                <Badge variant="outline" className="text-[10px]">{agent.name}</Badge>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={agent.model}
                  onChange={e => onUpdate(agent.id, { model: e.target.value })}
                  className="h-7 rounded-md border border-border bg-background px-2 text-xs"
                >
                  {MODELS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <select
                  value={agent.color}
                  onChange={e => onUpdate(agent.id, { color: e.target.value })}
                  className="h-7 rounded-md border border-border bg-background px-2 text-xs"
                >
                  {COLORS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <Button
                  variant={agent.enabled ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => onUpdate(agent.id, { enabled: !agent.enabled })}
                >
                  {agent.enabled ? 'Activo' : 'Inactivo'}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              value={agent.description}
              onChange={e => onUpdate(agent.id, { description: e.target.value })}
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
                      onClick={() => onToggleSkill(agent.id, skill.name)}
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
              onChange={e => onUpdate(agent.id, { system_prompt: e.target.value })}
              placeholder="System prompt del agente"
              rows={3}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs resize-y min-h-[60px] placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />

            <div className="flex justify-end">
              <Button
                size="sm"
                className="h-7 text-xs bg-emerald-600 hover:bg-emerald-500"
                onClick={() => onSave(agent)}
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
  )
}
