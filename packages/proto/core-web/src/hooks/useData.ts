import { useEffect, useRef, useState } from 'react'

/**
 * Minimal data-fetching hook. Replaces the `useEffect(() => fetch().then(setState), [deps])` pattern.
 * Handles stale closures via AbortController. Components should never useEffect for fetching.
 *
 * Stale-while-revalidate: `loading` is only true on the initial fetch. On subsequent
 * refetches (dep changes, e.g. refreshKey), previous data stays visible and swaps in
 * silently when the new fetch resolves. Use `isValidating` for a subtle indicator.
 */
export function useData<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
  initial: T,
): { data: T; loading: boolean; isValidating: boolean; error: Error | null } {
  const [data, setData] = useState<T>(initial)
  const [loading, setLoading] = useState(true)
  const [isValidating, setIsValidating] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const hasLoadedRef = useRef(false)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const controller = new AbortController()
    if (hasLoadedRef.current) {
      setIsValidating(true)
    } else {
      setLoading(true)
    }
    setError(null)
    fetcher(controller.signal)
      .then(result => {
        if (!controller.signal.aborted) {
          setData(result)
          setLoading(false)
          setIsValidating(false)
          hasLoadedRef.current = true
        }
      })
      .catch(err => {
        if (!controller.signal.aborted) {
          setError(err)
          setLoading(false)
          setIsValidating(false)
        }
      })
    return () => controller.abort()
  }, deps)

  return { data, loading, isValidating, error }
}
