import type { Incoterm } from './incoterms.js'

export const PAYMENT_TYPES = [
  'deposit',          // anticipo al supplier
  'balance',          // saldo al supplier
  'freight',          // flete internacional (a forwarder)
  'insurance',        // seguro de carga (a forwarder)
  'customs_provision',// provision de fondos aduana — cubre puerto, agente, aranceles, IVA
  'transport',        // transporte local / last mile (factura aparte)
  'other',
] as const

export type PaymentType = (typeof PAYMENT_TYPES)[number]

export const PAYMENT_PAYEES = ['supplier', 'forwarder', 'customs', 'port', 'other'] as const
export type PaymentPayee = (typeof PAYMENT_PAYEES)[number]

export const PAYMENT_STATUSES = ['pending', 'scheduled', 'paid', 'failed', 'cancelled'] as const
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]

// Tipos de pago tipicos por incoterm (sirve para que el agente sepa que pagos
// "deberian existir" en un pedido).
export const PAYMENT_TYPES_BY_INCOTERM: Record<Incoterm, PaymentType[]> = {
  FOB: ['deposit', 'balance', 'freight', 'insurance', 'customs_provision', 'transport'],
  EXW: [],
  CIF: [],
  DDP: [],
}

// Mapeo payee por tipo de pago.
export const DEFAULT_PAYEE: Record<PaymentType, PaymentPayee> = {
  deposit: 'supplier',
  balance: 'supplier',
  freight: 'forwarder',
  insurance: 'forwarder',
  customs_provision: 'forwarder',
  transport: 'other',
  other: 'other',
}
