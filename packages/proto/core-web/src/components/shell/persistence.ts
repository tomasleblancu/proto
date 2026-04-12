import type { WidgetInstance } from './types'

const KEY = 'proto-shell'

export function loadShellState(): { widgets: WidgetInstance[]; layouts: any } | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export function saveShellState(widgets: WidgetInstance[], layouts: any) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ widgets, layouts }))
  } catch {}
}

export function clearShellState() {
  localStorage.removeItem(KEY)
}
