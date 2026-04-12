import { Card, CardContent } from '@tleblancureta/proto/web'
import { Badge } from '@tleblancureta/proto/web'
import { Button } from '@tleblancureta/proto/web'
import { Input } from '@tleblancureta/proto/web'
import { SaveIcon } from 'lucide-react'
import type { AgentDef, SkillDef } from './AdminTypes'

interface Props {
  skills: SkillDef[]
  agents: AgentDef[]
  saving: string | null
  onUpdate: (id: string, updates: Partial<SkillDef>) => void
  onSave: (skill: SkillDef) => void
  onCreate: () => void
}

export default function AdminSkills({ skills, agents, saving, onUpdate, onSave, onCreate }: Props) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" className="h-7 text-xs" onClick={onCreate}>+ Nuevo skill</Button>
      </div>
      {skills.map(skill => (
        <Card key={skill.id}>
          <CardContent className="py-3 space-y-2">
            <div className="flex items-center gap-2">
              <Input
                value={skill.display_name}
                onChange={e => onUpdate(skill.id, { display_name: e.target.value })}
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
              onChange={e => onUpdate(skill.id, { description: e.target.value })}
              placeholder="Descripcion"
              className="text-xs"
            />
            <div>
              <p className="text-[11px] text-muted-foreground mb-1">MCP tools (coma)</p>
              <Input
                value={skill.mcp_tools.join(', ')}
                onChange={e => onUpdate(skill.id, { mcp_tools: e.target.value.split(',').map(t => t.trim()).filter(Boolean) })}
                placeholder="create_order, list_orders"
                className="text-xs font-mono"
              />
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground mb-1">Content (markdown)</p>
              <textarea
                value={skill.content || ''}
                onChange={e => onUpdate(skill.id, { content: e.target.value })}
                rows={6}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs font-mono resize-y min-h-[120px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="flex justify-end">
              <Button
                size="sm"
                className="h-7 text-xs bg-emerald-600 hover:bg-emerald-500"
                onClick={() => onSave(skill)}
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
  )
}
