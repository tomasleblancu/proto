import { useState } from 'react'
import { supabase } from 'proto/web'
import { useData } from 'proto/web'
import { Badge } from 'proto/web'
import { Button } from 'proto/web'
import { Input } from 'proto/web'
import { SaveIcon } from 'lucide-react'

interface AgentDef {
  id: string; name: string; display_name: string; description: string
  model: string; skills: string[]; color: string; enabled: boolean
  system_prompt: string | null
}

interface SkillDef {
  id: string; name: string; display_name: string; mcp_tools: string[]; category: string | null
}

const MODELS = ['haiku', 'sonnet', 'opus']
const COLOR_DOT: Record<string, string> = {
  green: 'bg-emerald-500', blue: 'bg-blue-500', cyan: 'bg-cyan-500',
  purple: 'bg-purple-500', orange: 'bg-orange-500', yellow: 'bg-yellow-500',
}

export default function AdminWidget() {
  const [agentsLocal, setAgentsLocal] = useState<AgentDef[] | null>(null)
  const [tab, setTab] = useState<'agents' | 'skills'>('agents')
  const [saving, setSaving] = useState<string | null>(null)

  const { data: fetched } = useData(
    () => Promise.all([
      supabase.from('agent_definitions').select('*').order('display_name'),
      supabase.from('skill_definitions').select('*').order('display_name'),
    ]).then(([a, s]) => ({
      agents: (a.data as AgentDef[]) || [],
      skills: (s.data as SkillDef[]) || [],
    })),
    [],
    { agents: [] as AgentDef[], skills: [] as SkillDef[] },
  )

  const agents = agentsLocal ?? fetched.agents
  const skills = fetched.skills
  const setAgents = (updater: AgentDef[] | ((prev: AgentDef[]) => AgentDef[])) => {
    setAgentsLocal(typeof updater === 'function' ? updater(agents) : updater)
  }

  function update(id: string, u: Partial<AgentDef>) {
    setAgents(prev => prev.map(a => a.id === id ? { ...a, ...u } : a))
  }

  async function save(agent: AgentDef) {
    setSaving(agent.id)
    const { id, ...rest } = agent
    await supabase.from('agent_definitions').update({ ...rest, updated_at: new Date().toISOString() }).eq('id', id)
    setSaving(null)
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        <Button variant={tab === 'agents' ? 'secondary' : 'ghost'} size="sm" className="h-6 text-[10px]" onClick={() => setTab('agents')}>Agentes</Button>
        <Button variant={tab === 'skills' ? 'secondary' : 'ghost'} size="sm" className="h-6 text-[10px]" onClick={() => setTab('skills')}>Skills</Button>
      </div>

      {tab === 'agents' && agents.map(agent => (
        <div key={agent.id} className="border border-border rounded-lg p-2 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${COLOR_DOT[agent.color] || 'bg-gray-500'}`} />
            <span className="text-[11px] font-medium">{agent.display_name}</span>
            <select value={agent.model} onChange={e => update(agent.id, { model: e.target.value })}
              className="ml-auto h-5 text-[9px] bg-background border border-border rounded px-1">
              {MODELS.map(m => <option key={m}>{m}</option>)}
            </select>
          </div>
          <div className="flex flex-wrap gap-0.5">
            {skills.map(s => {
              const on = agent.skills.includes(s.name)
              return (
                <button key={s.name} onClick={() => update(agent.id, {
                  skills: on ? agent.skills.filter(x => x !== s.name) : [...agent.skills, s.name]
                })} className={`text-[9px] px-1.5 py-0.5 rounded-full border ${on ? 'border-primary/30 text-primary bg-primary/10' : 'border-border text-muted-foreground/40'}`}>
                  {s.display_name}
                </button>
              )
            })}
          </div>
          <div className="flex justify-end">
            <Button size="sm" className="h-5 text-[9px] bg-emerald-600 hover:bg-emerald-500" onClick={() => save(agent)} disabled={saving === agent.id}>
              <SaveIcon className="w-2.5 h-2.5 mr-0.5" />{saving === agent.id ? '...' : 'Guardar'}
            </Button>
          </div>
        </div>
      ))}

      {tab === 'skills' && skills.map(skill => (
        <div key={skill.id} className="border border-border rounded-lg p-2">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-[11px] font-medium">{skill.display_name}</span>
            {skill.category && <Badge variant="secondary" className="text-[8px] h-3.5">{skill.category}</Badge>}
          </div>
          <div className="flex flex-wrap gap-0.5">
            {skill.mcp_tools.map(t => (
              <span key={t} className="text-[8px] px-1 py-0.5 rounded bg-accent font-mono text-muted-foreground/50">{t}</span>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
