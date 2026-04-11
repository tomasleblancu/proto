import { z } from 'zod'
import { ORDER_STATUSES, DOC_TYPES } from './constants.js'

export const chatRequestSchema = z.object({
  company_id: z.string(),
  user_id: z.string(),
  message: z.string(),
  channel: z.string().default('whatsapp'),
  session_key: z.string().optional(),
  enabled_skills: z.array(z.string()).default([]),
  company_context: z.string().optional(),
  selected_files: z.array(z.string()).default([]),
  output_format: z.string().optional(),
  system_instructions: z.string().optional(),
})

export type ChatRequest = z.infer<typeof chatRequestSchema>

export interface ChatResponse {
  response: string
  session_id: string
  duration_ms: number
  cost_usd?: number
}

export interface SSEEvent {
  type: 'init' | 'text' | 'tool_use' | 'tool_result' | 'result' | 'error' | 'thinking'
  [key: string]: unknown
}

export const orderStatusSchema = z.enum(ORDER_STATUSES)
export const docTypeSchema = z.enum(DOC_TYPES)

export const productSchema = z.object({
  name: z.string(),
  hs_code: z.string().optional(),
  quantity: z.number(),
  unit_price: z.number(),
  currency: z.string().default('USD'),
})

export type Product = z.infer<typeof productSchema>
