/**
 * @proto/core-web — framework library for proto SPAs.
 *
 * Apps import Shell, defineWidget, hooks, lib helpers, and shadcn primitives
 * from this barrel. Nothing in here is Hermes-specific.
 */

// Framework components
export { default as Shell, type CockpitDefinition } from './components/Shell.js'
export { CommandPalette, type CommandItem } from './components/CommandPalette.js'
export { ProtoApp, type ProtoAppProps } from './ProtoApp.js'
export { AdminPanel } from './components/admin/AdminPanel.js'
export { LoginForm } from './components/LoginForm.js'
export { Toaster } from './components/ui/toaster.js'
export { toast } from 'sonner'

// Extension API
export {
  defineWidget,
  buildWidgetRegistry,
  type WidgetDefinition,
  type WidgetRegistry,
  type WidgetCategory,
  type WidgetSize,
  type ShellContext,
} from './lib/define-widget.js'
export type { ActiveEntity, GridLayouts, LayoutItem, WidgetInstance, WidgetType } from './components/shell/types.js'

// Hooks
export { useAuth } from './hooks/useAuth.js'
export { useCommandPalette } from './hooks/useCommandPalette.js'
export { useData } from './hooks/useData.js'
export { useMountEffect } from './hooks/useMountEffect.js'
export { useRealtime } from './hooks/useRealtime.js'
export { useTheme, type Theme } from './hooks/useTheme.js'

// Lib
export * from './lib/api.js'
export * from './lib/config.js'
export { supabase } from './lib/supabase.js'
export { cn } from './lib/utils.js'
export * from './lib/drag.js'
export * from './lib/widgetCache.js'

// Agent runtime (render_ui)
export { Generative } from './components/widgets/agent/Generative.js'

// UI primitives (shadcn)
export { Avatar, AvatarFallback } from './components/ui/avatar.js'
export { Badge } from './components/ui/badge.js'
export { Button } from './components/ui/button.js'
export { Card, CardContent, CardFooter, CardHeader } from './components/ui/card.js'
export { InlineEdit } from './components/ui/inline-edit.js'
export { Input } from './components/ui/input.js'
export { ScrollArea } from './components/ui/scroll-area.js'
export { Separator } from './components/ui/separator.js'
export { ShellDialog } from './components/ui/shell-dialog.js'
export { Skeleton } from './components/ui/skeleton.js'
export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './components/ui/table.js'
export { Textarea } from './components/ui/textarea.js'

// Composite components
export { DataTable, type Column, type DataTableProps } from './components/DataTable.js'
