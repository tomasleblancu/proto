import { useState, useMemo } from 'react'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './ui/table.js'
import { Input } from './ui/input.js'
import { Button } from './ui/button.js'
import { ChevronUpIcon, ChevronDownIcon, ChevronsUpDownIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'

export interface Column<T> {
  key: string
  header: string
  render?: (row: T) => React.ReactNode
  sortable?: boolean
  searchable?: boolean
}

export interface DataTableProps<T> {
  data: T[]
  columns: Column<T>[]
  pageSize?: number
  searchable?: boolean
  onRowClick?: (row: T) => void
  emptyMessage?: string
}

export function DataTable<T extends Record<string, unknown>>({
  data,
  columns,
  pageSize = 10,
  searchable = true,
  onRowClick,
  emptyMessage = 'Sin datos',
}: DataTableProps<T>) {
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(0)

  const searchableKeys = columns.filter(c => c.searchable !== false).map(c => c.key)

  const filtered = useMemo(() => {
    if (!search.trim()) return data
    const q = search.toLowerCase()
    return data.filter(row =>
      searchableKeys.some(key => {
        const val = row[key]
        return val != null && String(val).toLowerCase().includes(q)
      })
    )
  }, [data, search, searchableKeys])

  const sorted = useMemo(() => {
    if (!sortKey) return filtered
    return [...filtered].sort((a, b) => {
      const aVal = a[sortKey]
      const bVal = b[sortKey]
      if (aVal == null && bVal == null) return 0
      if (aVal == null) return 1
      if (bVal == null) return -1
      const cmp = String(aVal).localeCompare(String(bVal), undefined, { numeric: true })
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [filtered, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const clampedPage = Math.min(page, totalPages - 1)
  const paged = sorted.slice(clampedPage * pageSize, (clampedPage + 1) * pageSize)

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  function SortIcon({ col }: { col: string }) {
    if (sortKey !== col) return <ChevronsUpDownIcon className="w-3 h-3 ml-1 text-muted-foreground/40" />
    return sortDir === 'asc'
      ? <ChevronUpIcon className="w-3 h-3 ml-1" />
      : <ChevronDownIcon className="w-3 h-3 ml-1" />
  }

  return (
    <div className="space-y-2">
      {searchable && (
        <Input
          placeholder="Buscar..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0) }}
          className="h-7 text-xs max-w-xs"
        />
      )}

      <Table>
        <TableHeader>
          <TableRow>
            {columns.map(col => (
              <TableHead key={col.key}>
                {col.sortable !== false ? (
                  <button
                    className="flex items-center hover:text-foreground transition-colors"
                    onClick={() => toggleSort(col.key)}
                  >
                    {col.header}
                    <SortIcon col={col.key} />
                  </button>
                ) : (
                  col.header
                )}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {paged.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="text-center text-muted-foreground py-8">
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            paged.map((row, i) => (
              <TableRow
                key={(row as any).id || i}
                className={onRowClick ? 'cursor-pointer' : ''}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map(col => (
                  <TableCell key={col.key}>
                    {col.render ? col.render(row) : String(row[col.key] ?? '')}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{sorted.length} resultados</span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost" size="sm" className="h-6 w-6 p-0"
              disabled={clampedPage === 0}
              onClick={() => setPage(p => p - 1)}
            >
              <ChevronLeftIcon className="w-3.5 h-3.5" />
            </Button>
            <span className="px-2">{clampedPage + 1} / {totalPages}</span>
            <Button
              variant="ghost" size="sm" className="h-6 w-6 p-0"
              disabled={clampedPage >= totalPages - 1}
              onClick={() => setPage(p => p + 1)}
            >
              <ChevronRightIcon className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
