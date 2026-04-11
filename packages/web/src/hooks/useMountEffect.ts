import { useEffect } from 'react'

/**
 * Run an effect exactly once on mount. The only sanctioned direct useEffect wrapper.
 * Components must never import useEffect directly — use this or another custom hook.
 */
export function useMountEffect(effect: () => void | (() => void)) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(effect, [])
}
