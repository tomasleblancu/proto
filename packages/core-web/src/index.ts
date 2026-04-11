/**
 * @proto/core-web — framework library for proto SPAs.
 *
 * Apps import Shell, defineWidget, hooks, lib helpers, and shadcn primitives
 * from this barrel. Nothing in here is Hermes-specific.
 */

// Framework components
export { default as Shell, type CockpitDefinition } from './components/Shell'

// Extension API
export {
  defineWidget,
  buildWidgetRegistry,
  type WidgetDefinition,
  type WidgetRegistry,
  type WidgetCategory,
  type WidgetSize,
  type ShellContext,
} from './lib/define-widget'
export type { ActiveEntity, WidgetInstance, WidgetType } from './components/shell/types'

// Hooks
export { useAuth } from './hooks/useAuth'
export { useData } from './hooks/useData'
export { useMountEffect } from './hooks/useMountEffect'
export { useTheme, type Theme } from './hooks/useTheme'

// Lib
export * from './lib/api'
export * from './lib/config'
export { supabase } from './lib/supabase'
export { cn } from './lib/utils'
export * from './lib/drag'
export * from './lib/widgetCache'

// Agent runtime (render_ui)
export { Generative } from './components/widgets/agent/Generative'

// UI primitives (shadcn)
export { Avatar, AvatarFallback } from './components/ui/avatar'
export { Badge } from './components/ui/badge'
export { Button } from './components/ui/button'
export { Card, CardContent, CardFooter, CardHeader } from './components/ui/card'
export { InlineEdit } from './components/ui/inline-edit'
export { Input } from './components/ui/input'
export { ScrollArea } from './components/ui/scroll-area'
export { Separator } from './components/ui/separator'
export { ShellDialog } from './components/ui/shell-dialog'
export { Skeleton } from './components/ui/skeleton'
export { Textarea } from './components/ui/textarea'
