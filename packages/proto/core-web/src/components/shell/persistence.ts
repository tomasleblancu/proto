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

const COCKPIT_PREFIX = 'proto-cockpit-layout'

function cockpitKey(companyId: string | undefined, entityType: string): string {
  return companyId ? `${COCKPIT_PREFIX}:${companyId}:${entityType}` : `${COCKPIT_PREFIX}:${entityType}`
}

export function loadCockpitLayout(entityType: string, companyId?: string): GridLayouts | null {
  try {
    const raw = localStorage.getItem(cockpitKey(companyId, entityType))
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export function saveCockpitLayout(entityType: string, layouts: GridLayouts, companyId?: string) {
  try {
    localStorage.setItem(cockpitKey(companyId, entityType), JSON.stringify(layouts))
  } catch {}
}

export function clearCockpitLayout(entityType: string, companyId?: string) {
  localStorage.removeItem(cockpitKey(companyId, entityType))
}
