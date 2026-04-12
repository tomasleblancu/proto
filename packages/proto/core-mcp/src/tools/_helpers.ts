/**
 * Framework-level tool helpers. Keep this tiny and dependency-free —
 * only reusable primitives live here. Domain-specific helpers live
 * in the app (e.g. examples/hermes/app/tools/_hermes-helpers.ts).
 */

export const ok = (text: string) => ({ content: [{ type: 'text' as const, text }] })
export const json = (obj: unknown) => ok(JSON.stringify(obj, null, 2))
export const err = (msg: string) => ok(`Error: ${msg}`)

// ── Agent-friendly responses ──

interface AgentResponse {
  summary: string
  data: Record<string, unknown>
  hint?: string
}

/** Structured response for the agent: summary + curated data + optional hint. */
export function agent(r: AgentResponse) {
  const out: Record<string, unknown> = { summary: r.summary, data: r.data }
  if (r.hint) out.hint = r.hint
  return ok(JSON.stringify(out))
}

/** Structured error for the agent with optional context. */
export function agentErr(summary: string, details?: Record<string, unknown>) {
  const out: Record<string, unknown> = { summary, error: true }
  if (details) out.data = details
  return ok(JSON.stringify(out))
}
