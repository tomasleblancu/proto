import { useEffect, useRef, useState } from 'react'

/**
 * Minimal data-fetching hook. Replaces the `useEffect(() => fetch().then(setState), [deps])` pattern.
 * Handles stale closures via an abort flag. Components should never useEffect for fetching.
 */
export function useData<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
  initial: T,
): { data: T; loading: boolean; error: Error | null } {
  const [data, setData] = useState<T>(initial)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const mountedRef = useRef(true)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    fetcher(controller.signal)
      .then(result => {
        if (!controller.signal.aborted) {
          setData(result)
          setLoading(false)
        }
      })
      .catch(err => {
        if (!controller.signal.aborted) {
          setError(err)
          setLoading(false)
        }
      })
    return () => controller.abort()
  }, deps)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  return { data, loading, error }
}
