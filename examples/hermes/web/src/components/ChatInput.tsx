import { useRef, useState } from 'react'
import { Button } from 'proto/web'
import { Textarea } from 'proto/web'
import { PaperclipIcon, SendIcon, XIcon, FileTextIcon } from 'lucide-react'

export interface Attachment {
  file: File
  preview: string
}

interface Props {
  onSend: (message: string, attachments?: Attachment[]) => void
  disabled?: boolean
  placeholder?: string
  onRegisterAddFiles?: (fn: (files: File[]) => void) => void
}

export default function ChatInput({ onSend, disabled, placeholder, onRegisterAddFiles }: Props) {
  const [value, setValue] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const ref = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Focus textarea on mount if not disabled, and on disabled->enabled transitions
  const prevDisabledRef = useRef<boolean | undefined>(undefined)
  if (prevDisabledRef.current !== disabled) {
    if (!disabled) queueMicrotask(() => ref.current?.focus())
    prevDisabledRef.current = disabled
  }

  function handleSubmit() {
    const msg = value.trim()
    if ((!msg && attachments.length === 0) || disabled) return
    onSend(msg || '(archivo adjunto)', attachments.length > 0 ? attachments : undefined)
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

  function addFile(file: File) {
    const isImage = file.type.startsWith('image/')
    if (isImage) {
      const reader = new FileReader()
      reader.onload = () => setAttachments(prev => [...prev, { file, preview: reader.result as string }])
      reader.readAsDataURL(file)
    } else {
      // PDFs y otros: sin preview de imagen
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
        if (!file) continue
        addFile(file)
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
                    <FileTextIcon className="w-5 h-5 text-muted-foreground" />
                    <span className="text-[8px] text-muted-foreground/70 truncate w-full text-center">{att.file.name}</span>
                  </div>
                ) : (
                  <img src={att.preview} alt="" className="w-16 h-16 object-cover rounded-lg border border-border" />
                )}
                <button
                  onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-destructive rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <XIcon className="w-3 h-3 text-white" />
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
          <PaperclipIcon className="w-5 h-5" />
        </Button>
        <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={handleFiles} />

        <Textarea
          ref={ref}
          value={value}
          onChange={e => { setValue(e.target.value); handleInput() }}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={placeholder || 'Escribe un mensaje...'}
          disabled={disabled}
          rows={1}
          className="flex-1 min-h-[36px] max-h-[120px] resize-none bg-card border-border py-2"
        />

        <Button
          size="icon"
          onClick={handleSubmit}
          disabled={disabled || (!value.trim() && attachments.length === 0)}
          className="flex-shrink-0 bg-emerald-600 hover:bg-emerald-500 text-white"
        >
          <SendIcon className="w-4 h-4" />
        </Button>
      </div>
    </div>
  )
}
