import { describe, it, expect } from 'vitest'
import {
  PHASES,
  PHASE_STEPS,
  PHASE_EXECUTION,
  HUMAN_APPROVAL_GATES,
  requiresHumanApproval,
  minPhase,
  phaseIndex,
} from './phases.js'
import { detectTlcRequirement } from './tlc.js'
import {
  isValidSampleTransition,
  SAMPLE_TRANSITIONS,
} from './samples.js'
import {
  DOC_REQUIREMENTS_BY_INCOTERM,
  getRequiredDocsForIncoterm,
  DOCS_THAT_TRIGGER_PAYMENT,
} from './documents.js'
import { DEFAULT_PAYEE, PAYMENT_TYPES_BY_INCOTERM } from './payments.js'

describe('phases', () => {
  it('tiene 13 fases', () => {
    expect(PHASES).toHaveLength(13)
  })

  it('cada fase tiene al menos un sub-paso', () => {
    for (const phase of PHASES) {
      expect(PHASE_STEPS[phase].length).toBeGreaterThan(0)
    }
  })

  it('PHASE_EXECUTION cubre todas las fases', () => {
    for (const phase of PHASES) {
      expect(PHASE_EXECUTION[phase]).toBeDefined()
      expect(PHASE_EXECUTION[phase].skills.length).toBeGreaterThan(0)
    }
  })

  it('los gates humanos referencian fases y steps validos', () => {
    for (const gate of HUMAN_APPROVAL_GATES) {
      expect(PHASES).toContain(gate.phase)
      expect(PHASE_STEPS[gate.phase] as readonly string[]).toContain(gate.step)
    }
  })

  it('requiresHumanApproval detecta los gates', () => {
    expect(requiresHumanApproval('final_costing', 'awaiting_client_approval')).toBe(true)
    expect(requiresHumanApproval('received', 'awaiting_client_confirmation')).toBe(true)
    expect(requiresHumanApproval('sourcing', 'identify_need')).toBe(false)
  })

  it('minPhase devuelve la fase menor', () => {
    expect(minPhase(['production', 'sourcing', 'shipping'])).toBe('sourcing')
    expect(minPhase(['closed', 'received'])).toBe('received')
    expect(minPhase([])).toBeNull()
  })

  it('phaseIndex es estrictamente creciente', () => {
    for (let i = 1; i < PHASES.length; i++) {
      expect(phaseIndex(PHASES[i])).toBeGreaterThan(phaseIndex(PHASES[i - 1]))
    }
  })

  it('subagents referenciados existen en agents/ (al menos los nombres)', () => {
    const expected = ['sourcing-researcher', 'customs-researcher', 'orders-specialist']
    const actual = Object.values(PHASE_EXECUTION)
      .map(e => e.subagent)
      .filter(Boolean)
    for (const name of actual) {
      expect(expected).toContain(name)
    }
  })
})

describe('TLC detection', () => {
  it('Mercosur paga form_f', () => {
    expect(detectTlcRequirement('AR')).toBe('form_f')
    expect(detectTlcRequirement('BR')).toBe('form_f')
  })

  it('CN/US/EU usan certificate_of_origin', () => {
    expect(detectTlcRequirement('CN')).toBe('certificate_of_origin')
    expect(detectTlcRequirement('US')).toBe('certificate_of_origin')
    expect(detectTlcRequirement('DE')).toBe('certificate_of_origin')
  })

  it('paises sin TLC devuelven none', () => {
    expect(detectTlcRequirement('XX')).toBe('none')
    expect(detectTlcRequirement('VN')).toBe('none')
  })

  it('case insensitive', () => {
    expect(detectTlcRequirement('cn')).toBe('certificate_of_origin')
  })
})

describe('sample transitions', () => {
  it('flujo feliz', () => {
    expect(isValidSampleTransition('requested', 'in_transit')).toBe(true)
    expect(isValidSampleTransition('in_transit', 'received')).toBe(true)
    expect(isValidSampleTransition('received', 'under_evaluation')).toBe(true)
    expect(isValidSampleTransition('under_evaluation', 'approved')).toBe(true)
  })

  it('estados terminales no transicionan', () => {
    expect(SAMPLE_TRANSITIONS.approved).toEqual([])
    expect(SAMPLE_TRANSITIONS.rejected).toEqual([])
    expect(SAMPLE_TRANSITIONS.cancelled).toEqual([])
  })

  it('rechaza saltos invalidos', () => {
    expect(isValidSampleTransition('requested', 'approved')).toBe(false)
    expect(isValidSampleTransition('received', 'approved')).toBe(false)
  })

  it('needs_revision puede volver a evaluation', () => {
    expect(isValidSampleTransition('needs_revision', 'under_evaluation')).toBe(true)
  })
})

describe('documentos por incoterm', () => {
  it('FOB tiene matriz completa', () => {
    const matrix = DOC_REQUIREMENTS_BY_INCOTERM.FOB
    expect(matrix.proforma_invoice).toBe('required')
    expect(matrix.commercial_invoice).toBe('required')
    expect(matrix.bill_of_lading).toBe('required')
    expect(matrix.din).toBe('required')
    expect(matrix.certificate_of_origin).toBe('conditional')
    expect(matrix.form_f).toBe('conditional')
  })

  it('getRequiredDocsForIncoterm filtra solo required', () => {
    const required = getRequiredDocsForIncoterm('FOB')
    expect(required).toContain('proforma_invoice')
    expect(required).toContain('din')
    expect(required).not.toContain('certificate_of_origin')
    expect(required).not.toContain('form_f')
  })

  it('docs que disparan pago son los esperados', () => {
    expect(DOCS_THAT_TRIGGER_PAYMENT).toContain('proforma_invoice')
    expect(DOCS_THAT_TRIGGER_PAYMENT).toContain('forwarder_invoice')
    expect(DOCS_THAT_TRIGGER_PAYMENT).toContain('customs_funds_provision')
    expect(DOCS_THAT_TRIGGER_PAYMENT).toContain('port_invoice')
  })
})

describe('payments', () => {
  it('default payee por tipo de pago', () => {
    expect(DEFAULT_PAYEE.deposit).toBe('supplier')
    expect(DEFAULT_PAYEE.balance).toBe('supplier')
    expect(DEFAULT_PAYEE.freight).toBe('forwarder')
    expect(DEFAULT_PAYEE.insurance).toBe('forwarder')
    expect(DEFAULT_PAYEE.customs_provision).toBe('forwarder')
    expect(DEFAULT_PAYEE.transport).toBe('other')
  })

  it('FOB tiene los pagos esperados', () => {
    const types = PAYMENT_TYPES_BY_INCOTERM.FOB
    expect(types).toContain('deposit')
    expect(types).toContain('balance')
    expect(types).toContain('freight')
    expect(types).toContain('customs_provision')
  })
})
