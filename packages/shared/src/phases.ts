// State machine de pedidos (a nivel item).
// El pedido agrega: order.current_phase = min(items.current_phase).

export const PHASES = [
  'sourcing',
  'negotiation',
  'preliminary_costing',
  'forwarder_quotation',
  'final_costing',
  'purchase_order',
  'production',
  'documentation',
  'shipping',
  'customs_cl',
  'last_mile',
  'received',
  'closed',
] as const

export type Phase = (typeof PHASES)[number]

export const PHASE_LABELS: Record<Phase, string> = {
  sourcing: 'Sourcing',
  negotiation: 'Negociacion',
  preliminary_costing: 'Costo preliminar',
  forwarder_quotation: 'Cotizacion forwarder',
  final_costing: 'Costo final y aprobacion',
  purchase_order: 'Orden de compra',
  production: 'Produccion',
  documentation: 'Documentacion',
  shipping: 'Embarque',
  customs_cl: 'Aduana CL',
  last_mile: 'Ultima milla',
  received: 'Recibido',
  closed: 'Cerrado',
}

// Sub-pasos por fase.
export const PHASE_STEPS = {
  sourcing: [
    'identify_need',
    'search_suppliers',
    'shortlist',
    'request_samples',
    'sample_approved',
  ],
  negotiation: [
    'request_quote',
    'negotiate_terms',
    'define_incoterm',
    'terms_agreed',
  ],
  preliminary_costing: [
    'estimate_freight',
    'estimate_duties',
    'estimate_landed_cost',
    'preliminary_ready',
  ],
  forwarder_quotation: [
    'request_klog_quote',
    'receive_quote',
    'quote_validated',
  ],
  final_costing: [
    'compute_final_landed',
    'prepare_approval_packet',
    'awaiting_client_approval',
    'approved',
  ],
  purchase_order: [
    'issue_po',
    'register_deposit_payment',
    'po_confirmed_by_supplier',
  ],
  production: [
    'in_production',
    'qc_pending',
    'qc_passed',
    'ready_to_ship',
  ],
  documentation: [
    'collect_commercial_invoice',
    'collect_packing_list',
    'collect_bl',
    'collect_coo_or_form_f',
    'collect_other_docs',
    'docs_complete',
  ],
  shipping: [
    'awaiting_pickup',
    'in_transit',
    'etd_confirmed',
    'arrived_port_cl',
  ],
  customs_cl: [
    'din_preparation',
    'register_customs_funds_provision',
    'din_submitted',
    'aforo',
    'duties_paid',
    'released',
  ],
  last_mile: [
    'dispatch_to_warehouse',
    'in_local_transit',
    'delivered',
  ],
  received: [
    'physical_check',
    'reconcile_qty',
    'register_balance_payment',
    'awaiting_client_confirmation',
  ],
  closed: [
    'compute_real_vs_estimated',
    'post_mortem',
    'closed',
  ],
} as const satisfies Record<Phase, readonly string[]>

export type Step<P extends Phase = Phase> = (typeof PHASE_STEPS)[P][number]
export type AnyStep = (typeof PHASE_STEPS)[Phase][number]

// Transversales (no son una fase, son flags).
export const ITEM_FLAGS = ['on_hold', 'blocked', 'cancelled'] as const
export type ItemFlag = (typeof ITEM_FLAGS)[number]

// Transiciones que requieren aprobacion humana explicita.
export const HUMAN_APPROVAL_GATES: Array<{ phase: Phase; step: string }> = [
  { phase: 'final_costing', step: 'awaiting_client_approval' },
  { phase: 'received', step: 'awaiting_client_confirmation' },
]

export function requiresHumanApproval(phase: Phase, step: string): boolean {
  return HUMAN_APPROVAL_GATES.some(g => g.phase === phase && g.step === step)
}

// Orden lineal para comparar fases (min/max para agregar a nivel order).
export function phaseIndex(p: Phase): number {
  return PHASES.indexOf(p)
}

// Mapping fase -> ejecucion (skills a cargar, subagent recomendado, si conviene
// forkear contexto). Esta es la capa que conecta el state machine con la capa
// agentica: cuando el orquestador entra a una fase, consulta esto para saber
// que conocimiento cargar y si delegar en un subagent aislado.
export type PhaseExecution = {
  skills: string[]
  subagent?: string
  fork: boolean
  rationale?: string
}

export const PHASE_EXECUTION: Record<Phase, PhaseExecution> = {
  sourcing: {
    skills: ['hermes-products', 'hermes-deep-research'],
    subagent: 'sourcing-researcher',
    fork: true,
    rationale: 'Investigacion abierta de proveedores ensucia mucho contexto.',
  },
  negotiation: {
    skills: ['hermes-orders'],
    fork: false,
  },
  preliminary_costing: {
    skills: ['hermes-orders', 'hermes-customs-cl'],
    fork: false,
  },
  forwarder_quotation: {
    skills: ['hermes-orders'],
    fork: false,
  },
  final_costing: {
    skills: ['hermes-orders', 'hermes-customs-cl'],
    fork: false,
  },
  purchase_order: {
    skills: ['hermes-orders'],
    fork: false,
  },
  production: {
    skills: ['hermes-orders'],
    fork: false,
  },
  documentation: {
    skills: ['hermes-documents'],
    subagent: 'orders-specialist',
    fork: true,
    rationale: 'Lectura/validacion de PDFs largos no debe ensuciar el orquestador.',
  },
  shipping: {
    skills: ['hermes-orders'],
    fork: false,
  },
  customs_cl: {
    skills: ['hermes-customs-cl'],
    subagent: 'customs-researcher',
    fork: true,
    rationale: 'Calculo de aranceles y partida arancelaria requiere razonamiento profundo.',
  },
  last_mile: {
    skills: ['hermes-orders'],
    fork: false,
  },
  received: {
    skills: ['hermes-orders', 'hermes-documents'],
    fork: false,
  },
  closed: {
    skills: ['hermes-orders'],
    fork: false,
  },
}

export function getPhaseExecution(phase: Phase): PhaseExecution {
  return PHASE_EXECUTION[phase]
}

export function minPhase(phases: Phase[]): Phase | null {
  if (phases.length === 0) return null
  return phases.reduce((a, b) => (phaseIndex(a) <= phaseIndex(b) ? a : b))
}
