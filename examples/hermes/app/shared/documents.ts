import type { Incoterm } from './incoterms.js'

export const DOC_KINDS = [
  // Comerciales (proveedor)
  'proforma_invoice',
  'commercial_invoice',
  'packing_list',
  'certificate_of_origin',
  'form_f',
  'bill_of_lading',
  // Forwarder (Klog)
  'forwarder_invoice',
  'customs_funds_provision',
  'port_invoice',
  // Aduana
  'din',
  // Comprobantes de pago (linkeables a facturas via receipt_document_id)
  'payment_receipt',
  // Otros
  'msds',
  'other',
] as const

export type DocKind = (typeof DOC_KINDS)[number]

export const DOC_KIND_LABELS: Record<DocKind, string> = {
  proforma_invoice: 'Proforma Invoice',
  commercial_invoice: 'Commercial Invoice',
  packing_list: 'Packing List',
  certificate_of_origin: 'Certificado de Origen',
  form_f: 'Form F (TLC)',
  bill_of_lading: 'Bill of Lading',
  forwarder_invoice: 'Factura Forwarder',
  customs_funds_provision: 'Provision de fondos aduana',
  port_invoice: 'Factura de puerto',
  din: 'DIN (Declaracion de Ingreso)',
  payment_receipt: 'Comprobante de pago',
  msds: 'MSDS',
  other: 'Otro',
}

export type DocRequirement = 'required' | 'optional' | 'na' | 'conditional'

// Matriz de requerimientos de documentos por incoterm.
// 'conditional' = depende de algo (ej. TLC del pais origen, tipo de producto).
export const DOC_REQUIREMENTS_BY_INCOTERM: Record<Incoterm, Record<DocKind, DocRequirement>> = {
  FOB: {
    proforma_invoice: 'required',
    commercial_invoice: 'required',
    packing_list: 'required',
    bill_of_lading: 'required',
    certificate_of_origin: 'conditional', // segun TLC pais origen
    form_f: 'conditional',                // segun TLC pais origen
    forwarder_invoice: 'required',
    customs_funds_provision: 'required',
    port_invoice: 'required',
    din: 'required',
    payment_receipt: 'optional',
    msds: 'conditional', // segun producto
    other: 'optional',
  },
  // Stubs - se completan cuando agreguemos soporte real.
  EXW: {} as Record<DocKind, DocRequirement>,
  CIF: {} as Record<DocKind, DocRequirement>,
  DDP: {} as Record<DocKind, DocRequirement>,
}

// Documentos que disparan registro de un pago al cargarlos.
export const DOCS_THAT_TRIGGER_PAYMENT: DocKind[] = [
  'proforma_invoice',         // anticipo a supplier
  'forwarder_invoice',        // pago a Klog
  'customs_funds_provision',  // provision para aduana
  'port_invoice',             // gastos de puerto
]

export function getRequiredDocsForIncoterm(incoterm: Incoterm): DocKind[] {
  const matrix = DOC_REQUIREMENTS_BY_INCOTERM[incoterm]
  return DOC_KINDS.filter(k => matrix[k] === 'required')
}
