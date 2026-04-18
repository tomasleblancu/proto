import type { ComponentType } from 'react'
import type { WidgetDefinition, ConfigPanelProps } from './define-widget.js'

// loadWidgets — merge widget index + config globs into WidgetDefinition[].
//
// Widget directories follow this structure:
//   widgets/
//     orders/
//       index.tsx      # defineWidget + render (required)
//       config.tsx     # configPanel for admin panel (optional, auto-injected)
//       types.ts       # TypeScript types (optional, no special handling)
//
// Usage in App.tsx:
//   import { loadWidgets } from '@tleblancureta/proto/web'
//   const WIDGETS = loadWidgets(
//     import.meta.glob('./widgets/*/index.tsx', { eager: true }),
//     import.meta.glob('./widgets/*/config.tsx', { eager: true }),
//   )
export function loadWidgets(
  indexMods: Record<string, { default?: WidgetDefinition }>,
  configMods: Record<string, { default?: ComponentType<ConfigPanelProps> }> = {},
): WidgetDefinition[] {
  return Object.entries(indexMods)
    .map(([path, mod]) => {
      const def = mod.default
      if (!def) return null
      // Match config by directory: './widgets/orders/index.tsx' → './widgets/orders/config.tsx'
      const dir = path.replace('/index.tsx', '')
      const configMod = configMods[`${dir}/config.tsx`]
      if (configMod?.default && !def.configPanel) {
        return { ...def, configPanel: configMod.default }
      }
      return def
    })
    .filter((d): d is WidgetDefinition => !!d)
}
