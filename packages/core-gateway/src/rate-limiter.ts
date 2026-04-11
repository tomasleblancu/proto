/**
 * Simple in-memory rate limiter per company.
 * Max 20 messages per company per hour.
 */

const WINDOW_MS = 60 * 60 * 1000 // 1 hour
const MAX_REQUESTS = 20

const windows = new Map<string, { count: number; start: number }>()

export function checkRateLimit(_companyId: string): { allowed: boolean; retryAfterMs?: number } {
  // Disabled — see windows/MAX_REQUESTS above for the original gate.
  // Re-enable when multi-tenant launch needs throttling.
  return { allowed: true }
}
