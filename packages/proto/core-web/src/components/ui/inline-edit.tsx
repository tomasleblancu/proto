import { useCallback, useRef, useState } from 'react'
import { Pencil, Check, X } from 'lucide-react'

interface InlineEditProps {
  value: string | null | undefined
  onSave: (next: string) => Promise<void> | void
  placeholder?: string
  className?: string
  inputClassName?: string
  /** Render the display value when not editing. Defaults to plain text. */
  display?: (value: string) => React.ReactNode
  /** Allow empty string to clear the field. Defaults to true. */
  allowEmpty?: boolean
  /** Input type (text, date, number). Defaults to text. */
  type?: 'text' | 'date' | 'number'
}

/**
 * Hover to reveal a pencil icon, click to edit inline. Enter or check icon
 * saves, Escape or X discards. Keeps display markup flexible via `display`.
 */
export function InlineEdit({
  value,
  onSave,
  placeholder = '—',
  className = '',
  inputClassName = '',
  display,
  allowEmpty = true,
  type = 'text',
}: InlineEditProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Sync draft when value changes externally while not editing
  const prevValueRef = useRef(value)
  if (prevValueRef.current !== value) {
    prevValueRef.current = value
    if (!editing) setDraft(value ?? '')
  }

  // Callback ref: auto-focus and select when the input mounts (editing starts)
  const inputCallbackRef = useCallback((node: HTMLInputElement | null) => {
    (inputRef as React.MutableRefObject<HTMLInputElement | null>).current = node
    if (node) {
      node.focus()
      node.select()
    }
  }, [])

  const commit = async () => {
    const next = draft.trim()
    if (!allowEmpty && next === '') { setEditing(false); return }
    if (next === (value ?? '')) { setEditing(false); return }
    try {
      setSaving(true)
      await onSave(next)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  const cancel = () => {
    setDraft(value ?? '')
    setEditing(false)
  }

  if (editing) {
    return (
      <span className={`inline-flex items-center gap-1 ${className}`}>
        <input
          ref={inputCallbackRef}
          type={type}
          value={draft}
          disabled={saving}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') cancel()
          }}
          onBlur={commit}
          className={`bg-background border border-primary/50 rounded px-1.5 py-0.5 outline-none focus:border-primary ${inputClassName}`}
        />
        <button
          onMouseDown={(e) => { e.preventDefault(); commit() }}
          className="text-emerald-600 hover:text-emerald-500 shrink-0"
          disabled={saving}
          aria-label="Guardar"
        >
          <Check className="h-3 w-3" />
        </button>
        <button
          onMouseDown={(e) => { e.preventDefault(); cancel() }}
          className="text-muted-foreground hover:text-foreground shrink-0"
          disabled={saving}
          aria-label="Cancelar"
        >
          <X className="h-3 w-3" />
        </button>
      </span>
    )
  }

  const shown = value && value.trim() !== '' ? value : placeholder
  return (
    <span
      className={`group inline-flex items-center gap-1 cursor-text ${className}`}
      onClick={() => setEditing(true)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') setEditing(true) }}
    >
      <span className="truncate">{display && value ? display(value) : shown}</span>
      <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-60 transition-opacity shrink-0" />
    </span>
  )
}
