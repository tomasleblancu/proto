/**
 * defineWorkflow — declarative state machine over a Supabase table.
 *
 * A workflow describes a sequence of phases, each with sub-steps. Items
 * (rows in `entityTable`) carry `phase_column` + `step_column` values and
 * advance through the phases under agent or user control. Transitions are
 * recorded into `transitionsTable`.
 *
 * The definition is pure data. `@proto/core-mcp` has `buildWorkflowTools()`
 * that consumes a WorkflowDefinition and emits 9 MCP tools:
 *
 *   get_item_state, list_items_by_phase, advance_step,
 *   block_item, unblock_item, hold_item, resume_item, cancel_item,
 *   request_human_approval
 *
 * Tool names can be customized via `toolNames` when multiple workflows
 * coexist in one app; otherwise the defaults keep skills compatible.
 *
 * Example:
 *
 *   export default defineWorkflow({
 *     name: 'import',
 *     entityTable: 'order_items',
 *     transitionsTable: 'phase_transitions',
 *     phases: [
 *       {
 *         name: 'sourcing',
 *         label: 'Sourcing',
 *         steps: ['identify_need', 'search_suppliers', 'shortlist'],
 *         execution: { skills: ['products'], fork: true },
 *       },
 *       {
 *         name: 'final_costing',
 *         steps: [
 *           'compute_final_landed',
 *           { name: 'awaiting_client_approval', requires_human_approval: true },
 *           'approved',
 *         ],
 *       },
 *     ],
 *   })
 */

export interface WorkflowStepConfig {
  name: string
  requires_human_approval?: boolean
}

export type WorkflowStep = string | WorkflowStepConfig

export interface PhaseExecution {
  skills?: string[]
  subagent?: string
  fork?: boolean
  rationale?: string
}

export interface WorkflowPhase {
  name: string
  label?: string
  steps: WorkflowStep[]
  execution?: PhaseExecution
}

export interface WorkflowToolNames {
  getState?: string
  listByPhase?: string
  advanceStep?: string
  blockItem?: string
  unblockItem?: string
  holdItem?: string
  resumeItem?: string
  cancelItem?: string
  requestHumanApproval?: string
}

export interface WorkflowColumns {
  phase?: string        // default 'current_phase'
  step?: string         // default 'current_step'
  onHold?: string       // default 'on_hold'
  blocked?: string      // default 'blocked_reason'
  cancelled?: string    // default 'cancelled'
  company?: string      // default 'company_id'
  updatedAt?: string    // default 'updated_at'
}

export interface WorkflowDefinition {
  /** Unique workflow id (e.g. 'import'). */
  name: string
  /** Human-readable singular (e.g. 'importacion'). */
  displayName?: string
  /** Table holding the stateful items (e.g. 'order_items'). */
  entityTable: string
  /** Table for transition history (e.g. 'phase_transitions'). */
  transitionsTable: string
  /** Column name overrides. Sensible defaults for Hermes-style schemas. */
  columns?: WorkflowColumns
  /** Phase list in forward order. */
  phases: WorkflowPhase[]
  /** Extra per-step hints keyed by `${phase}.${step}`. */
  stepHints?: Record<string, string>
  /** Tool name overrides for multi-workflow apps. */
  toolNames?: WorkflowToolNames
}

export function defineWorkflow(def: WorkflowDefinition): WorkflowDefinition {
  return def
}

// ── Derived helpers ───────────────────────────────────────────────────────

export function workflowPhaseNames(wf: WorkflowDefinition): string[] {
  return wf.phases.map(p => p.name)
}

export function workflowPhaseIndex(wf: WorkflowDefinition, phase: string): number {
  return wf.phases.findIndex(p => p.name === phase)
}

export function workflowPhaseLabels(wf: WorkflowDefinition): Record<string, string> {
  return Object.fromEntries(wf.phases.map(p => [p.name, p.label ?? p.name]))
}

function stepName(s: WorkflowStep): string {
  return typeof s === 'string' ? s : s.name
}

export function workflowPhaseSteps(wf: WorkflowDefinition, phase: string): string[] {
  const p = wf.phases.find(x => x.name === phase)
  return p ? p.steps.map(stepName) : []
}

export function workflowAllPhaseSteps(wf: WorkflowDefinition): Record<string, string[]> {
  return Object.fromEntries(wf.phases.map(p => [p.name, p.steps.map(stepName)]))
}

export function workflowIsValidStep(wf: WorkflowDefinition, phase: string, step: string): boolean {
  return workflowPhaseSteps(wf, phase).includes(step)
}

export function workflowRequiresHumanApproval(
  wf: WorkflowDefinition,
  phase: string,
  step: string
): boolean {
  const p = wf.phases.find(x => x.name === phase)
  if (!p) return false
  const s = p.steps.find(x => stepName(x) === step)
  if (!s) return false
  return typeof s === 'object' && !!s.requires_human_approval
}

export function workflowHumanApprovalGates(wf: WorkflowDefinition): Array<{ phase: string; step: string }> {
  const gates: Array<{ phase: string; step: string }> = []
  for (const p of wf.phases) {
    for (const s of p.steps) {
      if (typeof s === 'object' && s.requires_human_approval) {
        gates.push({ phase: p.name, step: s.name })
      }
    }
  }
  return gates
}

export function workflowExecution(wf: WorkflowDefinition): Record<string, PhaseExecution> {
  return Object.fromEntries(
    wf.phases.filter(p => p.execution).map(p => [p.name, p.execution!])
  )
}
