import { useQuery, keepPreviousData } from '@tanstack/react-query'

/**
 * Data-fetching hook backed by React Query.
 *
 * `name` is the stable query name — used as the first segment of the queryKey,
 * enabling targeted invalidation via `queryClient.invalidateQueries({ queryKey: [name] })`.
 * `deps` are the dynamic dependencies (e.g. `[companyId, refreshKey]`).
 *
 * Gains over a plain useEffect fetch:
 *   - Deduplication: concurrent widgets with the same name+deps share one request
 *   - Cache: navigating away and back serves cached data instantly
 *   - Stale-while-revalidate: previous data stays visible while refetching
 */
export function useData<T>(
  name: string,
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
  initial: T,
): { data: T; loading: boolean; isValidating: boolean; error: Error | null } {
  const query = useQuery<T, Error>({
    queryKey: [name, ...deps],
    queryFn: ({ signal }) => fetcher(signal),
    placeholderData: keepPreviousData,
    staleTime: 0,
  })

  return {
    data: query.data ?? initial,
    loading: query.isLoading,
    isValidating: query.isFetching && !query.isLoading,
    error: query.error,
  }
}
