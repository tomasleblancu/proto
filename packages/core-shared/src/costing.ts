/**
 * Costing breakdown fields — same shape for estimated and actual.
 * All amounts in the costing's base currency (usually USD).
 */
export const COSTING_FIELDS = [
  'fob',             // precio FOB total del supplier
  'freight',         // flete internacional
  'insurance',       // seguro de carga
  'duties',          // derechos de aduana (arancel)
  'deconsolidation', // desconsolidacion en puerto
  'port',            // gastos portuarios (almacenaje, recepcion)
  'storage',         // almacenaje
  'receiving',       // recepcion/despacho en bodega
  'customs_agent',   // honorarios agente de aduana
  'documentation',   // gastos documentacion
  'transport',       // transporte local (last mile)
  'samples',         // costo de muestras
  'iva',             // IVA (19% sobre CIF + duties)
  'other',           // otros gastos
  'landed_total',    // costo landed total (suma de todo)
] as const

export type CostingField = (typeof COSTING_FIELDS)[number]

export type CostingBreakdown = Partial<Record<CostingField, number>>

// ── Dynamic estimated computation (shared between widget + MCP) ──

export interface CostingDefault {
  key: string
  value: number
  unit: string
  qty_type: string
  minimum: number
}

export interface CostingItem {
  quantity: number
  unit_price: number
  cbm_unit: number | null
}

function getDefault(defaults: CostingDefault[], key: string): CostingDefault | undefined {
  return defaults.find(d => d.key === key)
}

function calcLine(def: CostingDefault | undefined, base: number, cbm: number): number {
  if (!def) return 0
  let val = 0
  switch (def.qty_type) {
    case 'per_cbm': val = def.value * cbm; break
    case 'pct_fob': val = base * (def.value / 100); break
    case 'pct_cif': val = base * (def.value / 100); break
    case 'flat': default: val = def.value; break
  }
  return Math.max(val, def.minimum || 0)
}

/**
 * Compute estimated costing from items + defaults.
 * Same logic used by the Costing widget (frontend) and get_costing (MCP).
 */
export function computeEstimated(
  items: CostingItem[],
  defaults: CostingDefault[],
  hasTlc: boolean,
  samplesCost = 0,
): CostingBreakdown {
  const fob = items.reduce((s, it) => s + (Number(it.unit_price) || 0) * (it.quantity || 0), 0)
  if (!fob) return {}

  const cbm = items.reduce((s, it) => s + (Number(it.cbm_unit) || 0) * (it.quantity || 0), 0)

  const freight = calcLine(getDefault(defaults, 'freight'), fob, cbm)
  const insurance = calcLine(getDefault(defaults, 'insurance'), fob + freight, cbm)
  const cif = fob + freight + insurance
  const deconsolidation = calcLine(getDefault(defaults, 'deconsolidation'), fob, cbm)
  const port = calcLine(getDefault(defaults, 'storage'), fob, cbm)

  const dutiesPct = hasTlc
    ? (getDefault(defaults, 'duties_tlc_pct')?.value ?? 0)
    : (getDefault(defaults, 'duties_general_pct')?.value ?? 6)
  const duties = cif * (dutiesPct / 100)

  const customs_agent = calcLine(getDefault(defaults, 'agent_fee'), fob, cbm)
  const transport = calcLine(getDefault(defaults, 'transport'), fob, cbm)
  const samples = samplesCost

  const ivaPct = getDefault(defaults, 'iva_pct')?.value ?? 19
  const iva = (cif + duties) * (ivaPct / 100)

  const landed_total = fob + freight + insurance + deconsolidation + port + duties
    + customs_agent + transport + samples

  const est: CostingBreakdown = {
    fob, freight, insurance, deconsolidation, port, duties,
    customs_agent, transport, landed_total,
  }
  if (samples > 0) est.samples = samples
  est.iva = Math.round(iva * 100) / 100

  for (const k of Object.keys(est) as CostingField[]) {
    est[k] = Math.round(est[k]! * 100) / 100
  }

  return est
}

// ── Actual from payments ──

export interface PaymentRow {
  type: string
  amount: number
  currency: string
  status: string
}

/**
 * Compute actual costing breakdown from payments.
 * Maps payment types to costing fields. Payments in non-base currency
 * are converted using fxRate.
 */
export function computeActualFromPayments(
  payments: PaymentRow[],
  baseCurrency: string,
  fxRate: number | null,
): CostingBreakdown {
  if (payments.length === 0) return {}

  const actual: CostingBreakdown = {}

  for (const p of payments) {
    if (p.status === 'cancelled' || p.status === 'failed') continue

    let amount = Number(p.amount) || 0
    // Convert to base currency if needed
    if (p.currency !== baseCurrency && fxRate && fxRate > 0) {
      amount = amount / fxRate
    }

    switch (p.type) {
      case 'deposit':
      case 'balance':
        actual.fob = (actual.fob || 0) + amount
        break
      case 'freight':
        actual.freight = (actual.freight || 0) + amount
        break
      case 'insurance':
        actual.insurance = (actual.insurance || 0) + amount
        break
      case 'customs_provision':
        // Provision goes to a combined field; individual breakdown
        // comes from document invoices (persisted in costings.actual)
        actual.customs_agent = (actual.customs_agent || 0) + amount
        break
      case 'transport':
        actual.transport = (actual.transport || 0) + amount
        break
      default:
        actual.other = (actual.other || 0) + amount
        break
    }
  }

  // Round
  for (const k of Object.keys(actual) as CostingField[]) {
    actual[k] = Math.round(actual[k]! * 100) / 100
  }

  // Compute landed_total (without iva)
  let landed = 0
  for (const k of Object.keys(actual) as CostingField[]) {
    if (k !== 'landed_total' && k !== 'iva') {
      landed += actual[k] || 0
    }
  }
  actual.landed_total = Math.round(landed * 100) / 100

  return actual
}

/**
 * Merge persisted actual overrides (from document invoices) with
 * payment-derived actuals. Persisted values take precedence since
 * they come from detailed invoice breakdowns.
 */
export function mergeActual(
  fromPayments: CostingBreakdown,
  persisted: CostingBreakdown,
): CostingBreakdown {
  const merged = { ...fromPayments }

  // Persisted values override payment-derived ones
  for (const [k, v] of Object.entries(persisted)) {
    if (v != null && v !== 0) {
      merged[k as CostingField] = v
    }
  }

  // Recompute landed_total from merged
  let landed = 0
  for (const k of Object.keys(merged) as CostingField[]) {
    if (k !== 'landed_total' && k !== 'iva') {
      landed += merged[k] || 0
    }
  }
  merged.landed_total = Math.round(landed * 100) / 100

  return merged
}
