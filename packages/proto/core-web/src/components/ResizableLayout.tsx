import { useState, useCallback, useRef, type ReactNode } from 'react'
import { GripVerticalIcon } from 'lucide-react'

interface Props {
  chatPanel: ReactNode
  shellPanel: ReactNode
  defaultWidth?: number
  minWidth?: number
  maxWidth?: number
}

export function ResizableLayout({
  chatPanel,
  shellPanel,
  defaultWidth = 380,
  minWidth = 280,
  maxWidth = 600,
}: Props) {
  const [width, setWidth] = useState(() => {
    const saved = localStorage.getItem('proto:chat-width')
    return saved ? Math.max(minWidth, Math.min(maxWidth, parseInt(saved, 10))) : defaultWidth
  })
  const dragging = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(0)

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    startX.current = e.clientX
    startWidth.current = width

    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const delta = e.clientX - startX.current
      const newWidth = Math.max(minWidth, Math.min(maxWidth, startWidth.current + delta))
      setWidth(newWidth)
    }

    const onMouseUp = () => {
      dragging.current = false
      localStorage.setItem('proto:chat-width', String(width))
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [width, minWidth, maxWidth])

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Chat panel */}
      <div className="flex flex-col bg-background shrink-0" style={{ width }}>
        {chatPanel}
      </div>

      {/* Resize handle */}
      <div
        onMouseDown={onMouseDown}
        className="w-1 bg-border hover:bg-primary/40 active:bg-primary/60 cursor-col-resize flex items-center justify-center transition-colors group relative shrink-0"
      >
        <div className="absolute inset-y-0 -left-1 -right-1" />
        <GripVerticalIcon className="w-3 h-3 text-muted-foreground/30 group-hover:text-primary/60 transition-colors" />
      </div>

      {/* Shell panel */}
      <div className="flex-1 min-w-0">
        {shellPanel}
      </div>
    </div>
  )
}
