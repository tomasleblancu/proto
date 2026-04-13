/**
 * Centralized frontend config. Every module that needs the gateway URL or
 * the internal secret should import from here — do NOT read
 * `import.meta.env.VITE_*` directly, so the default values stay in sync.
 */

/** Origin of the gateway. When empty, uses current browser origin (all-in-one deploy). */
const envGateway = (import.meta.env.VITE_GATEWAY_URL as string) || ''
const browserOrigin =
  typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8092'

export const GATEWAY_URL: string = envGateway || browserOrigin

export const INTERNAL_SECRET: string =
  (import.meta.env.VITE_INTERNAL_SECRET as string) || ''

/** WebSocket endpoint, derived from GATEWAY_URL. */
export const WS_URL: string = GATEWAY_URL.replace(/^http/, 'ws') + '/ws'
