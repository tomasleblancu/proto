import { useData } from '../../hooks/useData.js'
import { GATEWAY_URL, INTERNAL_SECRET } from '../../lib/config.js'
import {
  WrenchIcon, BoxIcon, GitBranchIcon, BookOpenIcon,
} from 'lucide-react'

interface McpMeta {
  tools: { name: string; description: string }[]
  entities: { name: string; table: string }[]
  workflows: { name: string; entityTable: string; phases: string[] }[]
  skills: { name: string; description: string | null; mcp_tools: string[] }[]
}

export function SystemTab() {
  const { data: meta } = useData<McpMeta | null>(async () => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (INTERNAL_SECRET) headers['X-Internal-Secret'] = INTERNAL_SECRET
      const res = await fetch(`${GATEWAY_URL}/admin/meta`, { headers })
      if (!res.ok) return null
      return res.json()
    } catch {
      return null
    }
  }, [], null)

  if (!meta) {
    return (
      <div>
        <h2 className="text-lg font-semibold mb-4">Sistema</h2>
        <p className="text-muted-foreground text-sm">
          No se pudo conectar al gateway. Asegurate de que esta corriendo y que el endpoint <code>/admin/meta</code> esta disponible.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Tools */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <WrenchIcon className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Tools</h2>
          <span className="text-xs px-2 py-0.5 bg-muted rounded-full text-muted-foreground">{meta.tools.length}</span>
        </div>
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Nombre</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Descripcion</th>
              </tr>
            </thead>
            <tbody>
              {meta.tools.map(t => (
                <tr key={t.name} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                  <td className="px-4 py-2 font-mono text-xs">{t.name}</td>
                  <td className="px-4 py-2 text-muted-foreground">{t.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Entities */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <BoxIcon className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Entities</h2>
          <span className="text-xs px-2 py-0.5 bg-muted rounded-full text-muted-foreground">{meta.entities.length}</span>
        </div>
        {meta.entities.length > 0 ? (
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Nombre</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Tabla</th>
                </tr>
              </thead>
              <tbody>
                {meta.entities.map((e: any) => (
                  <tr key={e.name} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                    <td className="px-4 py-2 font-medium">{e.name}</td>
                    <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{e.table}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No hay entities definidas</p>
        )}
      </section>

      {/* Workflows */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <GitBranchIcon className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Workflows</h2>
          <span className="text-xs px-2 py-0.5 bg-muted rounded-full text-muted-foreground">{meta.workflows.length}</span>
        </div>
        {meta.workflows.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {meta.workflows.map((w: any) => (
              <div key={w.name} className="border border-border rounded-lg p-4">
                <div className="font-medium text-sm mb-1">{w.name}</div>
                <div className="text-xs text-muted-foreground mb-2">Tabla: <code>{w.entityTable}</code></div>
                <div className="flex flex-wrap gap-1">
                  {w.phases.map((p: string, i: number) => (
                    <span key={p} className="text-xs px-2 py-0.5 bg-muted rounded-full text-muted-foreground flex items-center gap-1">
                      {i > 0 && <span className="text-muted-foreground/40">&rarr;</span>}
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No hay workflows definidos</p>
        )}
      </section>

      {/* Skills */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <BookOpenIcon className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Skills</h2>
          <span className="text-xs px-2 py-0.5 bg-muted rounded-full text-muted-foreground">{meta.skills.length}</span>
        </div>
        {meta.skills.length > 0 ? (
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Nombre</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Descripcion</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Tools</th>
                </tr>
              </thead>
              <tbody>
                {meta.skills.map((s: any) => (
                  <tr key={s.name} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                    <td className="px-4 py-2 font-medium">{s.name}</td>
                    <td className="px-4 py-2 text-muted-foreground">{s.description || '—'}</td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap gap-1">
                        {s.mcp_tools.map((t: string) => (
                          <span key={t} className="text-xs px-1.5 py-0.5 bg-muted rounded text-muted-foreground font-mono">{t}</span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No hay skills cargados</p>
        )}
      </section>
    </div>
  )
}
