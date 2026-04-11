import { describe, it, expect } from 'vitest'
import { isValidTransition, getRequiredDocsForStage, VALID_TRANSITIONS } from './constants'

describe('Order State Machine', () => {
  it('allows sourcing → draft', () => {
    expect(isValidTransition('sourcing', 'draft')).toBe(true)
  })

  it('allows sourcing → cancelled', () => {
    expect(isValidTransition('sourcing', 'cancelled')).toBe(true)
  })

  it('rejects sourcing → po_sent (skip draft)', () => {
    expect(isValidTransition('sourcing', 'po_sent')).toBe(false)
  })

  it('allows draft → po_sent', () => {
    expect(isValidTransition('draft', 'po_sent')).toBe(true)
  })

  it('allows draft → cancelled', () => {
    expect(isValidTransition('draft', 'cancelled')).toBe(true)
  })

  it('rejects draft → delivered (skip)', () => {
    expect(isValidTransition('draft', 'delivered')).toBe(false)
  })

  it('rejects delivered → anything (terminal)', () => {
    expect(isValidTransition('delivered', 'draft')).toBe(false)
    expect(isValidTransition('delivered', 'cancelled')).toBe(false)
    expect(isValidTransition('delivered', 'on_hold')).toBe(false)
  })

  it('rejects cancelled → anything (terminal)', () => {
    expect(isValidTransition('cancelled', 'draft')).toBe(false)
    expect(isValidTransition('cancelled', 'po_sent')).toBe(false)
  })

  it('allows any active state → on_hold', () => {
    for (const status of ['po_sent', 'production', 'shipped', 'in_transit', 'customs'] as const) {
      expect(isValidTransition(status, 'on_hold')).toBe(true)
    }
  })

  it('allows on_hold → active states', () => {
    expect(isValidTransition('on_hold', 'po_sent')).toBe(true)
    expect(isValidTransition('on_hold', 'production')).toBe(true)
    expect(isValidTransition('on_hold', 'shipped')).toBe(true)
  })

  it('rejects on_hold → delivered', () => {
    expect(isValidTransition('on_hold', 'delivered')).toBe(false)
  })

  it('allows on_hold → sourcing', () => {
    expect(isValidTransition('on_hold', 'sourcing')).toBe(true)
  })

  it('follows sequential flow', () => {
    const flow = ['sourcing', 'draft', 'po_sent', 'production', 'shipped', 'in_transit', 'customs', 'delivered'] as const
    for (let i = 0; i < flow.length - 1; i++) {
      expect(isValidTransition(flow[i], flow[i + 1])).toBe(true)
    }
  })

  it('rejects backwards transitions', () => {
    expect(isValidTransition('shipped', 'production')).toBe(false)
    expect(isValidTransition('customs', 'shipped')).toBe(false)
  })
})

describe('Document Requirements Matrix', () => {
  it('po_sent requires proforma_invoice', () => {
    expect(getRequiredDocsForStage('po_sent')).toEqual(['proforma_invoice'])
  })

  it('shipped accumulates previous requirements', () => {
    const docs = getRequiredDocsForStage('shipped')
    expect(docs).toContain('proforma_invoice')
    expect(docs).toContain('commercial_invoice')
    expect(docs).toContain('packing_list')
    expect(docs).toContain('bl')
  })

  it('customs requires everything up to din', () => {
    const docs = getRequiredDocsForStage('customs')
    expect(docs).toContain('proforma_invoice')
    expect(docs).toContain('commercial_invoice')
    expect(docs).toContain('packing_list')
    expect(docs).toContain('bl')
    expect(docs).toContain('insurance')
    expect(docs).toContain('din')
  })

  it('delivered requires customs_release', () => {
    const docs = getRequiredDocsForStage('delivered')
    expect(docs).toContain('customs_release')
  })

  it('draft has no requirements', () => {
    expect(getRequiredDocsForStage('draft')).toEqual([])
  })

  it('no duplicate docs', () => {
    const docs = getRequiredDocsForStage('delivered')
    expect(docs.length).toBe(new Set(docs).size)
  })
})
