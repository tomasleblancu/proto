import { z } from 'zod'

/**
 * Framework-level chat protocol shared between gateway and web.
 * Domain-specific schemas live in the app under app/shared/.
 */
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
