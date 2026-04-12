import { defineTool, getSupabase, err, json } from '@proto/core-mcp'
import { z } from 'zod'

export default [
  defineTool({
    name: 'create_item',
    description: 'Create a new item.',
    schema: {
      company_id: z.string(),
      name: z.string(),
      description: z.string().optional(),
    },
    handler: async (args) => {
      const db = getSupabase()
      const { data, error } = await db
        .from('items')
        .insert({ company_id: args.company_id, name: args.name, description: args.description })
        .select()
        .single()
      return error ? err(error.message) : json(data)
    },
  }),

  defineTool({
    name: 'list_items',
    description: 'List all items for a company.',
    schema: {
      company_id: z.string(),
    },
    handler: async (args) => {
      const db = getSupabase()
      const { data, error } = await db
        .from('items')
        .select('*')
        .eq('company_id', args.company_id)
        .order('created_at', { ascending: false })
      return error ? err(error.message) : json(data)
    },
  }),

  defineTool({
    name: 'update_item',
    description: 'Update an existing item.',
    schema: {
      item_id: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
    },
    handler: async (args) => {
      const db = getSupabase()
      const updates: Record<string, unknown> = {}
      if (args.name !== undefined) updates.name = args.name
      if (args.description !== undefined) updates.description = args.description
      const { data, error } = await db
        .from('items')
        .update(updates)
        .eq('id', args.item_id)
        .select()
        .single()
      return error ? err(error.message) : json(data)
    },
  }),
]
