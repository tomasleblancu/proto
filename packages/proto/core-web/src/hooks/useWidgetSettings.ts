import { useState, useCallback } from 'react'
import { useData } from './useData.js'
import { supabase } from '../lib/supabase.js'

export interface UseWidgetSettingsReturn<T> {
  settings: T
  loading: boolean
  error: Error | null
  saveSettings: (patch: Partial<T>) => Promise<void>
}

/**
 * Read and write per-widget, per-company settings stored in `widget_settings`.
 * Merges DB values over `defaults` so callers always get a complete typed object.
 */
export function useWidgetSettings<T extends Record<string, unknown>>(
  widgetType: string,
  companyId: string,
  defaults: T,
): UseWidgetSettingsReturn<T> {
  const [optimistic, setOptimistic] = useState<Partial<T> | null>(null)

  const { data: dbSettings, loading, error } = useData<Partial<T>>(
    'widget-settings',
    async () => {
      const { data } = await supabase
        .from('widget_settings')
        .select('settings')
        .eq('company_id', companyId)
        .eq('widget_type', widgetType)
        .maybeSingle()
      return (data?.settings as Partial<T>) || {}
    },
    [companyId, widgetType],
    {},
  )

  const merged: T = { ...defaults, ...dbSettings, ...optimistic }

  const saveSettings = useCallback(async (patch: Partial<T>) => {
    const next = { ...dbSettings, ...optimistic, ...patch }
    setOptimistic(prev => ({ ...prev, ...patch }))

    const { error: upsertError } = await supabase
      .from('widget_settings')
      .upsert(
        { company_id: companyId, widget_type: widgetType, settings: next, updated_at: new Date().toISOString() },
        { onConflict: 'company_id,widget_type' },
      )

    if (upsertError) {
      setOptimistic(null)
      throw upsertError
    }
  }, [companyId, widgetType, dbSettings, optimistic])

  return { settings: merged, loading, error, saveSettings }
}
