import { defineWidget, useData, supabase, Card, CardContent, CardHeader } from '@tleblancureta/proto/web'
import type { ShellContext } from '@tleblancureta/proto/web'

export default defineWidget({
  type: 'item-detail',
  title: 'Item Detail',
  icon: '🔍',
  category: 'cockpit',
  defaultSize: { w: 6, h: 4, minW: 3, minH: 3 },
  render: (_, ctx) => <ItemDetail {...ctx} />,
})

interface Item {
  id: string
  name: string
  description: string | null
  created_at: string
  updated_at: string
}

function ItemDetail({ activeEntity, refreshKey }: ShellContext) {
  const itemId = activeEntity?.type === 'item' ? activeEntity.id : null

  const { data: item, loading } = useData<Item | null>(
    async () => {
      if (!itemId) return null
      const { data } = await supabase.from('items').select('*').eq('id', itemId).single()
      return data
    },
    [itemId, refreshKey],
    null
  )

  if (!itemId) return <p className="p-4 text-sm text-muted-foreground">No item selected.</p>
  if (loading) return <p className="p-4 text-sm text-muted-foreground">Loading...</p>
  if (!item) return <p className="p-4 text-sm text-muted-foreground">Item not found.</p>

  return (
    <div className="p-4 space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{item.name}</h2>
        <p className="text-xs text-muted-foreground">ID: {item.id}</p>
      </div>
      {item.description && (
        <Card>
          <CardHeader className="p-3 pb-1">
            <p className="text-xs font-medium text-muted-foreground">Description</p>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <p className="text-sm">{item.description}</p>
          </CardContent>
        </Card>
      )}
      <div className="text-xs text-muted-foreground space-y-1">
        <p>Created: {new Date(item.created_at).toLocaleString()}</p>
        <p>Updated: {new Date(item.updated_at).toLocaleString()}</p>
      </div>
    </div>
  )
}
