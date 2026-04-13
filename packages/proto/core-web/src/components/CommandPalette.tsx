import { useState, useEffect, useRef, useCallback } from 'react'
import { SearchIcon } from 'lucide-react'

export interface CommandItem {
  id: string
  label: string
  description?: string
  icon?: string
  category?: string
  action: () => void
}

interface CommandPaletteProps {
  items: CommandItem[]
  open: boolean
  onClose: () => void
}

export function CommandPalette({ items, open, onClose }: CommandPaletteProps) {
  const [search, setSearch] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      setSearch('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  const filtered = search.trim()
    ? items.filter(item => {
        const q = search.toLowerCase()
        return item.label.toLowerCase().includes(q) ||
          (item.description?.toLowerCase().includes(q)) ||
          (item.category?.toLowerCase().includes(q))
      })
    : items

  const grouped = filtered.reduce<Record<string, CommandItem[]>>((acc, item) => {
    const cat = item.category || 'General'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(item)
    return acc
  }, {})

  const flatFiltered = Object.values(grouped).flat()

  useEffect(() => {
    setSelectedIndex(0)
  }, [search])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex(i => Math.min(i + 1, flatFiltered.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex(i => Math.max(i - 1, 0))
        break
      case 'Enter':
        e.preventDefault()
        if (flatFiltered[selectedIndex]) {
          flatFiltered[selectedIndex].action()
          onClose()
        }
        break
      case 'Escape':
        onClose()
        break
    }
  }, [flatFiltered, selectedIndex, onClose])

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  if (!open) return null

  let globalIndex = 0

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md bg-background border border-border rounded-xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 border-b border-border">
          <SearchIcon className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Buscar..."
            className="flex-1 h-10 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="text-[10px] text-muted-foreground/50 bg-muted px-1.5 py-0.5 rounded">ESC</kbd>
        </div>

        <div ref={listRef} className="max-h-64 overflow-y-auto py-1">
          {flatFiltered.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-6">Sin resultados</p>
          )}
          {Object.entries(grouped).map(([category, categoryItems]) => (
            <div key={category}>
              <p className="px-3 py-1 text-[10px] uppercase tracking-wider text-muted-foreground/60">{category}</p>
              {categoryItems.map(item => {
                const idx = globalIndex++
                return (
                  <button
                    key={item.id}
                    data-index={idx}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors ${
                      idx === selectedIndex ? 'bg-primary/10 text-primary' : 'hover:bg-muted/50'
                    }`}
                    onClick={() => { item.action(); onClose() }}
                    onMouseEnter={() => setSelectedIndex(idx)}
                  >
                    {item.icon && <span className="text-sm shrink-0">{item.icon}</span>}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{item.label}</p>
                      {item.description && (
                        <p className="text-[10px] text-muted-foreground truncate">{item.description}</p>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
