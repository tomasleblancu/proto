import { useRef, useState } from 'react'
import { Button } from '../ui/button.js'
import { Textarea } from '../ui/textarea.js'

export interface Attachment {
  file: File
  preview: string
}

interface Props {
  onSend: (message: string, attachments?: Attachment[]) => void
  disabled?: boolean
  placeholder?: string
  streaming?: boolean
  onCancel?: () => void
  onRegisterAddFiles?: (fn: (files: File[]) => void) => void
}

export function ChatInput({ onSend, disabled, placeholder, streaming, onCancel, onRegisterAddFiles }: Props) {
  const [value, setValue] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const ref = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const prevDisabledRef = useRef<boolean | undefined>(undefined)
  if (prevDisabledRef.current !== disabled) {
    if (!disabled) queueMicrotask(() => ref.current?.focus())
    prevDisabledRef.current = disabled
  }

  function addFile(file: File) {
    if (file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = () => setAttachments(prev => [...prev, { file, preview: reader.result as string }])
      reader.readAsDataURL(file)
    } else {
      setAttachments(prev => [...prev, { file, preview: '' }])
    }
  }

  function addFiles(files: File[]) {
    for (const file of files) {
      if (!file.type.startsWith('image/') && file.type !== 'application/pdf') continue
      addFile(file)
    }
  }

  const registeredAddFiles = useRef(false)
  if (onRegisterAddFiles && !registeredAddFiles.current) {
    registeredAddFiles.current = true
    queueMicrotask(() => onRegisterAddFiles(addFiles))
  }

  function handleSubmit() {
    const msg = value.trim()
    if ((!msg && attachments.length === 0) || disabled) return
    onSend(msg || '(attached file)', attachments.length > 0 ? attachments : undefined)
    setValue('')
    setAttachments([])
    if (ref.current) ref.current.style.height = 'auto'
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  function handleInput() {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    for (const file of files) {
      if (!file.type.startsWith('image/') && file.type !== 'application/pdf') continue
      addFile(file)
    }
    e.target.value = ''
  }

  function handlePaste(e: React.ClipboardEvent) {
    for (const item of Array.from(e.clipboardData.items)) {
      if (item.type.startsWith('image/') || item.type === 'application/pdf') {
        e.preventDefault()
        const file = item.getAsFile()
        if (file) addFile(file)
      }
    }
  }

  return (
    <div>
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2 px-1">
          {attachments.map((att, i) => {
            const isPdf = att.file.type === 'application/pdf'
            return (
              <div key={i} className="relative group">
                {isPdf ? (
                  <div className="w-16 h-16 rounded-lg border border-border bg-card flex flex-col items-center justify-center p-1 gap-0.5">
                    <svg className="w-5 h-5 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                    </svg>
                    <span className="text-[8px] text-muted-foreground/70 truncate w-full text-center">{att.file.name}</span>
                  </div>
                ) : (
                  <img src={att.preview} alt="" className="w-16 h-16 object-cover rounded-lg border border-border" />
                )}
                <button
                  onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-destructive rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12"/>
                  </svg>
                </button>
              </div>
            )
          })}
        </div>
      )}

      <div className="flex items-end gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => fileRef.current?.click()}
          disabled={disabled}
          className="flex-shrink-0 text-muted-foreground hover:text-foreground"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
          </svg>
        </Button>
        <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={handleFiles} />

        <Textarea
          ref={ref}
          value={value}
          onChange={e => { setValue(e.target.value); handleInput() }}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={placeholder || 'Type a message...'}
          disabled={disabled}
          rows={1}
          className="flex-1 min-h-[36px] max-h-[120px] resize-none bg-card border-border py-2"
        />
        {streaming ? (
          <Button
            size="icon"
            variant="destructive"
            onClick={onCancel}
            className="flex-shrink-0"
            aria-label="Stop"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="1" />
            </svg>
          </Button>
        ) : (
          <Button
            size="icon"
            onClick={handleSubmit}
            disabled={disabled || (!value.trim() && attachments.length === 0)}
            className="flex-shrink-0"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </Button>
        )}
      </div>
    </div>
  )
}
