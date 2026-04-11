/**
 * Hermes-specific tool helpers. Lives in app-space because it's tied
 * to the import workflow (13 phases). Framework helpers (ok/json/err/agent/agentErr)
 * live in @proto/core-mcp.
 */
import { PHASE_STEPS, type Phase } from '../shared/index.js'

/** True if `step` is a valid step within `phase` in the Hermes import workflow. */
export function isValidStep(phase: Phase, step: string): boolean {
  return (PHASE_STEPS[phase] as readonly string[]).includes(step)
}
