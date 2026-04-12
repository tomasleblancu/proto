/**
 * Registry of direct frontend actions that agent-rendered Buttons can trigger.
 * Each action is an async handler that runs in the browser (usually a Supabase
 * write) and returns a short confirmation label for the button's success state.
 */
import { supabase } from '../../../lib/supabase'

export type ActionHandler = (payload: any) => Promise<string>

async function saveAlternative(payload: any): Promise<string> {
  const {
    product_id,
    company_id,
    supplier,
    title,
    url,
    thumbnail,
    price,
    moq,
    review_score,
    review_count,
    gold_supplier_years,
    country,
  } = payload || {}

  if (!company_id || !supplier) throw new Error('company_id y supplier requeridos')

  const { error } = await supabase.from('product_alternatives').upsert(
    {
      product_id: product_id || null,
      company_id,
      supplier,
      title: title || null,
      url: url || null,
      thumbnail: thumbnail || null,
      price: price || null,
      moq: moq || null,
      review_score: review_score ?? null,
      review_count: review_count ?? null,
      gold_supplier_years: gold_supplier_years ?? null,
      country: country || null,
      source: 'alibaba',
    },
    { onConflict: 'product_id,supplier,url' },
  )
  if (error) throw error
  return `✓ ${supplier} guardado como alternativa`
}

export const ACTIONS: Record<string, ActionHandler> = {
  save_alternative: saveAlternative,
}
