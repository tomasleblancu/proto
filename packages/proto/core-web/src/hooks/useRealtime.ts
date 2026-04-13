import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase.js'

type RealtimeEvent = 'INSERT' | 'UPDATE' | 'DELETE' | '*'

interface UseRealtimeOptions {
  table: string
  filter?: string
  event?: RealtimeEvent
  enabled?: boolean
}

export function useRealtime<T extends Record<string, unknown>>(
  fetcher: () => Promise<T[]>,
  deps: unknown[],
  options: UseRealtimeOptions,
): { data: T[]; loading: boolean } {
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      const result = await fetcher()
      if (!cancelled) {
        setData(result)
        setLoading(false)
      }
    }

    load()

    if (options.enabled !== false) {
      const channelName = `realtime-${options.table}-${Math.random().toString(36).slice(2, 8)}`
      const channel = supabase
        .channel(channelName)
        .on(
          'postgres_changes' as any,
          {
            event: options.event || '*',
            schema: 'public',
            table: options.table,
            filter: options.filter,
          },
          () => {
            if (!cancelled) load()
          },
        )
        .subscribe()

      channelRef.current = channel
    }

    return () => {
      cancelled = true
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, deps)

  return { data, loading }
}
