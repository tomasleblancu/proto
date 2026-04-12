import { Card, CardContent } from '@tleblancureta/proto/web'
import { Badge } from '@tleblancureta/proto/web'
import { Button } from '@tleblancureta/proto/web'
import { Input } from '@tleblancureta/proto/web'
import { SaveIcon } from 'lucide-react'
import type { CostingDefault } from './AdminTypes'

interface Props {
  costingDefaults: CostingDefault[]
  saving: string | null
  onUpdate: (id: string, updates: Partial<CostingDefault>) => void
  onSave: (item: CostingDefault) => void
  onAdd: () => void
  onDelete: (id: string) => void
}

export default function AdminCosting({ costingDefaults, saving, onUpdate, onSave, onAdd, onDelete }: Props) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Valores de referencia para costeo preliminar. El agente los usa con <code className="text-[10px] bg-muted px-1 rounded">get_costing_defaults</code>.</p>
        <Button size="sm" className="h-7 text-xs" onClick={onAdd}>+ Nuevo valor</Button>
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
                        onChange={e => onUpdate(item.id, { label: e.target.value })}
                        className="h-7 text-sm font-medium w-44"
                      />
                      <Input
                        type="number"
                        value={item.value}
                        onChange={e => onUpdate(item.id, { value: Number(e.target.value) })}
                        className="h-7 text-sm font-mono w-24 text-right"
                        step="any"
                      />
                      <select
                        value={item.unit}
                        onChange={e => onUpdate(item.id, { unit: e.target.value })}
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
                        onChange={e => onUpdate(item.id, { qty_type: e.target.value })}
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
                          onChange={e => onUpdate(item.id, { minimum: Number(e.target.value) })}
                          className="h-7 text-xs font-mono w-20 text-right"
                          step="any"
                        />
                      </div>
                      <select
                        value={item.currency || 'USD'}
                        onChange={e => onUpdate(item.id, { currency: e.target.value })}
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
                        onChange={e => onUpdate(item.id, { notes: e.target.value })}
                        placeholder="Notas"
                        className="h-7 text-xs flex-1"
                      />
                      <select
                        value={item.category}
                        onChange={e => onUpdate(item.id, { category: e.target.value })}
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
                        onClick={() => onDelete(item.id)}
                      >
                        Eliminar
                      </Button>
                      <Button
                        size="sm"
                        className="h-7 text-xs bg-emerald-600 hover:bg-emerald-500"
                        onClick={() => onSave(item)}
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
  )
}
