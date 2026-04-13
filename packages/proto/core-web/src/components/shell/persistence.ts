import type { WidgetInstance, GridLayouts } from './types.js'

const PREFIX = 'proto-shell'

function storageKey(companyId?: string): string {
  return companyId ? `${PREFIX}:${companyId}` : PREFIX
}

interface ShellState {
  widgets: WidgetInstance[]
  layouts: GridLayouts
}

export function loadShellState(companyId?: string): ShellState | null {
  try {
    const raw = localStorage.getItem(storageKey(companyId))
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export function saveShellState(widgets: WidgetInstance[], layouts: GridLayouts, companyId?: string) {
  try {
    localStorage.setItem(storageKey(companyId), JSON.stringify({ widgets, layouts }))
  } catch {}
}

export function clearShellState(companyId?: string) {
  localStorage.removeItem(storageKey(companyId))
}
