import { useData, supabase, Card, CardContent, CardHeader } from '@proto/core-web'
import type { ShellContext } from '@proto/core-web'

interface Item {
  id: string
  name: string
  description: string | null
  created_at: string
}

export default function ItemsWidget({ companyId, refreshKey, onActivateEntity }: ShellContext) {
  const { data: items, loading } = useData<Item[]>(
    async () => {
      const { data } = await supabase
        .from('items')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(20)
      return data || []
    },
    [companyId, refreshKey],
    []
  )

  return (
    <div className="h-full overflow-auto p-3">
      {loading && <p className="text-sm text-muted-foreground">Loading...</p>}
      {items.length === 0 && !loading && (
        <p className="text-sm text-muted-foreground">No items yet.</p>
      )}
      <div className="space-y-2">
        {items.map(item => (
          <Card key={item.id} className="cursor-pointer hover:bg-accent/50 transition-colors"
            onClick={() => onActivateEntity?.({ type: 'item', id: item.id, label: item.name })}>
            <CardHeader className="p-3 pb-1">
              <p className="font-medium text-sm">{item.name}</p>
            </CardHeader>
            {item.description && (
              <CardContent className="p-3 pt-0">
                <p className="text-xs text-muted-foreground line-clamp-2">{item.description}</p>
              </CardContent>
            )}
          </Card>
        ))}
      </div>
    </div>
  )
}
