import { z } from 'zod'
import { defineTool, getSupabase } from '@tleblancureta/proto/mcp'

export default [
  defineTool({
    name: 'create_reorder_rule',
    description: 'Define a reorder rule for a product with a known supplier.',
    schema: {
      company_id: z.string().describe('Company ID'),
      supplier_name: z.string().describe('Supplier name'),
      product_description: z.string().describe('Product description'),
      quantity: z.number().describe('Quantity to reorder'),
      frequency_days: z.number().describe('Reorder frequency in days'),
      lead_time_days: z.number().default(0).describe('Lead time in days'),
    },
    handler: async (args) => {
      const db = getSupabase()
      const nextDate = new Date()
      nextDate.setDate(nextDate.getDate() + args.frequency_days)

      const { data, error } = await db.from('reorder_rules').insert({
        company_id: args.company_id,
        supplier_name: args.supplier_name,
        product_description: args.product_description,
        quantity: args.quantity,
        frequency_days: args.frequency_days,
        lead_time_days: args.lead_time_days,
        next_order_date: nextDate.toISOString().split('T')[0],
        active: true,
      }).select().single()

      if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }] }
      return { content: [{ type: 'text' as const, text: `Reorder rule created: ${args.product_description} every ${args.frequency_days} days. Next order: ${nextDate.toISOString().split('T')[0]}` }] }
    },
  }),

  defineTool({
    name: 'check_reorders',
    description: 'Check which products are due for reorder based on their rules.',
    schema: {
      company_id: z.string().optional().describe('Filter by company'),
    },
    handler: async (args) => {
      const db = getSupabase()
      const today = new Date().toISOString().split('T')[0]

      let query = db.from('reorder_rules')
        .select('*')
        .eq('active', true)
        .lte('next_order_date', today)

      if (args.company_id) query = query.eq('company_id', args.company_id)

      const { data, error } = await query
      if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }] }

      if (!data || data.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No products due for reorder.' }] }
      }

      const summary = data.map(r =>
        `- ${r.product_description} from ${r.supplier_name} (qty: ${r.quantity}, due: ${r.next_order_date})`
      ).join('\n')

      return { content: [{ type: 'text' as const, text: `Products due for reorder:\n${summary}` }] }
    },
  }),

  defineTool({
    name: 'trigger_reorder',
    description: 'Create a new order from an existing reorder rule. Updates the rule\'s last_ordered_at and next_order_date.',
    schema: {
      rule_id: z.string().describe('Reorder rule ID'),
    },
    handler: async (args) => {
      const db = getSupabase()

      const { data: rule, error: ruleError } = await db
        .from('reorder_rules')
        .select('*')
        .eq('id', args.rule_id)
        .single()

      if (ruleError || !rule) {
        return { content: [{ type: 'text' as const, text: 'Error: Reorder rule not found' }] }
      }

      if (!rule.active) {
        return { content: [{ type: 'text' as const, text: 'Error: Reorder rule is inactive' }] }
      }

      const { data: order, error: orderError } = await db.from('orders').insert({
        company_id: rule.company_id,
        supplier_name: rule.supplier_name,
        products: [{ name: rule.product_description, quantity: rule.quantity }],
        status: 'draft',
      }).select().single()

      if (orderError) {
        return { content: [{ type: 'text' as const, text: `Error creating order: ${orderError.message}` }] }
      }

      const now = new Date()
      const nextDate = new Date()
      nextDate.setDate(now.getDate() + rule.frequency_days)

      await db.from('reorder_rules').update({
        last_ordered_at: now.toISOString(),
        next_order_date: nextDate.toISOString().split('T')[0],
      }).eq('id', args.rule_id)

      await db.from('order_events').insert({
        order_id: order.id,
        event_type: 'created_from_reorder',
        description: `Auto-created from reorder rule for ${rule.product_description}`,
        metadata: { rule_id: rule.id },
      })

      return {
        content: [{
          type: 'text' as const,
          text: `Reorder triggered. New order ${order.id} created for ${rule.product_description} (qty: ${rule.quantity}). Next reorder: ${nextDate.toISOString().split('T')[0]}`,
        }],
      }
    },
  }),

  defineTool({
    name: 'list_reorder_rules',
    description: 'List all reorder rules, optionally filtered by company.',
    schema: {
      company_id: z.string().optional().describe('Filter by company'),
      active_only: z.boolean().default(true).describe('Only show active rules'),
    },
    handler: async (args) => {
      const db = getSupabase()
      let query = db.from('reorder_rules').select('*').order('next_order_date', { ascending: true })

      if (args.company_id) query = query.eq('company_id', args.company_id)
      if (args.active_only) query = query.eq('active', true)

      const { data, error } = await query
      if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }] }
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
    },
  }),
]
