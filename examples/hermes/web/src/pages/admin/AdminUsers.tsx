import { Card, CardContent } from '@tleblancureta/proto/web'
import { Badge } from '@tleblancureta/proto/web'
import type { CompanyUser } from './AdminTypes'

interface Props {
  users: CompanyUser[]
  onUpdateRole: (userRowId: string, role: string) => void
}

export default function AdminUsers({ users, onUpdateRole }: Props) {
  return (
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
                onChange={e => onUpdateRole(u.id, e.target.value)}
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
  )
}
