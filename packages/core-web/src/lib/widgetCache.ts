/**
 * Tiny in-memory cache for cockpit widget data.
 *
 * Keyed by `${widgetName}:${entityId}`. Lives for the page session.
 *
 * Usage pattern in widgets:
 *   const [data, setData] = useState(() => cacheGet(key))
 *   useEffect(() => {
 *     fetch().then(d => { cacheSet(key, d); setData(d) })
 *   }, [id, refreshKey])
 *
 * If cached, the widget renders instantly with stale data, then silently
 * swaps to fresh data when the fetch resolves. No skeleton on re-visits.
 */

const store = new Map<string, unknown>()

export function cacheGet<T>(key: string): T | undefined {
  return store.get(key) as T | undefined
}

export function cacheSet<T>(key: string, value: T): void {
  store.set(key, value)
}

export function cacheClear(key?: string): void {
  if (key) store.delete(key)
  else store.clear()
}
