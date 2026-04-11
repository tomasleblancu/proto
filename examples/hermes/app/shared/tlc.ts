import type { DocKind } from './documents.js'

// Tabla simplificada de TLCs Chile -> certificado de origen requerido.
// ISO 3166-1 alpha-2.
// 'form_f' = paises con form especifico (ej. Mercosur ACE-35 historico).
// 'certificate_of_origin' = TLC generico.
// 'none' = sin acuerdo, no aplica rebaja arancelaria.

export type TlcCertKind = Extract<DocKind, 'form_f' | 'certificate_of_origin'> | 'none'

export const TLC_CHILE: Record<string, TlcCertKind> = {
  // Mercosur (ACE-35) usa Form F historicamente
  AR: 'form_f',
  BR: 'form_f',
  PY: 'form_f',
  UY: 'form_f',
  // TLCs con certificado de origen generico
  CN: 'certificate_of_origin', // TLC Chile-China
  US: 'certificate_of_origin', // TLC Chile-EEUU
  KR: 'certificate_of_origin', // TLC Chile-Corea
  JP: 'certificate_of_origin', // EPA Chile-Japon
  IN: 'certificate_of_origin', // Acuerdo parcial
  CA: 'certificate_of_origin', // TLC Chile-Canada
  MX: 'certificate_of_origin', // TLC Chile-Mexico
  PE: 'certificate_of_origin', // ALADI/Alianza del Pacifico
  CO: 'certificate_of_origin',
  EC: 'certificate_of_origin',
  // Union Europea (acuerdo de asociacion)
  DE: 'certificate_of_origin',
  ES: 'certificate_of_origin',
  IT: 'certificate_of_origin',
  FR: 'certificate_of_origin',
  NL: 'certificate_of_origin',
  // Reino Unido
  GB: 'certificate_of_origin',
}

export function detectTlcRequirement(countryCode: string): TlcCertKind {
  return TLC_CHILE[countryCode.toUpperCase()] ?? 'none'
}
