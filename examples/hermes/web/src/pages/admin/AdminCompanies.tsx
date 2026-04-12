import { Card, CardContent } from '@tleblancureta/proto/web'
import { Badge } from '@tleblancureta/proto/web'
import { Button } from '@tleblancureta/proto/web'
import { Input } from '@tleblancureta/proto/web'
import { SaveIcon } from 'lucide-react'
import type { Company } from './AdminTypes'

interface Props {
  companies: Company[]
  saving: string | null
  onUpdate: (id: string, updates: Partial<Company>) => void
  onSave: (company: Company) => void
}

export default function AdminCompanies({ companies, saving, onUpdate, onSave }: Props) {
  return (
    <div className="space-y-3">
      {companies.map(company => (
        <Card key={company.id}>
          <CardContent className="py-3 space-y-2">
            <div className="flex items-center gap-2">
              <Input
                value={company.name}
                onChange={e => onUpdate(company.id, { name: e.target.value })}
                className="h-7 text-sm font-medium flex-1"
              />
              <Input
                value={company.rut || ''}
                onChange={e => onUpdate(company.id, { rut: e.target.value })}
                placeholder="RUT"
                className="h-7 text-xs w-32"
              />
            </div>
            <div className="flex items-center gap-2">
              <Input
                value={company.contact_email || ''}
                onChange={e => onUpdate(company.id, { contact_email: e.target.value })}
                placeholder="Email de contacto"
                className="h-7 text-xs flex-1"
              />
              <Input
                value={company.contact_phone || ''}
                onChange={e => onUpdate(company.id, { contact_phone: e.target.value })}
                placeholder="Telefono"
                className="h-7 text-xs w-40"
              />
            </div>
            <div className="flex items-center justify-between">
              <Badge variant="outline" className="text-[10px] font-mono">{company.id.slice(0, 8)}</Badge>
              <Button
                size="sm"
                className="h-7 text-xs bg-emerald-600 hover:bg-emerald-500"
                onClick={() => onSave(company)}
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
  )
}
