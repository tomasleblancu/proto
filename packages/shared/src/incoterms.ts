export const INCOTERMS = ['EXW', 'FOB', 'CIF', 'DDP'] as const
export type Incoterm = (typeof INCOTERMS)[number]

export const DEFAULT_INCOTERM: Incoterm = 'FOB'

export const INCOTERM_LABELS: Record<Incoterm, string> = {
  EXW: 'Ex Works',
  FOB: 'Free On Board',
  CIF: 'Cost, Insurance & Freight',
  DDP: 'Delivered Duty Paid',
}
