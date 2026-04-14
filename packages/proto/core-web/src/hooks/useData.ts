import { useQuery, keepPreviousData } from '@tanstack/react-query'

/**
 * Data-fetching hook backed by React Query.
 *
 * Same API as before — drop-in replacement. Gains:
 *   - Deduplication: concurrent widgets with the same deps share one request
 *   - Cache: navigating away and back serves cached data instantly
 *   - Stale-while-revalidate: previous data stays visible while refetching
 *
 * `deps` maps to the React Query `queryKey`. Components typically pass
 * `[companyId, refreshKey]` so a `shell_refresh` event (which increments
 * `refreshKey`) triggers a fresh fetch automatically.
 */
export function useData<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
  initial: T,
): { data: T; loading: boolean; isValidating: boolean; error: Error | null } {
  const query = useQuery<T, Error>({
    queryKey: deps as unknown[],
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
