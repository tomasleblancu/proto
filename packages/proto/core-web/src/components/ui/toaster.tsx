import { Toaster as Sonner } from 'sonner'

export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast: 'bg-background text-foreground border-border shadow-lg',
          title: 'text-sm font-medium',
          description: 'text-xs text-muted-foreground',
          actionButton: 'bg-primary text-primary-foreground text-xs',
          cancelButton: 'bg-muted text-muted-foreground text-xs',
        },
      }}
    />
  )
}
