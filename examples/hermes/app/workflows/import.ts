/**
 * Hermes import workflow — 13-phase state machine for import orders.
 *
 * This file is the source of truth for the workflow. Everything else derives
 * from it: the MCP state machine tools (via buildWorkflowTools in
 * @proto/core-mcp), and the legacy helpers (PHASES, PHASE_LABELS, PHASE_STEPS,
 * PHASE_EXECUTION, requiresHumanApproval, phaseIndex) re-exported at the
 * bottom so order entity snapshot, items tool, and unit tests keep working.
 */
import {
  defineWorkflow,
  workflowPhaseNames,
  workflowPhaseLabels,
  workflowAllPhaseSteps,
  workflowExecution,
  workflowRequiresHumanApproval,
  workflowPhaseIndex,
  workflowIsValidStep,
} from '@tleblancureta/proto/shared'

const importWorkflow = defineWorkflow({
  name: 'import',
  displayName: 'importacion',
  entityTable: 'order_items',
  transitionsTable: 'phase_transitions',
  phases: [
    {
      name: 'sourcing',
      label: 'Sourcing',
      steps: ['identify_need', 'search_suppliers', 'shortlist', 'request_samples', 'sample_approved'],
      execution: {
        skills: ['hermes-products', 'hermes-deep-research'],
        subagent: 'sourcing-researcher',
        fork: true,
        rationale: 'Investigacion abierta de proveedores ensucia mucho contexto.',
      },
    },
    {
      name: 'negotiation',
      label: 'Negociacion',
      steps: ['request_quote', 'negotiate_terms', 'define_incoterm', 'terms_agreed'],
      execution: { skills: ['hermes-orders'], fork: false },
    },
    {
      name: 'preliminary_costing',
      label: 'Costo preliminar',
      steps: ['estimate_freight', 'estimate_duties', 'estimate_landed_cost', 'preliminary_ready'],
      execution: { skills: ['hermes-orders', 'hermes-customs-cl'], fork: false },
    },
    {
      name: 'forwarder_quotation',
      label: 'Cotizacion forwarder',
      steps: ['request_klog_quote', 'receive_quote', 'quote_validated'],
      execution: { skills: ['hermes-orders'], fork: false },
    },
    {
      name: 'final_costing',
      label: 'Costo final y aprobacion',
      steps: [
        'compute_final_landed',
        'prepare_approval_packet',
        { name: 'awaiting_client_approval', requires_human_approval: true },
        'approved',
      ],
      execution: { skills: ['hermes-orders', 'hermes-customs-cl'], fork: false },
    },
    {
      name: 'purchase_order',
      label: 'Orden de compra',
      steps: ['issue_po', 'register_deposit_payment', 'po_confirmed_by_supplier'],
      execution: { skills: ['hermes-orders'], fork: false },
    },
    {
      name: 'production',
      label: 'Produccion',
      steps: ['in_production', 'qc_pending', 'qc_passed', 'ready_to_ship'],
      execution: { skills: ['hermes-orders'], fork: false },
    },
    {
      name: 'documentation',
      label: 'Documentacion',
      steps: ['collect_commercial_invoice', 'collect_packing_list', 'collect_bl', 'collect_coo_or_form_f', 'collect_other_docs', 'docs_complete'],
      execution: {
        skills: ['hermes-documents'],
        subagent: 'orders-specialist',
        fork: true,
        rationale: 'Lectura/validacion de PDFs largos no debe ensuciar el orquestador.',
      },
    },
    {
      name: 'shipping',
      label: 'Embarque',
      steps: ['awaiting_pickup', 'in_transit', 'etd_confirmed', 'arrived_port_cl'],
      execution: { skills: ['hermes-orders'], fork: false },
    },
    {
      name: 'customs_cl',
      label: 'Aduana CL',
      steps: ['din_preparation', 'register_customs_funds_provision', 'din_submitted', 'aforo', 'duties_paid', 'released'],
      execution: {
        skills: ['hermes-customs-cl'],
        subagent: 'customs-researcher',
        fork: true,
        rationale: 'Calculo de aranceles y partida arancelaria requiere razonamiento profundo.',
      },
    },
    {
      name: 'last_mile',
      label: 'Ultima milla',
      steps: ['dispatch_to_warehouse', 'in_local_transit', 'delivered'],
      execution: { skills: ['hermes-orders'], fork: false },
    },
    {
      name: 'received',
      label: 'Recibido',
      steps: [
        'physical_check',
        'reconcile_qty',
        'register_balance_payment',
        { name: 'awaiting_client_confirmation', requires_human_approval: true },
      ],
      execution: { skills: ['hermes-orders', 'hermes-documents'], fork: false },
    },
    {
      name: 'closed',
      label: 'Cerrado',
      steps: ['compute_real_vs_estimated', 'post_mortem', 'closed'],
      execution: { skills: ['hermes-orders'], fork: false },
    },
  ],
  stepHints: {
    'purchase_order.register_deposit_payment':
      'Registra el deposito con record_payment(type="deposit"), luego avanza a po_confirmed_by_supplier.',
    'documentation.collect_commercial_invoice':
      'Usa attach_document(kind="commercial_invoice") con extracted. Despues de todos los docs, llama validate_document_set.',
    'customs_cl.register_customs_funds_provision':
      'Adjunta customs_funds_provision y registra el pago. La provision cubre duties + port + customs_agent.',
    'shipping.arrived_port_cl':
      'Prepara aduana: verifica docs completos (validate_document_set) antes de avanzar a customs_cl.',
    'closed.compute_real_vs_estimated':
      'Llama get_costing para comparar estimado vs actual. Revisa el delta.',
  },
})

export default importWorkflow

// ── Legacy-compatible derived helpers ─────────────────────────────────────
// Existing consumers (order entity snapshotBuilder, items tool, workflow.test)
// imported these from `phases.ts`. We keep the same names/shapes but derive
// them from the workflow def so the workflow is the single source of truth.

export const PHASES = workflowPhaseNames(importWorkflow) as readonly string[]
export type Phase = (typeof PHASES)[number]

export const PHASE_LABELS = workflowPhaseLabels(importWorkflow) as Record<Phase, string>
export const PHASE_STEPS = workflowAllPhaseSteps(importWorkflow) as Record<Phase, readonly string[]>
export const PHASE_EXECUTION = workflowExecution(importWorkflow) as Record<Phase, {
  skills?: string[]
  subagent?: string
  fork?: boolean
  rationale?: string
}>

export const ITEM_FLAGS = ['on_hold', 'blocked', 'cancelled'] as const
export type ItemFlag = (typeof ITEM_FLAGS)[number]

export const HUMAN_APPROVAL_GATES: Array<{ phase: Phase; step: string }> = [
  ...importWorkflow.phases.flatMap(p =>
    p.steps
      .filter((s): s is { name: string; requires_human_approval?: boolean } =>
        typeof s === 'object' && !!s.requires_human_approval
      )
      .map(s => ({ phase: p.name as Phase, step: s.name }))
  ),
]

export function requiresHumanApproval(phase: Phase, step: string): boolean {
  return workflowRequiresHumanApproval(importWorkflow, phase, step)
}

export function isValidStep(phase: Phase, step: string): boolean {
  return workflowIsValidStep(importWorkflow, phase, step)
}

export function phaseIndex(p: Phase): number {
  return workflowPhaseIndex(importWorkflow, p)
}

export function getPhaseExecution(phase: Phase) {
  return PHASE_EXECUTION[phase]
}

export function minPhase(phases: Phase[]): Phase | null {
  if (phases.length === 0) return null
  return phases.reduce((a, b) => (phaseIndex(a) <= phaseIndex(b) ? a : b))
}
